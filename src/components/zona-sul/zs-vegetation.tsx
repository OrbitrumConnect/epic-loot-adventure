/**
 * ZONA SUL — mata atlântica "jurássica" (Pedro 28/10: bem arborizado; a MAIORIA das árvores é cenário leve, sem farm,
 * e é pelo menos 3 m MAIS ALTA que as de farm — dá pra ver de longe qual se colhe). Tudo instanciado (1 desenho por
 * tipo), posição determinística por célula (sempre a mesma árvore no mesmo lugar), só em volta do herói:
 *  - perto (até NEAR m): árvore completa — dossel 13–24 m, emergente 26–34 m, samambaiaçu 4–7 m, arbusto, coqueiro
 *    na praia e a árvore de FARM (6,6–9,2 m, igual o jogo, copa clara e redonda);
 *  - longe (até FAR m): só a copa simples das árvores grandes (a mata segue "cheia" no horizonte, quase sem custo).
 * Nada em água, praia (só coqueiro), nem paredão de pedra.
 */
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ZS_SURF } from './zona-sul-meta';
import { type ZsTerrain, zsHash, zsHeightAt, zsSlopeDeg, zsSurfAt, ZS_WATER_Y } from './zs-terrain-data';

export const ZS_VEG_CELL = 16;
export const ZS_VEG_NEAR = 150;
export const ZS_VEG_FAR = 420;
/** Alturas (m): farm igual ao jogo (6,6–9,2 m); cenário começa 3,8 m acima do farm mais alto. */
export const ZS_TREE_H = {
  farm: [6.6, 9.2], canopy: [13, 24], emergent: [26, 34], fern: [4, 7], palm: [9, 13], bush: [1, 2.4],
} as const;
export type ZsVegKind = keyof typeof ZS_TREE_H | 'far';

const col = (hex: string) => new THREE.Color(hex);
function paint(g: THREE.BufferGeometry, c: THREE.Color): THREE.BufferGeometry {
  const n = g.getAttribute('position').count, a = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) { a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
}
const at = (g: THREE.BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);
/** Folha de palmeira/samambaia: plano fino inclinado saindo do topo, girado em volta do tronco. */
function fronds(n: number, len: number, width: number, droop: number, top: number, c: THREE.Color): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  for (let k = 0; k < n; k++) {
    const g = new THREE.PlaneGeometry(width, len, 1, 2);
    const p = g.getAttribute('position');
    for (let v = 0; v < p.count; v++) { const y = p.getY(v) + len / 2; p.setY(v, 0); p.setZ(v, y); p.setY(v, -droop * (y / len) ** 2); }
    g.rotateX(-0.35).rotateY((k / n) * Math.PI * 2 + (k % 2) * 0.3).translate(0, top, 0);
    out.push(paint(g, c));
  }
  return out;
}
/** Modelos em ALTURA 1 (escala no instanciado). */
function kindGeometry(kind: ZsVegKind): THREE.BufferGeometry {
  const trunk = col('#4a3826'), trunkLight = col('#6b5136');
  switch (kind) {
    case 'canopy': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.018, 0.03, 0.62, 6), 0, 0.31, 0), trunk),
      paint(at(new THREE.IcosahedronGeometry(0.2, 0), 0, 0.72, 0), col('#2f5d2a')),
      paint(at(new THREE.IcosahedronGeometry(0.16, 0), 0.12, 0.84, 0.04), col('#3b6b31')),
      paint(at(new THREE.IcosahedronGeometry(0.15, 0), -0.1, 0.8, -0.08), col('#27502a')),
    ])!;
    case 'emergent': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.012, 0.026, 0.8, 6), 0, 0.4, 0), trunkLight),
      paint(at(new THREE.CylinderGeometry(0.3, 0.12, 0.12, 8), 0, 0.84, 0), col('#3d6a2f')),
      paint(at(new THREE.CylinderGeometry(0.2, 0.26, 0.08, 8), 0, 0.93, 0), col('#4a7a36')),
    ])!;
    case 'fern': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.035, 0.05, 0.85, 5), 0, 0.42, 0), col('#3a2c1d')),
      ...fronds(9, 0.55, 0.13, 0.3, 0.85, col('#3f7a2c')),
    ])!;
    case 'palm': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.022, 0.035, 0.92, 6), 0.03, 0.46, 0), trunkLight),
      ...fronds(8, 0.42, 0.09, 0.22, 0.92, col('#4f8a35')),
    ])!;
    case 'bush': return paint(at(new THREE.IcosahedronGeometry(0.5, 0), 0, 0.4, 0).scale(1, 0.8, 1), col('#3c6a2e'));
    case 'farm': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.035, 0.05, 0.5, 6), 0, 0.25, 0), trunkLight),
      paint(at(new THREE.IcosahedronGeometry(0.3, 1), 0, 0.68, 0), col('#6f9a3a')),
    ])!;
    // longe: silhueta de árvore ENCOSTADA no chão (a copa sozinha a meia altura parecia "diamante voando")
    case 'far': return paint(at(new THREE.OctahedronGeometry(0.25, 0).scale(1, 1.9, 1), 0, 0.5, 0), col('#2c562a'));
  }
}
const KINDS: ZsVegKind[] = ['canopy', 'emergent', 'fern', 'palm', 'bush', 'farm', 'far'];
const CAP: Record<ZsVegKind, number> = { canopy: 3500, emergent: 400, fern: 1600, palm: 500, bush: 2200, farm: 400, far: 12000 };
/** SOMBRA só das árvores PERTO (30/10, Pedro: "o lag está aumentando"): a caixa de sombra do sol cobre ±45 m em volta
 *  do herói — árvore além de ~64 m (a diagonal da caixa) não sombreia nada que apareça, mas TODAS as copas até 150 m
 *  (~3 mil, instanciado sem corte) entravam no passe de sombra. Agora as de perto vão numa malha COM sombra (mesma
 *  geometria e material) e o resto numa sem. Visual igual; o passe de sombra cai pra ~1/10 das árvores. */
export const ZS_VEG_SHADOW_R = 64;
const SHADOW_KINDS = ['canopy', 'emergent', 'farm'] as const;
type ShadowKind = (typeof SHADOW_KINDS)[number];
const SHADOW_CAP: Record<ShadowKind, number> = { canopy: 500, emergent: 120, farm: 160 };
const isShadowKind = (k: ZsVegKind): k is ShadowKind => (SHADOW_KINDS as readonly string[]).includes(k);
/** Vai pra malha com sombra? (puro, testável) */
export function zsVegCastsShadow(it: ZsVegItem, hx: number, hz: number): boolean {
  return isShadowKind(it.kind) && (it.x - hx) ** 2 + (it.z - hz) ** 2 < ZS_VEG_SHADOW_R * ZS_VEG_SHADOW_R;
}
/** Largura (fração da altura) por tipo. */
const WIDTH: Record<ZsVegKind, number> = { canopy: 0.85, emergent: 0.75, fern: 0.9, palm: 0.9, bush: 1.5, farm: 0.9, far: 0.85 };

export type ZsVegItem = { kind: ZsVegKind; x: number; y: number; z: number; h: number; yaw: number };

/** Árvores das células em volta de (hx, hz): perto = completas; longe = só copa das grandes. Puro (testável). */
export function zsVegetationAround(t: ZsTerrain, hx: number, hz: number, near = ZS_VEG_NEAR, far = ZS_VEG_FAR): ZsVegItem[] {
  const out: ZsVegItem[] = [];
  const c0x = Math.floor((hx - far) / ZS_VEG_CELL), c1x = Math.floor((hx + far) / ZS_VEG_CELL);
  const c0z = Math.floor((hz - far) / ZS_VEG_CELL), c1z = Math.floor((hz + far) / ZS_VEG_CELL);
  for (let cz = c0z; cz <= c1z; cz++) for (let cx = c0x; cx <= c1x; cx++) {
    const ccx = (cx + 0.5) * ZS_VEG_CELL, ccz = (cz + 0.5) * ZS_VEG_CELL;
    const d = Math.hypot(ccx - hx, ccz - hz);
    if (d > far) continue;
    const isNear = d <= near;
    for (let k = 0; k < 7; k++) {
      const x = (cx + zsHash(cx, cz, k * 3 + 1)) * ZS_VEG_CELL, z = (cz + zsHash(cx, cz, k * 3 + 2)) * ZS_VEG_CELL;
      const s = zsSurfAt(t, x, z), y = zsHeightAt(t, x, z);
      if (y < ZS_WATER_Y + 0.1 || s === ZS_SURF.sea || s === ZS_SURF.lagoon || s === ZS_SURF.out || s === ZS_SURF.road) continue; // nada no meio da rua
      const slope = zsSlopeDeg(t, x, z), r = zsHash(cx, cz, k * 3 + 3), r2 = zsHash(cx, cz, k * 3 + 40);
      let kind: ZsVegKind | null = null;
      if (s === ZS_SURF.beach) { if (k < 1 && r < 0.35) kind = 'palm'; }
      else if (slope > 40) kind = null;                                     // paredão de granito: pelado
      else {
        const lowland = y < 4 && s !== ZS_SURF.forest;
        const dense = lowland ? 3 : 5;                                      // baixada (ruína tomada) mais aberta; morro fechado
        if (k >= dense) continue;
        if (slope > 32) kind = r < 0.5 ? 'bush' : null;                    // encosta forte: só mato baixo
        else if (r < 0.03 && !lowland) kind = 'emergent';
        else if (r < (lowland ? 0.4 : 0.6)) kind = 'canopy';
        else if (r < (lowland ? 0.58 : 0.78)) kind = 'fern';
        else if (r < (lowland ? 0.68 : 0.82) && slope < 20) kind = 'farm';
        else kind = 'bush';
      }
      if (!kind) continue;
      if (!isNear) { if (kind !== 'canopy' && kind !== 'emergent') continue; kind = 'far'; }
      const range = kind === 'far' ? ZS_TREE_H.canopy : ZS_TREE_H[kind];
      out.push({ kind, x, y, z, h: range[0] + (range[1] - range[0]) * r2, yaw: r * Math.PI * 2 });
    }
  }
  return out;
}

export function ZsVegetation({ t, heroRef }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const meshes = useMemo(() => {
    const m = {} as Record<ZsVegKind, THREE.InstancedMesh>;
    for (const k of KINDS) {
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: k === 'fern' || k === 'palm' ? THREE.DoubleSide : THREE.FrontSide, flatShading: true });
      const im = new THREE.InstancedMesh(kindGeometry(k), mat, CAP[k]);
      // sombra só das árvores grandes e PERTO (a malha "sh" abaixo); samambaia, coqueiro e arbusto não: pesa e quase não se vê
      im.count = 0; im.frustumCulled = false; im.castShadow = false; im.receiveShadow = false;
      m[k] = im;
    }
    const sh = {} as Record<ShadowKind, THREE.InstancedMesh>;
    for (const k of SHADOW_KINDS) {
      const im = new THREE.InstancedMesh(m[k].geometry, m[k].material, SHADOW_CAP[k]);
      im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = false;
      sh[k] = im;
    }
    return { ...m, sh };
  }, []);
  const lastCell = useRef('');
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useFrame(() => {
    const hx = heroRef.current.x, hz = heroRef.current.z;
    const key = `${Math.floor(hx / ZS_VEG_CELL)}_${Math.floor(hz / ZS_VEG_CELL)}`;
    if (key === lastCell.current) return;
    lastCell.current = key;
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<ZsVegKind, number>;
    const shCounts = { canopy: 0, emergent: 0, farm: 0 } as Record<ShadowKind, number>;
    for (const it of zsVegetationAround(t, hx, hz)) {
      const toShadow = zsVegCastsShadow(it, hx, hz) && shCounts[it.kind as ShadowKind] < SHADOW_CAP[it.kind as ShadowKind];
      if (!toShadow && counts[it.kind] >= CAP[it.kind]) continue;
      const w = it.h * WIDTH[it.kind];
      dummy.position.set(it.x, it.y - 0.15, it.z); dummy.rotation.set(0, it.yaw, 0); dummy.scale.set(w, it.h, w);
      dummy.updateMatrix();
      if (toShadow) meshes.sh[it.kind as ShadowKind].setMatrixAt(shCounts[it.kind as ShadowKind]++, dummy.matrix);
      else meshes[it.kind].setMatrixAt(counts[it.kind]++, dummy.matrix);
    }
    for (const k of KINDS) { meshes[k].count = counts[k]; meshes[k].instanceMatrix.needsUpdate = true; }
    for (const k of SHADOW_KINDS) { meshes.sh[k].count = shCounts[k]; meshes.sh[k].instanceMatrix.needsUpdate = true; }
  });
  useEffect(() => () => { for (const k of KINDS) { meshes[k].geometry.dispose(); (meshes[k].material as THREE.Material).dispose(); } }, [meshes]);
  return (
    <group>
      {KINDS.map((k) => <primitive key={k} object={meshes[k]} />)}
      {SHADOW_KINDS.map((k) => <primitive key={'sh-' + k} object={meshes.sh[k]} />)}
    </group>
  );
}
