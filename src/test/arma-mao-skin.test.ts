import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseBonesToBind, retargetBind, retargetTwist } from '@/components/world/mixamo-retarget';
import { HERO_SKINS } from '@/game/data/hero-skins';

/* Pedro 03/11 (foto mirando de fuzil): "a arma ficou errada, precisa ajustar na mão dele". A arma é filha do osso da MÃO
   com a pega (gripPos/gripRot) acertada nos eixos da mão do herói de antes; os ossos dos modelos novos têm outra
   orientação de repouso (até ~178°) → a arma saía torta. MEDIDO aqui, nos GLB reais: a mesma animação no herói antigo
   (encaixe twistFix, como era) e na skin nova (bindFix, como é) → a diferença da mão é uma rotação FIXA (a mesma em
   todas as poses), a `handFix` da skin — o grupo da arma ganha essa rotação e volta a ficar como no herói antigo. */
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
const deg = (r: number) => (r * 180) / Math.PI;
const handQ = (root: THREE.Object3D) => { root.updateMatrixWorld(true); return byName(root).get('mixamorigRightHand')!.getWorldQuaternion(new THREE.Quaternion()); };

/** Mão da skin NOVA × mão do herói ANTIGO, na mesma animação/instante: C = novo⁻¹ · antigo (em vários quadros). */
function handOffsets(skinUrl: string) {
  const red = glb('public/models/red/hero-preview.glb'), nw = glb('public' + skinUrl);
  const out: THREE.Quaternion[] = [];
  for (const name of ['idle', 'aim_gun_idle', 'run', 'attack_gun']) {
    const cg = glb(`public/models/red/${name}.glb`), clip = clipOf(cg);
    const redRoot = skeleton(red), newRoot = bindSkeleton(nw);
    const redClip = retargetTwist(clip, skeleton(cg), skeleton(red), 0);
    const newClip = retargetBind(clip, skeleton(cg), bindSkeleton(nw), 0, skeleton(nw));
    const mr = new THREE.AnimationMixer(redRoot), mn = new THREE.AnimationMixer(newRoot);
    mr.clipAction(redClip).play(); mn.clipAction(newClip).play();
    for (const f of [0.1, 0.4, 0.7, 0.95]) {
      mr.setTime(redClip.duration * f); mn.setTime(newClip.duration * f);
      out.push(handQ(newRoot).invert().multiply(handQ(redRoot)));
    }
  }
  return out;
}

describe('arma na mão das skins novas (homem / mulher)', () => {
  for (const id of ['homem', 'mulher', 'mercenario'] as const) {
    it(`${id}: a diferença da mão é FIXA (mesma em todas as poses) e a handFix da skin é ela`, () => {
      const offs = handOffsets(HERO_SKINS[id].url);
      // média (quaternions do mesmo hemisfério) e espalhamento
      const ref = offs[0]!, avg = new THREE.Quaternion(0, 0, 0, 0);
      for (const q of offs) { const s = q.dot(ref) < 0 ? -1 : 1; avg.x += q.x * s; avg.y += q.y * s; avg.z += q.z * s; avg.w += q.w * s; }
      avg.normalize();
      const spread = Math.max(...offs.map((q) => deg(q.angleTo(avg))));
      expect(spread).toBeLessThan(2); // medido 03/11: 0,0° em 16 quadros (4 animações × 4 instantes)
      const saved = new THREE.Quaternion(...HERO_SKINS[id].handFix).normalize();
      expect(deg(saved.angleTo(avg)), `medida: [${avg.toArray().map((v) => v.toFixed(4)).join(', ')}]`).toBeLessThan(1); // a guardada na skin é a medida
    });
  }

  it('no jogo: suporte da arma gira a handFix (a mira compensa); FUZIL do jogador no tiro = cano da mão direita à esquerda', () => {
    const h = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(h).toMatch(/<group ref=\{holderRef\} quaternion=\{handFixQ\}>\s*<group\s+ref=\{weaponRef\}/);
    expect(h).toMatch(/aimLocal\.premultiply\(handFixInv\);/);
    expect(h).toMatch(/const heldK = heldKindFor\(.*\);\s*const rifle = rangedAttack && !!leftHandBone && heldK === 'rifle';/); // só jogadores, só fuzil
    expect(h).toMatch(/tmpAimM\.makeBasis\(side, up, fwd\)/);
    expect(h).toMatch(/\(mat as THREE\.MeshStandardMaterial\)\.color\?\.setScalar\(tone\)/); // clarear: absoluto, não acumula
    const body = fs.readFileSync('src/components/world/hero-skin-body.tsx', 'utf8');
    expect(body).toMatch(/handFix=\{skin\.handFix\} tone=\{skin\.tone\}/);
    expect(fs.readFileSync('src/components/world/remote-players.tsx', 'utf8').match(/handFix=\{skin\.handFix\} tone=\{skin\.tone\}/g)).toHaveLength(2);
    for (const id of ['homem', 'mulher', 'mercenario'] as const) { expect(HERO_SKINS[id].tone).toBeGreaterThan(1.2); expect(HERO_SKINS[id].tone).toBeLessThan(1.35); } // ~+12% na tela
  });
});
