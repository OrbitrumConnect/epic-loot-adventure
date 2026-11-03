// ANDAR AGACHADO montado a partir do ANDAR do herói (02/11, Pedro: "abaixa ok, mas ao andar fica bugando").
// O "crouching" do pack Sword&Shield que estava em uso NÃO é andar agachado: é a transição agachado → em pé (o quadril
// sobe 0,45 → 0,88 em 0,5 s) — em loop, o boneco levantava e agachava sem parar. O pack não tem andar agachado.
// Aqui: o walk.glb (ciclo de 2 passos que emenda) com o quadril BAIXO, o tronco inclinado pra frente e o passo mais
// curto; as PERNAS por IK de 2 ossos — o pé vai exatamente aonde ia no andar (plantado no chão, sem patinar), joelho pra
// frente; o pé mantém a orientação do andar (chapado no chão); a cabeça compensa parte da inclinação (olha pra frente).
// Uso: node tools/crouch-walk-bake.mjs <walk.glb> <saida.glb>   (imprime a velocidade do clip → CROUCH_WALK_CLIP_SPEED)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import * as THREE from 'three';

/** quadril a esta fração da altura de pé · inclinação do tronco (graus) · passo (fração do andar) · cabeça compensa */
const CROUCH = { HIPS_K: 0.6, TILT_DEG: 24, STRIDE_K: 0.68, HEAD_BACK: 0.55 };

const [inp, out] = process.argv.slice(2);
if (!inp || !out) throw new Error('uso: node tools/crouch-walk-bake.mjs <walk.glb> <saida.glb>');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const doc = await io.read(inp), root = doc.getRoot();
const anim = root.listAnimations()[0];
const short = (n) => (n.getName() ?? '').replace(/^mixamorig:?/, '');
const nodes = root.listNodes(), byName = new Map(nodes.map((n) => [short(n), n]));
const parent = new Map();
for (const n of nodes) for (const c of n.listChildren()) parent.set(c, n);
const chan = (n, path) => anim.listChannels().find((c) => c.getTargetNode() === n && c.getTargetPath() === path) ?? null;

// ---- amostragem (linear / slerp) ----
function sample(ch, t) {
  const s = ch.getSampler(), ti = s.getInput().getArray(), v = s.getOutput().getArray(), k = ch.getTargetPath() === 'rotation' ? 4 : 3;
  let i = 0; while (i < ti.length - 2 && ti[i + 1] <= t) i++;
  const a = Math.max(0, Math.min(1, (t - ti[i]) / Math.max(1e-9, ti[i + 1] - ti[i])));
  if (k === 4) return new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion().fromArray(v, i * 4), new THREE.Quaternion().fromArray(v, (i + 1) * 4), a);
  return new THREE.Vector3().fromArray(v, i * 3).lerp(new THREE.Vector3().fromArray(v, (i + 1) * 3), a);
}
const hips = byName.get('Hips');
const T = Array.from(chan(hips, 'translation').getSampler().getInput().getArray());

// pose LOCAL de um quadro (repouso + animação)
function localPose(t) {
  const L = new Map();
  for (const n of nodes) {
    const ct = chan(n, 'translation'), cr = chan(n, 'rotation'), cs = chan(n, 'scale');
    L.set(n, { p: ct ? sample(ct, t) : new THREE.Vector3().fromArray(n.getTranslation()), q: cr ? sample(cr, t) : new THREE.Quaternion().fromArray(n.getRotation()), s: cs ? sample(cs, t) : new THREE.Vector3().fromArray(n.getScale()) });
  }
  return L;
}
// mundo (cinemática direta)
function world(L) {
  const W = new Map();
  const go = (n, pm) => { const l = L.get(n), m = new THREE.Matrix4().compose(l.p, l.q, l.s); const w = pm ? pm.clone().multiply(m) : m; W.set(n, w); for (const c of n.listChildren()) go(c, w); };
  for (const r of nodes.filter((n) => !parent.has(n))) go(r, null);
  return W;
}
const wpos = (W, n) => new THREE.Vector3().setFromMatrixPosition(W.get(n));
const wquat = (W, n) => { const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(); W.get(n).decompose(p, q, s); return q; };
const parentQuat = (W, n) => (parent.has(n) ? wquat(W, parent.get(n)) : new THREE.Quaternion());

// eixos do mundo: cima = +Y; frente = rumo do quadril no clip
const W0 = world(localPose(T[0])), WN = world(localPose(T[T.length - 1]));
const h0 = wpos(W0, hips), fwd = wpos(WN, hips).sub(h0).setY(0).normalize(), up = new THREE.Vector3(0, 1, 0);
const tiltAxis = new THREE.Vector3().crossVectors(up, fwd).normalize();
let standY = 0; for (const t of T) standY += wpos(world(localPose(t)), hips).y; standY /= T.length;
const drop = standY * (1 - CROUCH.HIPS_K);
// passo mais curto: o mundo encolhe AO LONGO da frente (pé plantado continua parado; o passo diminui)
const squash = (p) => { const d = p.clone().sub(h0), a = d.dot(fwd); return h0.clone().add(d.addScaledVector(fwd, a * (CROUCH.STRIDE_K - 1))); };
const qTilt = new THREE.Quaternion().setFromAxisAngle(tiltAxis, CROUCH.TILT_DEG * Math.PI / 180);
const qHead = new THREE.Quaternion().setFromAxisAngle(tiltAxis, -CROUCH.TILT_DEG * CROUCH.HEAD_BACK * Math.PI / 180);

const sides = ['Left', 'Right'].map((s) => ({ up: byName.get(s + 'UpLeg'), leg: byName.get(s + 'Leg'), foot: byName.get(s + 'Foot') }));
const head = byName.get('Head');
const outQ = new Map(), outHipsP = [];
for (const n of [hips, head, ...sides.flatMap((s) => [s.up, s.leg, s.foot])]) outQ.set(n, []);
let worstFoot = 0;

for (const t of T) {
  const L = localPose(t), Wo = world(L);
  const o = { hips: wpos(Wo, hips), hipsQ: wquat(Wo, hips), headQ: wquat(Wo, head),
    legs: sides.map((s) => ({ foot: wpos(Wo, s.foot), footQ: wquat(Wo, s.foot) })) };
  // 1) quadril: mais baixo, passo encurtado, inclinado pra frente
  const hp = squash(o.hips); hp.y -= drop;
  const pm = parent.has(hips) ? Wo.get(parent.get(hips)) : new THREE.Matrix4();
  L.get(hips).p.copy(hp.clone().applyMatrix4(pm.clone().invert()));
  L.get(hips).q.copy(parentQuat(Wo, hips).invert().multiply(qTilt.clone().multiply(o.hipsQ)));
  // 2) pernas por IK (2 ossos), alvo = o pé do andar (encurtado), joelho pra frente
  for (let k = 0; k < 2; k++) {
    const s = sides[k], W1 = world(L);
    const A = wpos(W1, s.up), Kc = wpos(W1, s.leg), Fc = wpos(W1, s.foot);
    const l1 = Kc.distanceTo(A), l2 = Fc.distanceTo(Kc);
    const Tg = squash(o.legs[k].foot);
    const d = Math.min(Tg.distanceTo(A), (l1 + l2) * 0.999), dir = Tg.clone().sub(A).normalize();
    const pole = A.clone().lerp(Tg, 0.5).addScaledVector(fwd, 1);
    const perp = pole.sub(A); perp.addScaledVector(dir, -perp.dot(dir)).normalize();
    const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const K = A.clone().addScaledVector(dir, a).addScaledVector(perp, h), Fp = A.clone().addScaledVector(dir, d);
    // coxa: aponta pro joelho novo + gira no eixo dela pra o plano do joelho bater
    const upW = wquat(W1, s.up);
    const d1 = new THREE.Quaternion().setFromUnitVectors(Kc.clone().sub(A).normalize(), K.clone().sub(A).normalize());
    let upNew = d1.clone().multiply(upW);
    const nCur = new THREE.Vector3().crossVectors(Kc.clone().sub(A), Fc.clone().sub(Kc)).applyQuaternion(d1);
    const nNew = new THREE.Vector3().crossVectors(K.clone().sub(A), Fp.clone().sub(K));
    const ax = K.clone().sub(A).normalize();
    nCur.addScaledVector(ax, -nCur.dot(ax)); nNew.addScaledVector(ax, -nNew.dot(ax));
    if (nCur.lengthSq() > 1e-8 && nNew.lengthSq() > 1e-8) {
      nCur.normalize(); nNew.normalize();
      const ang = Math.atan2(new THREE.Vector3().crossVectors(nCur, nNew).dot(ax), nCur.dot(nNew));
      upNew = new THREE.Quaternion().setFromAxisAngle(ax, ang).multiply(upNew);
    }
    L.get(s.up).q.copy(parentQuat(W1, s.up).invert().multiply(upNew));
    // canela: aponta pro pé
    const W2 = world(L), K2 = wpos(W2, s.leg), F2 = wpos(W2, s.foot), legW = wquat(W2, s.leg);
    const legNew = new THREE.Quaternion().setFromUnitVectors(F2.clone().sub(K2).normalize(), Fp.clone().sub(K2).normalize()).multiply(legW);
    L.get(s.leg).q.copy(wquat(W2, s.up).invert().multiply(legNew));
    // pé: a mesma orientação do andar (chapado)
    L.get(s.foot).q.copy(legNew.clone().invert().multiply(o.legs[k].footQ));
  }
  // 3) cabeça compensa parte da inclinação
  const W3 = world(L);
  L.get(head).q.copy(parentQuat(W3, head).invert().multiply(qHead.clone().multiply(wquat(W3, head))));
  // confere: o pé chegou no alvo?
  const W4 = world(L);
  for (let k = 0; k < 2; k++) worstFoot = Math.max(worstFoot, wpos(W4, sides[k].foot).distanceTo(squash(o.legs[k].foot)));
  outHipsP.push(...L.get(hips).p.toArray());
  for (const [n, arr] of outQ) arr.push(...L.get(n).q.toArray());
}

// grava: entrada = os quadros do quadril (nova, não compartilhada); saídas novas
const buf = root.listBuffers()[0];
const acc = (arr, type) => doc.createAccessor().setArray(new Float32Array(arr)).setType(type).setBuffer(buf);
const setChan = (n, path, values, type) => {
  let ch = chan(n, path);
  if (!ch) { const sm = doc.createAnimationSampler(); ch = doc.createAnimationChannel().setTargetNode(n).setTargetPath(path).setSampler(sm); anim.addSampler(sm).addChannel(ch); }
  ch.getSampler().setInput(acc(T, 'SCALAR')).setOutput(acc(values, type)).setInterpolation('LINEAR');
};
setChan(hips, 'translation', outHipsP, 'VEC3');
for (const [n, arr] of outQ) setChan(n, 'rotation', arr, 'VEC4');
await doc.transform(prune({ keepLeaves: true })); // tira as trilhas velhas trocadas (o esqueleto fica inteiro)
await io.write(out, doc);

const W0b = world(localPose(T[0])), WNb = world(localPose(T[T.length - 1]));
const travel = wpos(WNb, hips).sub(wpos(W0b, hips)).setY(0).length(), dur = T[T.length - 1] - T[0];
console.log(JSON.stringify({ quadros: T.length, duracao_s: +dur.toFixed(3), quadrilEmPe: +standY.toFixed(3), quadrilAgachado: +(standY - drop).toFixed(3),
  pePiorErro_m: +worstFoot.toFixed(4), anda_m: +travel.toFixed(3), velocidadeDoClip_ms: +(travel / dur).toFixed(3) }));
