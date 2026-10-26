import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseBonesToBind, retargetBind, retargetTwist, withoutHipsMotion } from '@/components/world/mixamo-retarget';

/* Lê o GLB REAL direto (JSON + binário), sem loader de textura: esqueleto + clip. */
function glb(f: string) {
  const b = fs.readFileSync(f);
  const jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + jl).toString()), bin: b.subarray(20 + jl + 8) };
}
type G = ReturnType<typeof glb>;
function acc(g: G, i: number): Float32Array {
  const a = g.json.accessors[i];
  const bv = g.json.bufferViews[a.bufferView];
  const n = ({ SCALAR: 1, VEC3: 3, VEC4: 4, MAT4: 16 } as Record<string, number>)[a.type]!;
  const off = g.bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
  return new Float32Array(g.bin.buffer.slice(off, off + a.count * n * 4));
}
function skeleton(g: G): THREE.Object3D {
  const objs = g.json.nodes.map((n: { name?: string; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }) => {
    const o = new THREE.Object3D();
    o.name = (n.name ?? '').replace(/[:.\[\]/]/g, ''); // igual ao GLTFLoader
    if (n.matrix) new THREE.Matrix4().fromArray(n.matrix).decompose(o.position, o.quaternion, o.scale);
    else {
      if (n.translation) o.position.fromArray(n.translation);
      if (n.rotation) o.quaternion.fromArray(n.rotation);
      if (n.scale) o.scale.fromArray(n.scale);
    }
    return o;
  });
  g.json.nodes.forEach((n: { children?: number[] }, i: number) => (n.children ?? []).forEach((c) => objs[i].add(objs[c])));
  const root = new THREE.Object3D();
  for (const i of g.json.scenes[g.json.scene ?? 0].nodes) root.add(objs[i]);
  return root;
}
function clipOf(g: G): THREE.AnimationClip {
  const an = g.json.animations[0];
  const tracks = an.channels.flatMap((ch: { sampler: number; target: { node: number; path: string } }) => {
    const name = String(g.json.nodes[ch.target.node].name).replace(/[:.\[\]/]/g, '');
    const t = Array.from(acc(g, an.samplers[ch.sampler].input));
    const v = Array.from(acc(g, an.samplers[ch.sampler].output));
    if (ch.target.path === 'rotation') return [new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, t, v)];
    if (ch.target.path === 'translation') return [new THREE.VectorKeyframeTrack(`${name}.position`, t, v)];
    return [];
  });
  return new THREE.AnimationClip('c', -1, tracks);
}
const byName = (r: THREE.Object3D) => { const m = new Map<string, THREE.Object3D>(); r.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); }); return m; };
const deg = (r: number) => (r * 180) / Math.PI;

function bindSkeleton(g: G): THREE.Object3D {
  const r = skeleton(g); r.updateMatrixWorld(true);
  const M = byName(r), skin = g.json.skins[0], ibm = acc(g, skin.inverseBindMatrices);
  const bones = skin.joints.map((j: number) => M.get(String(g.json.nodes[j].name).replace(/[:.\[\]/]/g, ''))!);
  poseBonesToBind(bones, bones.map((_: unknown, k: number) => new THREE.Matrix4().fromArray(Array.from(ibm.subarray(k * 16, k * 16 + 16)))));
  return r;
}
/* Pedro, 26/10: "Mixamo tem animação de morte caída de costas? o corpo cai ali no vermelho e some". Baixados: "Falling
   Back Death" (herói/acampamento) e "Mutant Dying" (Couraça, Fúngico, Brutamontes). MEDIDO nos GLB reais (ossos): no
   fim da queda o corpo está DEITADO (cabeça baixa) e NO CHÃO (nem flutuando nem enterrado) — chão = pé na pose parada,
   que é onde o assentamento deixou o corpo antes de cair (caído ele não re-assenta). */
const H = (b: string) => `mixamorig${b}`;
const KEY = ['Head', 'Hips', 'Spine2', 'LeftFoot', 'RightFoot', 'LeftHand', 'RightHand', 'LeftShoulder', 'RightShoulder'].map(H);
function pose(applied: THREE.AnimationClip, tgt: THREE.Object3D, standFixX: number, t: number) {
  const w = new THREE.Object3D(); w.rotation.x = standFixX; w.add(tgt);
  const mx = new THREE.AnimationMixer(tgt); mx.clipAction(applied).play(); mx.setTime(t); w.updateMatrixWorld(true);
  const M = byName(tgt), y = (n: string) => M.get(n)!.getWorldPosition(new THREE.Vector3()).y;
  const ys = KEY.filter((n) => M.has(n)).map(y);
  return { head: y(H('Head')), low: Math.min(...ys), high: Math.max(...ys), foot: Math.min(y(H('LeftToeBase')), y(H('RightToeBase'))) };
}
type Case = { model: string; death: 'back' | 'mutant'; mode: 'bind' | 'twist'; fix: number };
const CASES: Case[] = [
  { model: 'raiders/spiked', death: 'mutant', mode: 'bind', fix: Math.PI / 2 },      // Couraça
  { model: 'raiders/alien_brute', death: 'mutant', mode: 'bind', fix: Math.PI / 2 }, // Fúngico
  { model: 'raiders/scrap_brute', death: 'mutant', mode: 'bind', fix: Math.PI / 2 }, // Brutamontes
  { model: 'raiders/pirate', death: 'back', mode: 'bind', fix: Math.PI / 2 },
  { model: 'raiders/swamp', death: 'back', mode: 'bind', fix: Math.PI / 2 },
  { model: 'raiders/rope_archer', death: 'back', mode: 'twist', fix: Math.PI / 2 },  // arqueiro (twistFix)
  { model: 'red/hero-preview', death: 'back', mode: 'twist', fix: 0 },                // herói
];

describe('morte: cai e fica DEITADO no chão (GLB reais)', () => {
  for (const c of CASES) {
    it(`${c.model} · ${c.death}`, () => {
      const tg = glb(`public/models/${c.model}.glb`);
      const apply = (name: string) => {
        const cg = glb(`public/models/red/${name}.glb`), clip = clipOf(cg);
        return c.mode === 'bind'
          ? { clip: retargetBind(clip, skeleton(cg), bindSkeleton(tg), c.fix, skeleton(tg)), root: () => bindSkeleton(tg) }
          : { clip: retargetTwist(clip, skeleton(cg), skeleton(tg), c.fix), root: () => skeleton(tg) };
      };
      const idle = apply('idle'), raw = apply(c.death === 'mutant' ? 'death_mutant' : 'death_back');
      const death = { clip: withoutHipsMotion(raw.clip), root: raw.root }; // igual ao jogo
      const stand = pose(idle.clip, idle.root(), c.fix, 0.5);
      const height = stand.head - stand.foot;
      const end = pose(death.clip, death.root(), c.fix, death.clip.duration - 0.01); // setTime(duração) volta ao início (loop)
      // No jogo, caído, o ponto mais baixo vai pro chão (assentamento) → mede o corpo a partir do ponto mais baixo.
      const r = { headK: (end.head - end.low) / height, spreadK: (end.high - end.low) / height };
      console.log(c.model, c.death, JSON.stringify({ height: +height.toFixed(3), headK: +r.headK.toFixed(2), spreadK: +r.spreadK.toFixed(2) }));
      expect(height).toBeGreaterThan(0);
      expect(r.headK).toBeLessThan(0.35);   // DEITADO: cabeça perto do chão (em pé = 1)
      expect(r.spreadK).toBeLessThan(0.5);  // corpo na horizontal (em pé ≈ 1)
    });
  }
});

describe('morte: regras do jogo', () => {
  it('no máximo 12 corpos caídos ao mesmo tempo (horda morrendo junta não pesa); sem vaga = some como antes', async () => {
    const { takeCorpseSlot, releaseCorpseSlot, corpseCount, MAX_CORPSES } = await import('@/components/world/hostile-ai');
    while (corpseCount() > 0) releaseCorpseSlot();
    for (let i = 0; i < MAX_CORPSES; i++) expect(takeCorpseSlot(4.17)).toBe(4.17);
    expect(takeCorpseSlot(4.17)).toBe(0); // 13º: some na hora
    releaseCorpseSlot();
    expect(takeCorpseSlot(4.17)).toBe(4.17);
    expect(takeCorpseSlot(0)).toBe(0); // bicho sem animação de morte: igual antes
    while (corpseCount() > 0) releaseCorpseSlot();
  }, 20_000);
  it('clip de morte sem a posição do quadril; retarget não "levanta" no último quadro', () => {
    const t = new THREE.VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 1, 0, 0, 0.2, 0]);
    const r = new THREE.QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [0, 0, 0, 1, 0, 0, 0, 1]);
    const c = withoutHipsMotion(new THREE.AnimationClip('d', 1, [t, r]));
    expect(c.tracks.map((x) => x.name)).toEqual(['mixamorigHips.quaternion']);
    const ret = fs.readFileSync('src/components/world/mixamo-retarget.ts', 'utf8');
    expect(ret).toMatch(/bakeAction\.setLoop\(THREE\.LoopOnce, 1\);\s*bakeAction\.clampWhenFinished = true;/);
  });
  it('ligado: raiders Mixamo caem e ficam caídos (clip + 2 s); Couraça/Fúngico/Brutamontes = Mutant; herói cai ao morrer', () => {
    const r = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(r).toMatch(/deathHoldS: mxBody \? DEATH_CLIP_S\[mxBody\.death \?\? 'back'\] \+ DEATH_LIE_S : 0,/);
    expect(r).toMatch(/onDeath: \(\) => \{ bossAction\.current = 'death'; \},/);
    expect(r.match(/death: 'mutant'/g)!.length).toBe(3);
    const hero = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(hero).toMatch(/if \(want === 'death'\) \{/);
    expect(hero).toMatch(/d\.setLoop\(THREE\.LoopOnce, 1\); d\.clampWhenFinished = true;/);
    expect(hero).toMatch(/return d && withoutHipsMotion\(d\);/);
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/if \(ps\.dead\) \{\s*\/\/[^\n]*\n\s*heroAction\.current = 'death';/);
    // Sangue com o MESMO tempo (Pedro: "o sangue já tem o tempo dele, não deve ser alterado").
    expect(fs.readFileSync('src/components/world/combat-feedback.tsx', 'utf8')).not.toMatch(/deathHold|DEATH_LIE/);
  });
});
