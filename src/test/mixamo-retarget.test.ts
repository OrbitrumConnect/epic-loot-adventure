import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { retargetTwist } from '@/components/world/mixamo-retarget';

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
  const n = ({ SCALAR: 1, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type]!;
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

/** Mede: junta mais girada vs a pose em que a malha foi presa, e pior erro de direção dos membros. */
function measure(clip: THREE.AnimationClip, applied: THREE.AnimationClip, srcRoot: THREE.Object3D, tgtRoot: THREE.Object3D, standFixX = 0) {
  const shown = new THREE.Object3D(); // grupo de correção de pé (igual ao jogo)
  shown.rotation.x = standFixX;
  shown.add(tgtRoot);
  const S = byName(srcRoot), T = byName(tgtRoot);
  const restT = new Map([...T].map(([n, o]) => [n, o.quaternion.clone()]));
  const restS = new Map([...S].map(([n, o]) => [n, o.quaternion.clone()]));
  // Tronco + pernas: é onde o giro de ~180° "embrulha" a cintura. (Braço: a malha foi presa
  // em outra pose — medido à parte, só não pode piorar.)
  const JOINTS = ['Spine', 'Spine1', 'Spine2', 'LeftUpLeg', 'LeftLeg', 'RightUpLeg', 'RightLeg'].map((b) => `mixamorig${b}`);
  const ARMS = ['LeftArm', 'RightArm', 'LeftForeArm', 'RightForeArm'].map((b) => `mixamorig${b}`);
  const PAIRS = [['Hips', 'Spine2'], ['LeftArm', 'LeftForeArm'], ['LeftForeArm', 'LeftHand'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot']].map((p) => p.map((b) => `mixamorig${b}`));
  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const ms = new THREE.AnimationMixer(srcRoot), mt = new THREE.AnimationMixer(tgtRoot);
  ms.clipAction(clip).play(); mt.clipAction(applied).play();
  let def = 0, src = 0, dir = 0, standing = true;
  const armWorld = new Map<string, THREE.Quaternion>();
  for (const f of [0.1, 0.35, 0.6, 0.85]) {
    ms.setTime(clip.duration * f); mt.setTime(applied.duration * f);
    srcRoot.updateMatrixWorld(true); shown.updateMatrixWorld(true);
    const head = T.get('mixamorigHead'), foot = T.get('mixamorigLeftFoot');
    if (head && foot && !(wp(head).y > wp(foot).y)) standing = false;
    for (const b of JOINTS) {
      const o = T.get(b), s = S.get(b);
      if (!o || !s) continue;
      def = Math.max(def, deg(o.quaternion.angleTo(restT.get(b)!)));
      src = Math.max(src, deg(s.quaternion.angleTo(restS.get(b)!)));
    }
    for (const b of ARMS) { const o = T.get(b); if (o) armWorld.set(`${b}@${f}`, o.getWorldQuaternion(new THREE.Quaternion())); }
    for (const [p, c] of PAIRS) {
      const a = S.get(p!), bb = S.get(c!), x = T.get(p!), y = T.get(c!);
      if (!a || !bb || !x || !y) continue;
      dir = Math.max(dir, deg(wp(bb).sub(wp(a)).normalize().angleTo(wp(y).sub(wp(x)).normalize())));
    }
  }
  return { def, src, dir, armWorld, standing };
}

describe('inimigos Mixamo (standFix 90°): nunca pior que hoje (GLB reais)', () => {
  // Só os ligados em raider.tsx (twistFix). spiked/pirate/swamp pioravam ~3° em algum quadro → desligados.
  for (const m of ['scrap_brute', 'rope_archer', 'alien_brute']) {
    for (const name of ['idle', 'walk', 'attack']) {
      it(`${m} · ${name}: menos giro, mesma direção, braços iguais, em pé`, () => {
        const cg = glb(`public/models/red/${name}.glb`);
        const tg = glb(`public/models/raiders/${m}.glb`);
        const clip = clipOf(cg);
        const fixed = retargetTwist(clip, skeleton(cg), skeleton(tg), Math.PI / 2);
        const now = measure(clip, clip, skeleton(cg), skeleton(tg), Math.PI / 2);
        const after = measure(clip, fixed, skeleton(cg), skeleton(tg), Math.PI / 2);
        expect(after.def).toBeLessThanOrEqual(now.def + 0.5);
        expect(after.dir).toBeLessThanOrEqual(now.dir + 1);
        for (const [k, q] of now.armWorld) expect(deg(q.angleTo(after.armWorld.get(k)!))).toBeLessThan(0.5);
        expect(after.standing).toBe(now.standing);
      });
    }
  }
});

describe('herói: animação Mixamo sem "embrulhar" a cintura (GLB reais)', () => {
  for (const name of ['idle', 'walk', 'run', 'attack', 'attack_gun',
    // extras do jogador (22/10): strafe/costas, golpe, gesto de poder, combo de espada
    'move_gun_left', 'move_gun_right', 'move_gun_back', 'move_gun_back_run', 'move_bow_left', 'move_bow_right',
    'move_bow_back', 'hit_1', 'hit_2', 'cast', 'slash_1', 'slash_2', 'slash_3']) {
    it(`${name}: juntas giram como na animação original e os membros apontam igual`, () => {
      const cg = glb(`public/models/red/${name}.glb`);
      const hero = glb('public/models/red/hero-preview.glb');
      const clip = clipOf(cg);
      const fixed = retargetTwist(clip, skeleton(cg), skeleton(hero), 0);
      const now = measure(clip, clip, skeleton(cg), skeleton(hero));
      const after = measure(clip, fixed, skeleton(cg), skeleton(hero));
      expect(now.def).toBeGreaterThan(150);              // o defeito existe hoje (giro ~180°)
      expect(after.def).toBeLessThanOrEqual(now.src + 20);   // e fica perto do original (perna da malha presa um pouco mais aberta)
      expect(after.dir).toBeLessThanOrEqual(8);           // e os membros seguem apontando certo
      for (const [k, q] of now.armWorld) expect(deg(q.angleTo(after.armWorld.get(k)!))).toBeLessThan(0.5); // braços IDÊNTICOS a hoje
    });
  }
});
