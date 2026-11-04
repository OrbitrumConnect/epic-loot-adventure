import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseBonesToBind, retargetBind } from '@/components/world/mixamo-retarget';
import { PALM_K } from '@/components/world/glb-hero-mixamo';
import { HERO_EXTRA_CLIPS } from '@/components/world/hero-moves';
import { HERO_SKINS } from '@/game/data/hero-skins';

/* Pedro 03/11 (fotos pulando/agachado/mirando): "o fuzil não está apoiado na mão da frente e não encosta na mão de trás
   quando apontado". O fuzil do jogador agora vai com o PUNHO na palma direita e o cano passando pela palma ESQUERDA em
   toda pose de fuzil; parado/andando/correndo com o fuzil na mão = clips do Shooter Pack com a arma pronta. MEDIDO aqui,
   nos GLB reais: nas poses de fuzil a mão esquerda fica NA FRENTE da direita (o cano aponta pra frente do corpo) a uma
   distância que cabe no guarda-mão do fuzil — a arma encosta nas duas mãos. */
function glb(f: string) { const b = fs.readFileSync(f), jl = b.readUInt32LE(12); return { json: JSON.parse(b.subarray(20, 20 + jl).toString()), bin: b.subarray(20 + jl + 8) }; }
type G = ReturnType<typeof glb>;
function acc(g: G, i: number): Float32Array {
  const a = g.json.accessors[i], bv = g.json.bufferViews[a.bufferView];
  const n = ({ SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type]!;
  const off = g.bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new Float32Array(g.bin.buffer.slice(off, off + a.count * n * 4));
}
const clean = (s: string) => s.replace(/[:.\[\]/]/g, '');
function skeleton(g: G): THREE.Object3D {
  const objs = g.json.nodes.map((n: { name?: string; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }) => {
    const o = new THREE.Object3D(); o.name = clean(n.name ?? '');
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else { if (n.translation) o.position.fromArray(n.translation); if (n.rotation) o.quaternion.fromArray(n.rotation); if (n.scale) o.scale.fromArray(n.scale); }
    return o;
  });
  g.json.nodes.forEach((n: { children?: number[] }, i: number) => (n.children ?? []).forEach((c) => objs[i].add(objs[c])));
  const root = new THREE.Object3D();
  for (const i of g.json.scenes[g.json.scene ?? 0].nodes) root.add(objs[i]);
  return root;
}
const byName = (r: THREE.Object3D) => { const m = new Map<string, THREE.Object3D>(); r.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); }); return m; };
function bindSkeleton(g: G): THREE.Object3D {
  const r = skeleton(g); r.updateMatrixWorld(true);
  const M = byName(r), skin = g.json.skins[0], ibm = acc(g, skin.inverseBindMatrices);
  const bones = skin.joints.map((j: number) => M.get(clean(String(g.json.nodes[j].name)))!);
  poseBonesToBind(bones, bones.map((_: unknown, k: number) => new THREE.Matrix4().fromArray(Array.from(ibm.subarray(k * 16, k * 16 + 16)))));
  return r;
}
function clipOf(g: G): THREE.AnimationClip {
  const an = g.json.animations[0];
  const tracks = an.channels.flatMap((ch: { sampler: number; target: { node: number; path: string } }) => {
    const name = clean(String(g.json.nodes[ch.target.node].name));
    const t = Array.from(acc(g, an.samplers[ch.sampler].input)), v = Array.from(acc(g, an.samplers[ch.sampler].output));
    if (ch.target.path === 'rotation') return [new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, t, v)];
    if (ch.target.path === 'translation') return [new THREE.VectorKeyframeTrack(`${name}.position`, t, v)];
    return [];
  });
  return new THREE.AnimationClip('c', -1, tracks);
}
const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
/** palma = pulso + (pulso − cotovelo) × PALM_K — a MESMA conta do jogo (glb-hero-mixamo). */
const palm = (M: Map<string, THREE.Object3D>, side: 'Right' | 'Left') => {
  const h = wp(M.get(`mixamorig${side}Hand`)!), f = wp(M.get(`mixamorig${side}ForeArm`)!);
  return h.clone().addScaledVector(h.clone().sub(f), PALM_K);
};

describe('fuzil nas duas mãos (palma direita no punho, palma esquerda no guarda-mão)', () => {
  const clips = ['aim_gun_idle', 'rifle_walk', 'rifle_run', 'attack_gun'];
  for (const id of ['homem', 'mulher', 'mercenario'] as const) {
    it(`${id}: nas poses de fuzil a mão da frente fica na frente e cabe no guarda-mão`, () => {
      const g = glb('public' + HERO_SKINS[id].url);
      const ds: number[] = [];
      for (const name of clips) {
        const cg = glb(`public/models/red/${name}.glb`), clip = clipOf(cg);
        const root = bindSkeleton(g);
        const c = retargetBind(clip, skeleton(cg), bindSkeleton(g), 0, skeleton(g));
        const mx = new THREE.AnimationMixer(root); mx.clipAction(c).play();
        for (const f of [0.1, 0.4, 0.7, 0.95]) {
          mx.setTime(c.duration * f); root.updateMatrixWorld(true);
          const M = byName(root);
          const head = wp(M.get('mixamorigHead')!), hips = wp(M.get('mixamorigHips')!);
          const unit = head.distanceTo(hips); // ~0,6 m num herói de 1,8 m (independe da escala do GLB)
          const R = palm(M, 'Right'), L = palm(M, 'Left');
          const d = R.distanceTo(L) / unit;
          // medido 03/11: 0,57–0,71 tronco entre as palmas; esquerda 0,58–0,69 tronco À FRENTE (+Z = frente do corpo)
          expect(d, `${name} ${f}`).toBeGreaterThan(0.5); expect(d, `${name} ${f}`).toBeLessThan(0.8);
          expect((L.z - R.z) / unit, `${name} ${f}`).toBeGreaterThan(0.5);
          ds.push(d);
        }
      }
      // as duas mãos seguram um objeto RÍGIDO: a distância entre as palmas quase não muda entre poses (medido ≤ 0,05)
      expect(Math.max(...ds) - Math.min(...ds)).toBeLessThan(0.08);
    });
  }

  it('no jogo: duas mãos em TODA pose de fuzil do jogador; parado/andando/correndo de fuzil = clips com a arma pronta', () => {
    const h = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(h).toMatch(/const twoHands = rifle && \(aiming \|\| \/gun\|rifle\/i\.test\(playingNow \?\? ''\)\);/);
    expect(h).toMatch(/const R = palm\(handBone, rightForeBone, tmpAimR\), L = palm\(leftHandBone, leftForeBone, tmpAimL\);/);
    expect(h).toMatch(/w\.position\.copy\(gripPosLocal\)\.lerp\(posLocal, aimW\.current\);/); // punho na palma direita
    expect(h).toMatch(/<group ref=\{holderRef\} quaternion=\{handFixQ\}>/);
    expect(h).toMatch(/const rn = want === 'idle' \? 'aimGunIdle' : want === 'walk' \? 'rifleWalk' : 'rifleRun';/);
    expect(h).toMatch(/heldKind === 'rifle' && \(want === 'idle' \|\| want === 'walk' \|\| want === 'run'\)/); // só fuzil (pistola/espada/arco como antes)
    expect(HERO_EXTRA_CLIPS.rifleWalk).toBe('/models/red/rifle_walk.glb');
    expect(HERO_EXTRA_CLIPS.rifleRun).toBe('/models/red/rifle_run.glb');
    expect(PALM_K).toBeGreaterThan(0.2); expect(PALM_K).toBeLessThan(0.4);
  });
});
