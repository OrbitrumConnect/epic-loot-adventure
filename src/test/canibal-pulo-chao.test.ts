import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { plantFeet, poseBonesToBind, retargetBind } from '@/components/world/mixamo-retarget';

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
    o.name = (n.name ?? '').replace(/[:.[\]/]/g, '');
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
    const name = String(g.json.nodes[ch.target.node].name).replace(/[:.[\]/]/g, '');
    const t = Array.from(acc(g, an.samplers[ch.sampler].input));
    const v = Array.from(acc(g, an.samplers[ch.sampler].output));
    if (ch.target.path === 'rotation') return [new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, t, v)];
    if (ch.target.path === 'translation') return [new THREE.VectorKeyframeTrack(`${name}.position`, t, v)];
    return [];
  });
  return new THREE.AnimationClip('c', -1, tracks);
}
const byName = (r: THREE.Object3D) => { const m = new Map<string, THREE.Object3D>(); r.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); }); return m; };
function bindSkeleton(g: G): THREE.Object3D {
  const r = skeleton(g); r.updateMatrixWorld(true);
  const M = byName(r), skin = g.json.skins[0], ibm = acc(g, skin.inverseBindMatrices);
  const bones = skin.joints.map((j: number) => M.get(String(g.json.nodes[j].name).replace(/[:.[\]/]/g, ''))!);
  poseBonesToBind(bones, bones.map((_: unknown, k: number) => new THREE.Matrix4().fromArray(Array.from(ibm.subarray(k * 16, k * 16 + 16)))));
  return r;
}
/* Pedro, 06/11: "quando ele pula o corpo entra metade pra baixo do chão ao aterrissar no ataque". Medido no jogo: em pé
   o quadril fica a 11 m e no pulo descia a 0,2 m — a malha ia 10,7 m pra baixo do chão. Causa: os clips básicos do
   Canibal (parado/andar/correr/golpe) usam o quadril TRAVADO na altura de ligação; o pulo e o rugido (clips extras) iam
   com o quadril LIVRE, e a altura que vem do Mixamo nesse esqueleto é ~100× menor (≈ 0). Conserto: `plantFeet`. */
const H = (b: string) => `mixamorig${b}`;
/** o jeito do jogo: retarget pelo mundo + o idle com o quadril travado na altura de ligação (modelo "fooled") */
function game(nm: string) {
  const tg = glb('public/models/raiders/cannibal.glb'), cg = glb(`public/models/mutant/${nm}.glb`), clip = clipOf(cg);
  return { tg, cg, clip, baked: retargetBind(clip, skeleton(cg), bindSkeleton(tg), 0, skeleton(tg)) };
}
function pinnedIdle(): { idle: THREE.AnimationClip; tgt: THREE.Object3D } {
  const { tg, baked } = game('idle');
  const tgt = bindSkeleton(tg), hipsY = byName(tgt).get(H('Hips'))!.position.y;
  const idle = baked.clone();
  idle.tracks = idle.tracks.map((t) => {
    if (!/Hips\.position$/.test(t.name)) return t;
    const v = Float32Array.from(t.values); for (let i = 1; i < v.length; i += 3) v[i] = hipsY;
    return new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v));
  });
  return { idle, tgt };
}
/** pé mais baixo (mundo do modelo) em cada fração [from..to] do clip */
function feet(clip: THREE.AnimationClip, root: THREE.Object3D, from: number, to: number, n = 48): number[] {
  const r = root.clone(true), w = new THREE.Object3D(); w.add(r);
  const T = byName(r), mx = new THREE.AnimationMixer(r), a = mx.clipAction(clip);
  a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.play();
  const v = new THREE.Vector3(), out: number[] = [];
  for (let i = 0; i <= n; i++) {
    mx.setTime(clip.duration * (from + ((to - from) * i) / n)); w.updateMatrixWorld(true);
    out.push(Math.min(...['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((b) => T.get(H(b))!.getWorldPosition(v).y)));
  }
  return out;
}
function srcFeet(nm: string, from: number, to: number, n = 48): number[] {
  const { cg, clip } = game(nm);
  return feet(clip, skeleton(cg), from, to, n);
}

describe('Canibal: pulo e rugido com o PÉ NO CHÃO (06/11)', () => {
  const { idle, tgt } = pinnedIdle();
  const stand = feet(idle, tgt, 0, 0, 1)[0]!;
  const body = (() => { const T = byName(tgt), v = new THREE.Vector3(); return T.get(H('Head'))!.getWorldPosition(v).y - stand; })();
  for (const [nm, from, to] of [['leap', 0.07, 0.55], ['roar', 0, 0.6]] as const) {
    it(`${nm}: antes afundava; agora o pé fica no chão onde a animação pisa e nunca entra no chão`, () => {
      const { cg, clip, baked } = game(nm);
      const before = feet(baked, tgt, from, to);
      const after = feet(plantFeet(baked, clip, skeleton(cg), tgt, 0, idle), tgt, from, to);
      const src = srcFeet(nm, from, to), g0 = Math.min(...src), sb = Math.max(...src) - g0;
      // o defeito existia: com o quadril livre o pé ia bem pra baixo do chão (medido no jogo: metade do corpo)
      expect(Math.min(...before) - stand).toBeLessThan(-0.3 * body);
      // agora: em nenhum quadro o pé entra no chão (folga de 1% do corpo)…
      expect(Math.min(...after) - stand).toBeGreaterThan(-0.01 * body);
      // …e nos quadros em que a animação original pisa, o pé está NO chão (sem flutuar)
      for (let i = 0; i < src.length; i++) {
        if (src[i]! - g0 > 0.01 * Math.max(1, sb)) continue;
        expect(Math.abs(after[i]! - stand), `${nm} quadro ${i}`).toBeLessThan(0.02 * body);
      }
    });
  }
  it('o Canibal liga o pé no chão no pulo e no rugido (raider.tsx)', () => {
    const s = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(s).toMatch(/leap: \{ from: 0\.07, to: 0\.55, speed: 1\.46, plant: true \}, roar: \{ to: 0\.6, speed: 1\.4, plant: true \}/);
  });
});
