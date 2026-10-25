import * as THREE from 'three';

/**
 * Converte um clip Mixamo feito para OUTRO esqueleto sem torcer a malha.
 *
 * Copiar a rotação local por nome de osso deixa a DIREÇÃO dos membros certa, mas o osso pode
 * ficar girado até 180° em volta do próprio eixo em relação à pose em que a malha foi presa
 * (o herói `hero-preview.glb` veio do Blender com outro "rolo" nos ossos) — a cintura e as coxas
 * "embrulham". Aqui, para cada quadro: a direção vem da cópia direta e o giro em volta do eixo
 * vem da diferença de repouso entre os dois esqueletos (swing/twist). O quadril fica igual à
 * cópia direta (postura em pé intacta). Medido nos GLBs reais em `src/test/mixamo-retarget.test.ts`.
 *
 * `srcRoot`: esqueleto do arquivo do clip, em repouso. `tgtRoot`: o modelo em repouso;
 * `standFixX` = a mesma correção de pé com que ele é exibido. Nenhum dos dois é alterado
 * (trabalha em cópias).
 */
export function retargetTwist(clip: THREE.AnimationClip, srcRoot: THREE.Object3D, tgtRoot: THREE.Object3D, standFixX = 0): THREE.AnimationClip {
  const rotTracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion')) as THREE.QuaternionKeyframeTrack[];
  if (rotTracks.length === 0) return clip;
  const animated = new Set(rotTracks.map((t) => t.name.slice(0, -'.quaternion'.length)));
  // O GLTFLoader tira o ':' dos nomes (mixamorig:Hips → mixamorigHips): acha pelo final.
  const hipsName = [...animated].find((n) => /hips$/i.test(n));
  if (!hipsName) return clip;

  const src = srcRoot.clone(true);
  const tgtWrap = new THREE.Object3D();
  const tgt = tgtRoot.clone(true);
  tgtWrap.add(tgt);
  tgtWrap.rotation.x = standFixX;
  const byName = (root: THREE.Object3D) => {
    const m = new Map<string, THREE.Object3D>();
    root.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); });
    return m;
  };
  const S = byName(src);
  const T = byName(tgt);
  const hipsS = S.get(hipsName);
  const hipsT = T.get(hipsName);
  if (!hipsS || !hipsT) return clip;

  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  src.updateMatrixWorld(true);
  tgtWrap.updateMatrixWorld(true);
  const relHips = (m: Map<string, THREE.Object3D>, hips: THREE.Object3D, n: string) => wq(hips).invert().multiply(wq(m.get(n)!));
  // Diferença de repouso por osso (relativa ao quadril): o "rolo" de cada esqueleto.
  const R = new Map<string, THREE.Quaternion>();
  for (const n of animated) {
    if (n === hipsName || !S.get(n) || !T.get(n)) continue;
    R.set(n, relHips(S, hipsS, n).invert().multiply(relHips(T, hipsT, n)));
  }
  // Eixo do osso no ALVO: direção até o 1º filho animado.
  const axis = new Map<string, THREE.Vector3>();
  for (const [n, o] of T) {
    const ch = o.children.find((c) => animated.has(c.name));
    if (ch && ch.position.lengthSq() > 1e-12) axis.set(n, ch.position.clone().normalize());
  }
  const keepAsIs = new Set<string>();
  for (const [n, o] of T) if (/Shoulder$/i.test(n)) o.traverse((d) => { if (d.name) keepAsIs.add(d.name); });
  const order: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => { if (animated.has(o.name) && T.get(o.name) === o) order.push(o); o.children.forEach(visit); };
  visit(tgt);

  // Linha do tempo: a trilha com mais quadros; as outras são amostradas nela.
  const times = rotTracks.reduce((a, t) => (t.times.length > a.length ? t.times : a), rotTracks[0]!.times);
  const interps = new Map(rotTracks.map((t) => [
    t.name.slice(0, -'.quaternion'.length),
    new THREE.QuaternionLinearInterpolant(t.times, t.values, 4, new Float32Array(4)),
  ]));
  const out = new Map<string, Float32Array>(order.map((o) => [o.name, new Float32Array(times.length * 4)]));
  const qs = new Map<string, THREE.Quaternion>();

  for (let k = 0; k < times.length; k++) {
    const time = times[k]!;
    for (const [n, it] of interps) qs.set(n, new THREE.Quaternion().fromArray(it.evaluate(time) as unknown as number[]).normalize());
    // 1) cópia direta → direção certa
    for (const o of order) o.quaternion.copy(qs.get(o.name)!);
    tgtWrap.updateMatrixWorld(true);
    const Gn = new Map(order.map((o) => [o.name, wq(o)]));
    // 2) diferença de repouso → giro certo
    for (const o of order) {
      const Rb = R.get(o.name);
      if (o.name === hipsName || !Rb) continue;
      const Rp = (o.parent && R.get(o.parent.name)) ?? new THREE.Quaternion();
      o.quaternion.copy(Rp.clone().invert().multiply(qs.get(o.name)!).multiply(Rb));
    }
    tgtWrap.updateMatrixWorld(true);
    const Gc = new Map(order.map((o) => [o.name, wq(o)]));
    // 3) final: direção de (1) + giro mínimo de (2), pais antes dos filhos
    for (const o of order) {
      let Gf: THREE.Quaternion;
      const ax = axis.get(o.name);
      // Quadril e braços (ombro→dedos) ficam EXATAMENTE como na cópia direta: o defeito é no
      // tronco/pernas, e nos braços a malha foi presa em outra pose (mexer piorava ~10°).
      // (Corrigir o quadril também foi testado: derruba o corpo dos raiders — descartado.)
      if (o.name === hipsName || keepAsIs.has(o.name)) Gf = Gn.get(o.name)!.clone();
      else if (ax) {
        const want = ax.clone().applyQuaternion(Gn.get(o.name)!);
        const have = ax.clone().applyQuaternion(Gc.get(o.name)!);
        Gf = new THREE.Quaternion().setFromUnitVectors(have, want).multiply(Gc.get(o.name)!);
      } else Gf = Gc.get(o.name)!.clone();
      o.quaternion.copy(wq(o.parent!).invert().multiply(Gf));
      o.updateMatrixWorld(true);
      out.get(o.name)!.set([o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w], k * 4);
    }
  }

  const baked = clip.clone();
  baked.tracks = clip.tracks.map((t) => {
    if (!t.name.endsWith('.quaternion')) return t;
    const values = out.get(t.name.slice(0, -'.quaternion'.length));
    return values ? new THREE.QuaternionKeyframeTrack(t.name, Array.from(times), Array.from(values)) : t;
  });
  return baked;
}

/**
 * Recoloca os ossos na pose de LIGAÇÃO da pele (a pose em que a malha foi presa), calculada pelas
 * `boneInverses`. Os raiders Meshy+Mixamo vêm com o esqueleto SALVO numa pose diferente da ligação
 * (até 96° no antebraço/perna, medido 24/10) — animar a partir dela estica/torce a malha. O herói
 * (refeito no Blender) já vem igual (0°). Usar com a raiz na origem, logo após clonar.
 */
export function poseBonesToBind(bones: THREE.Object3D[], boneInverses: THREE.Matrix4[]): void {
  const depth = (o: THREE.Object3D) => { let d = 0; for (let p = o.parent; p; p = p.parent) d++; return d; };
  const order = bones.map((b, i) => ({ b, i })).sort((x, y) => depth(x.b) - depth(y.b));
  const want = new THREE.Matrix4(), local = new THREE.Matrix4();
  for (const { b, i } of order) {
    want.copy(boneInverses[i]!).invert();
    if (b.parent) { b.parent.updateMatrixWorld(true); local.copy(b.parent.matrixWorld).invert().multiply(want); } else local.copy(want);
    local.decompose(b.position, b.quaternion, b.scale);
    b.updateMatrixWorld(true);
  }
}
export function poseToBind(root: THREE.Object3D): void {
  root.updateMatrixWorld(true);
  const done = new Set<THREE.Skeleton>();
  root.traverse((o) => {
    const sm = o as THREE.SkinnedMesh;
    if (!sm.isSkinnedMesh || done.has(sm.skeleton)) return;
    done.add(sm.skeleton);
    poseBonesToBind(sm.skeleton.bones, sm.skeleton.boneInverses);
  });
}

/** Base do CORPO pelas posições (independe do "rolo" dos ossos): cima = quadril→cabeça, lado = coxas. */
function bodyBasis(m: Map<string, THREE.Object3D>, hips: string): THREE.Quaternion | null {
  const pre = hips.slice(0, -'Hips'.length);
  const g = (n: string) => m.get(pre + n)?.getWorldPosition(new THREE.Vector3());
  const hp = g('Hips'), head = g('Head'), l = g('LeftUpLeg'), r = g('RightUpLeg');
  if (!hp || !head || !l || !r) return null;
  const up = head.sub(hp).normalize();
  const side = r.sub(l); side.addScaledVector(up, -side.dot(up)).normalize();
  const fwd = new THREE.Vector3().crossVectors(side, up).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, fwd));
}

/**
 * Retarget pelo ESPAÇO DO MUNDO (24/10, Couraça/Fúngico): cada osso do alvo recebe o MESMO giro-mundo
 * que o osso da animação fez desde o repouso dela → a pele torce exatamente como na animação original
 * (sem o "embrulho" de 150–170° da cópia direta). Antes, uma vez só no repouso: põe o alvo de pé, de
 * frente igual à animação, e leva cada osso da pose dele (braços em "A") à da animação (T) pelo giro
 * MÍNIMO (sem torcer em volta do osso). `tgtRoot` deve estar na pose de ligação (`poseToBind`).
 * Medido nos GLB reais + desenhado com a pele aplicada (`mixamo-retarget.test.ts`).
 */
export function retargetBind(clip: THREE.AnimationClip, srcRoot: THREE.Object3D, tgtRoot: THREE.Object3D, standFixX = 0, feetLike?: THREE.Object3D): THREE.AnimationClip {
  const rotTracks = clip.tracks.filter((t) => t.name.endsWith('.quaternion')) as THREE.QuaternionKeyframeTrack[];
  if (rotTracks.length === 0) return clip;
  const animated = new Set(rotTracks.map((t) => t.name.slice(0, -'.quaternion'.length)));
  const hipsName = [...animated].find((n) => /hips$/i.test(n));
  if (!hipsName) return clip;
  const src = srcRoot.clone(true);
  const wrap = new THREE.Object3D();
  const tgt = tgtRoot.clone(true);
  tgt.position.set(0, 0, 0); tgt.scale.setScalar(1); // escala/posição do autoHeight não mudam giros
  wrap.add(tgt);
  wrap.rotation.x = standFixX;
  src.updateMatrixWorld(true); wrap.updateMatrixWorld(true);
  const byName = (root: THREE.Object3D) => { const m = new Map<string, THREE.Object3D>(); root.traverse((o) => { if (o.name && !m.has(o.name)) m.set(o.name, o); }); return m; };
  const S = byName(src), T = byName(tgt);
  const wq = (o: THREE.Object3D) => o.getWorldQuaternion(new THREE.Quaternion());
  const wp = (o: THREE.Object3D) => o.getWorldPosition(new THREE.Vector3());
  const bS = bodyBasis(S, hipsName), bT = bodyBasis(T, hipsName);
  if (!bS || !bT) return clip;
  const C = bS.multiply(bT.invert()); // alvo de pé, de frente igual à animação
  const restS = new Map([...S].map(([n, o]) => [n, wq(o)]));
  const restT = new Map([...T].map(([n, o]) => [n, wq(o)]));
  // Pose do alvo (A) → pose da animação (T): giro mínimo por osso, no repouso.
  const Sw = new Map<string, THREE.Quaternion>();
  for (const [n, o] of T) {
    const ch = o.children.find((c) => S.get(c.name) && T.get(c.name) === c);
    const so = S.get(n);
    if (!ch || !so || ch.position.lengthSq() < 1e-12) continue;
    const have = ch.position.clone().normalize().applyQuaternion(C.clone().multiply(restT.get(n)!));
    const want = wp(S.get(ch.name)!).sub(wp(so)).normalize();
    Sw.set(n, new THREE.Quaternion().setFromUnitVectors(have, want));
  }
  const order: THREE.Object3D[] = [];
  const visit = (o: THREE.Object3D) => { if (animated.has(o.name) && T.get(o.name) === o && S.get(o.name)) order.push(o); o.children.forEach(visit); };
  visit(tgt);
  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(clip).play();
  const times = rotTracks.reduce((a, t) => (t.times.length > a.length ? t.times : a), rotTracks[0]!.times);
  const out = new Map(order.map((o) => [o.name, new Float32Array(times.length * 4)]));
  const pre = new Map(order.map((o) => [o.name, (Sw.get(o.name) ?? new THREE.Quaternion()).clone().multiply(C).multiply(restT.get(o.name)!)]));
  const invRestS = new Map(order.map((o) => [o.name, restS.get(o.name)!.clone().invert()]));
  for (let k = 0; k < times.length; k++) {
    mixer.setTime(times[k]!);
    src.updateMatrixWorld(true);
    for (const o of order) {
      const G = wq(S.get(o.name)!).multiply(invRestS.get(o.name)!).multiply(pre.get(o.name)!);
      o.quaternion.copy(wq(o.parent!).invert().multiply(G));
      o.updateMatrixWorld(true);
      out.get(o.name)!.set([o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w], k * 4);
    }
  }
  mixer.stopAllAction();
  const baked = clip.clone();
  baked.tracks = clip.tracks.map((t) => {
    if (!t.name.endsWith('.quaternion')) return t;
    const values = out.get(t.name.slice(0, -'.quaternion'.length));
    return values ? new THREE.QuaternionKeyframeTrack(t.name, Array.from(times), Array.from(values)) : t;
  });
  // Pé no MESMO lugar de antes: com as pernas destorcidas o pé mais baixo do clip mudava alguns cm
  // (Fúngico +16 cm, Couraça −6 cm, medido). Desloca o Y do quadril pra igualar à cópia direta.
  if (feetLike) {
    const dy = lowestFoot(clip, feetLike, standFixX, hipsName) - lowestFoot(baked, tgtRoot, standFixX, hipsName);
    const hp = baked.tracks.find((t) => t.name === `${hipsName}.position`);
    if (hp && Number.isFinite(dy)) {
      const v = Float32Array.from(hp.values);
      for (let i = 1; i < v.length; i += 3) v[i]! += dy;
      baked.tracks = baked.tracks.map((t) => (t === hp ? new THREE.VectorKeyframeTrack(t.name, Array.from(t.times), Array.from(v)) : t));
    }
  }
  return baked;
}

/** Y do pé/dedão mais baixo ao longo do clip, com o modelo de pé (`standFixX`). */
function lowestFoot(clip: THREE.AnimationClip, root: THREE.Object3D, standFixX: number, hipsName: string): number {
  const pre = hipsName.slice(0, -'Hips'.length);
  const wrap = new THREE.Object3D();
  const r = root.clone(true);
  r.position.set(0, 0, 0); r.scale.setScalar(1);
  wrap.add(r); wrap.rotation.x = standFixX;
  const feet: THREE.Object3D[] = [];
  r.traverse((o) => { if ([pre + 'LeftFoot', pre + 'RightFoot', pre + 'LeftToeBase', pre + 'RightToeBase'].includes(o.name)) feet.push(o); });
  if (feet.length === 0) return NaN;
  const mixer = new THREE.AnimationMixer(r);
  mixer.clipAction(clip).play();
  const v = new THREE.Vector3();
  let lo = Infinity;
  for (let f = 0; f <= 1.0001; f += 0.05) {
    mixer.setTime(clip.duration * f);
    wrap.updateMatrixWorld(true);
    for (const o of feet) lo = Math.min(lo, o.getWorldPosition(v).y);
  }
  mixer.stopAllAction();
  return lo;
}
