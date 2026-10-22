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
