import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { poseBonesToBind, retargetBind, retargetTwist } from '@/components/world/mixamo-retarget';

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
  // alien_brute (Fúngico) saiu daqui em 24/10 → bindFix (ver abaixo).
  for (const m of ['scrap_brute', 'rope_archer']) {
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

/* 24/10 (Pedro: "o herói foi corrigido, eles não" — Couraça e Fúngico distorcidos). Causa MEDIDA: nesses
   GLB o esqueleto vem salvo numa pose DIFERENTE da pose em que a pele foi presa (até 96° no antebraço/perna;
   no herói 0°). Animar a partir dela torce a malha (cintura/coxa ~150–170° a mais que na animação).
   Correção: ossos na pose de ligação (`poseBonesToBind`) + retarget pelo mundo (`retargetBind`).
   Conferido também DESENHANDO a malha com a pele aplicada (hoje × novo): corpo reto, tanga cai normal. */
function bindSkeleton(g: G): THREE.Object3D {
  const r = skeleton(g); r.updateMatrixWorld(true);
  const M = byName(r), skin = g.json.skins[0], ibm = acc(g, skin.inverseBindMatrices);
  const bones = skin.joints.map((j: number) => M.get(String(g.json.nodes[j].name).replace(/[:.\[\]/]/g, ''))!);
  poseBonesToBind(bones, bones.map((_: unknown, k: number) => new THREE.Matrix4().fromArray(Array.from(ibm.subarray(k * 16, k * 16 + 16)))));
  return r;
}
/** Torção da PELE: giro relativo pai→filho desde a LIGAÇÃO, a mais do que na animação original; + direção; + pé. */
function skinMeasure(clip: THREE.AnimationClip, srcRoot: THREE.Object3D, applied: THREE.AnimationClip, tgtRoot: THREE.Object3D, bindRoot: THREE.Object3D) {
  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const wrap = (r: THREE.Object3D) => { const w = new THREE.Object3D(); w.rotation.x = Math.PI / 2; w.add(r); w.updateMatrixWorld(true); return w; };
  const wt = wrap(tgtRoot); wrap(bindRoot); srcRoot.updateMatrixWorld(true);
  const S = byName(srcRoot), T = byName(tgtRoot), B = byName(bindRoot);
  const restS = new Map([...S].map(([n, o]) => [n, wq(o)])), bindT = new Map([...B].map(([n, o]) => [n, wq(o)]));
  const H = (b: string) => `mixamorig${b}`;
  const PAIRS = [['Hips', 'Spine'], ['Spine', 'Spine1'], ['Spine1', 'Spine2'], ['Hips', 'LeftUpLeg'], ['LeftUpLeg', 'LeftLeg'], ['Hips', 'RightUpLeg'], ['RightUpLeg', 'RightLeg'], ['LeftLeg', 'LeftFoot']].map((p) => p.map(H));
  const LIMBS = [['Hips', 'Spine2'], ['LeftUpLeg', 'LeftLeg'], ['LeftLeg', 'LeftFoot'], ['RightUpLeg', 'RightLeg'], ['LeftArm', 'LeftForeArm']].map((p) => p.map(H));
  const ms = new THREE.AnimationMixer(srcRoot), mt = new THREE.AnimationMixer(tgtRoot);
  ms.clipAction(clip).play(); mt.clipAction(applied).play();
  let skin = 0, dir = 0, standing = true, foot = Infinity;
  for (let f = 0.05; f < 1; f += 0.1) {
    ms.setTime(clip.duration * f); mt.setTime(applied.duration * f); srcRoot.updateMatrixWorld(true); wt.updateMatrixWorld(true);
    const sk = (M: Map<string, THREE.Object3D>, R: Map<string, THREE.Quaternion>, n: string) => wq(M.get(n)!).multiply(R.get(n)!.clone().invert());
    for (const [p, c] of PAIRS) {
      const js = deg(sk(S, restS, p!).invert().multiply(sk(S, restS, c!)).angleTo(new THREE.Quaternion()));
      const jt = deg(sk(T, bindT, p!).invert().multiply(sk(T, bindT, c!)).angleTo(new THREE.Quaternion()));
      skin = Math.max(skin, jt - js);
    }
    for (const [p, c] of LIMBS) dir = Math.max(dir, deg(wp(S.get(c!)!).sub(wp(S.get(p!)!)).normalize().angleTo(wp(T.get(c!)!).sub(wp(T.get(p!)!)).normalize())));
    const feet = ['LeftFoot', 'RightFoot', 'LeftToeBase', 'RightToeBase'].map((b) => wp(T.get(H(b))!).y);
    if (!(wp(T.get(H('Head'))!).y > Math.max(...feet))) standing = false;
    foot = Math.min(foot, ...feet);
  }
  const height = wp(B.get(H('Head'))!).distanceTo(wp(B.get(H('LeftToeBase'))!)); // altura do corpo (cabeça→dedão)
  return { skin, dir, standing, foot, height };
}

describe('Couraça e Fúngico: pele sem torcer (pose de ligação + retarget pelo mundo, GLB reais)', () => {
  for (const [m, today] of [['spiked', 'cópia direta'], ['alien_brute', 'twist']] as const) {
    for (const name of ['idle', 'walk', 'attack']) {
      it(`${m} · ${name}: pele bem menos torcida, membros apontam certo, em pé, pé no mesmo lugar`, () => {
        const cg = glb(`public/models/red/${name}.glb`), tg = glb(`public/models/raiders/${m}.glb`), clip = clipOf(cg);
        const nowClip = today === 'twist' ? retargetTwist(clip, skeleton(cg), skeleton(tg), Math.PI / 2) : clip;
        const now = skinMeasure(clip, skeleton(cg), nowClip, skeleton(tg), bindSkeleton(tg));
        const fixed = retargetBind(clip, skeleton(cg), bindSkeleton(tg), Math.PI / 2, skeleton(tg));
        const after = skinMeasure(clip, skeleton(cg), fixed, bindSkeleton(tg), bindSkeleton(tg));
        // Medido: Couraça 126–128° → 41–45° (direção 28° → 0,6°); Fúngico 46° → 25–29° (direção 15° → 4,5°).
        // O que sobra é a dobra normal de levar o braço/perna da pose "A" da malha à pose da animação.
        expect(now.skin).toBeGreaterThan(40);                  // o defeito existe hoje
        expect(after.skin).toBeLessThan(now.skin - 15);        // bem menos torcido
        expect(after.skin).toBeLessThanOrEqual(50);
        expect(after.dir).toBeLessThanOrEqual(8);              // membros apontam como na animação
        expect(after.dir).toBeLessThan(now.dir);
        expect(after.standing).toBe(true);
        expect(Math.abs(after.foot - now.foot) / now.height).toBeLessThan(0.01); // pé onde estava (sem flutuar/afundar)
      });
    }
  }
});
