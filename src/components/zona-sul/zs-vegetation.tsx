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
import { caveMouthClear } from './zs-cave';
import { useGameStore } from '@/game/state/game-store';
import { useNet } from '@/net/multiplayer';
import { BASE_GRID, type PlayerBaseState } from '@/game/types/playerbase';

/** Quadrados das BASES (minha + as dos outros, online) com 3 m de folga: a mata não nasce dentro (31/10, base na Zona Sul). */
export function baseBoxes(pb: PlayerBaseState | null, others: Record<string, PlayerBaseState | null | undefined>): number[][] {
  const out: number[][] = [];
  for (const b of [pb, ...Object.values(others)]) {
    if (!b) continue;
    const x0 = b.origin.gx * BASE_GRID, z0 = b.origin.gz * BASE_GRID, s = b.size * BASE_GRID;
    out.push([x0 - 3, z0 - 3, x0 + s + 3, z0 + s + 3]);
  }
  return out;
}

export const ZS_VEG_CELL = 16;
export const ZS_VEG_NEAR = 150;
export const ZS_VEG_FAR = 420;
/** Alturas (m): farm igual ao jogo (6,6–9,2 m); cenário começa 3,8 m acima do farm mais alto. */
export const ZS_TREE_H = {
  farm: [6.6, 9.2], canopy: [13, 24], emergent: [26, 34], fern: [4, 7], palm: [9, 13], bush: [1, 2.4],
} as const;
export type ZsVegKind = keyof typeof ZS_TREE_H | 'far' | 'canopyMid';

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
/* ÁRVORE DA MATA COM GALHOS (02/11, Pedro: "as árvores de farm já são mais bonitas que as low poly do jogo"; 01/11:
   "árvores da mata no estilo da de farm — com galhos, altas e baixas"). O MESMO jeito da árvore de farm (harvest-tree-
   geometry.ts: tronco afinando, braços saindo pra cima e pra fora, folhinhas em losango com aresta no meio), numa
   versão LEVE pro cenário: 6 braços, um tufo em cada ponta (bolinha de 20 faces que dá volume + 4 folhas em losango que
   dão a borda de folhagem) → ~340 triângulos (a de farm tem ~8,9 mil). Verde da MATA (mais escuro) — a de farm segue
   mais clara: continua dando pra ver de longe qual se colhe. Medido: perto do herói (≤ 150 m) há 136–260 dosséis. */
type Limb = THREE.Vector3[];
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
/** Galho/tronco: tubo pela curva, afinando até `tip` do raio, com a casca listrada (2 tons) — igual à árvore de farm. */
function limb(points: Limb, radius: number, radial: number, segments: number, bark: THREE.Color, barkLight: THREE.Color, tip = 0.3): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(points);
  const tube = new THREE.TubeGeometry(curve, segments, radius, radial, false);
  const p = tube.getAttribute('position'), cols = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = Math.floor(i / (radial + 1)) / segments, center = curve.getPointAt(t), k = 1 - t * (1 - tip);
    p.setXYZ(i, center.x + (p.getX(i) - center.x) * k, center.y + (p.getY(i) - center.y) * k, center.z + (p.getZ(i) - center.z) * k);
    c.copy(bark).lerp(barkLight, (i % (radial + 1)) % 2 === 0 ? 0.7 : 0.1).toArray(cols, i * 3);
  }
  tube.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  tube.deleteAttribute('uv'); tube.deleteAttribute('normal');
  const g = tube.toNonIndexed(); tube.dispose();
  return g;
}
/** Tufo: bolinha achatada (volume) + `n` folhas em losango em volta (a borda de folhagem da árvore de farm). */
function tuft(center: THREE.Vector3, r: number, flat: number, n: number, leafL: number, seed: number, greens: THREE.Color[]): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = [];
  const blob = new THREE.IcosahedronGeometry(r, 0).scale(1, flat, 1);
  blob.rotateY(zsHash(seed, 1, 1) * Math.PI).translate(center.x, center.y, center.z);
  out.push(paint(blob, greens[Math.floor(zsHash(seed, 2, 2) * 2)]!));
  const pos: number[] = [], cols: number[] = [], c = new THREE.Color();
  for (let j = 0; j < n; j++) {
    const th = (j / n) * Math.PI * 2 + zsHash(seed, j, 3) * 0.9, up = (zsHash(seed, j, 4) - 0.35) * 0.9;
    const dir = V(Math.cos(th), up, Math.sin(th)).normalize();
    const mid = center.clone().addScaledVector(dir, r * 0.95);
    const along = dir.clone().multiplyScalar(leafL), across = V(-Math.sin(th), 0.2, Math.cos(th)).multiplyScalar(leafL * 0.5);
    const root = mid.clone().sub(along), tip = mid.clone().add(along), left = mid.clone().add(across), right = mid.clone().sub(across);
    const ridge = mid.clone().add(V(0, leafL * 0.22, 0));
    c.copy(greens[2]!).lerp(greens[3]!, zsHash(seed, j, 5));
    for (const q of [root, left, ridge, left, tip, ridge, tip, right, ridge, right, root, ridge]) { pos.push(q.x, q.y, q.z); cols.push(c.r, c.g, c.b); }
  }
  if (!n) return out;
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  out.push(leaves);
  return out;
}
/** A árvore inteira (ALTURA 1; o instanciado escala), com braços em volta do tronco (ângulo de ouro). `mid` = a MESMA
 *  árvore pra média distância (70–150 m): tufos nos mesmos lugares (um pouco maiores — cobrem onde estavam as folhas),
 *  sem as folhinhas e sem os braços finos (a essa distância somem), tronco com menos lados (~156 triângulos): a
 *  silhueta não muda ao trocar. */
function branchedTree(o: { top: number; r0: number; limbs: number; limbY: [number, number]; reach: [number, number]; endY: [number, number]; blobR: [number, number]; flat: number; leaves: number; leafL: number; seed: number }, bark: THREE.Color, barkLight: THREE.Color, greens: THREE.Color[], mid = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const lerp = (r: [number, number], t: number) => r[0] + (r[1] - r[0]) * t;
  const leaves = mid ? 0 : o.leaves, blobK = mid ? 1 + (o.leafL / o.blobR[1]) * 0.6 : 1;
  parts.push(limb([V(0, 0, 0), V(0.008, o.top * 0.4, -0.006), V(-0.01, o.top * 0.75, 0.008), V(0, o.top, 0)], o.r0, mid ? 4 : 5, mid ? 2 : 4, bark, barkLight, 0.35));
  for (let i = 0; i < o.limbs; i++) {
    const a = i * 2.39996 + zsHash(o.seed, i, 7) * 0.4, t = (i + 0.5) / o.limbs;
    const y0 = lerp(o.limbY, t), reach = lerp(o.reach, zsHash(o.seed, i, 8)), y1 = lerp(o.endY, zsHash(o.seed, i, 9));
    const end = V(Math.cos(a) * reach, y1, Math.sin(a) * reach);
    if (!mid) parts.push(limb([V(0, y0, 0), V(end.x * 0.5, (y0 + y1) / 2 + 0.03, end.z * 0.5), end], o.r0 * 0.42, 3, 2, bark, barkLight, 0.4));
    parts.push(...tuft(end, lerp(o.blobR, zsHash(o.seed, i, 10)) * blobK, o.flat, leaves, o.leafL, o.seed + i * 13, greens));
  }
  // tufo do alto (fecha a copa no meio)
  parts.push(...tuft(V(0, o.top + o.blobR[1] * 0.5, 0), o.blobR[1] * 1.1 * blobK, o.flat, leaves, o.leafL, o.seed + 991, greens));
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)).map((p) => { p.deleteAttribute('normal'); p.deleteAttribute('uv'); return p; }), false)!;
  parts.forEach((p) => p.dispose());
  g.computeVertexNormals();
  return g;
}
/** Verdes da mata: [tufo escuro, tufo, folha, folha clara]. */
const MATA_GREENS = () => [col('#27502a'), col('#2f5d2a'), col('#3b6b31'), col('#4a7a36')];
// (1ª prova no jogo: tufo 0,075–0,1 deixava a copa rala, "pirulito" — 0,095–0,125 fecha a copa sem perder os braços)
const CANOPY_SHAPE = { top: 0.7, r0: 0.03, limbs: 6, limbY: [0.42, 0.64] as [number, number], reach: [0.17, 0.25] as [number, number],
  endY: [0.68, 0.86] as [number, number], blobR: [0.095, 0.125] as [number, number], flat: 0.8, leaves: 4, leafL: 0.06, seed: 17 };
/** Até aqui (m) o dossel vem COMPLETO (com as folhinhas); depois, até ZS_VEG_NEAR, a versão média (mesma silhueta). */
export const ZS_VEG_DETAIL = 70;

/** Modelos em ALTURA 1 (escala no instanciado). */
function kindGeometry(kind: ZsVegKind): THREE.BufferGeometry {
  const trunk = col('#4a3826'), trunkLight = col('#6b5136');
  switch (kind) {
    // dossel (13–24 m): copa redonda de 6 braços a partir do meio do tronco (perto: com as folhinhas; 70–150 m: `canopyMid`)
    case 'canopy': return branchedTree(CANOPY_SHAPE, trunk, trunkLight, MATA_GREENS());
    case 'canopyMid': return branchedTree(CANOPY_SHAPE, trunk, trunkLight, MATA_GREENS(), true);
    // emergente (26–34 m): fuste alto e limpo, guarda-chuva largo e achatado lá em cima
    case 'emergent': return branchedTree({ top: 0.84, r0: 0.026, limbs: 6, limbY: [0.72, 0.82], reach: [0.22, 0.32], endY: [0.86, 0.94],
      blobR: [0.09, 0.12], flat: 0.5, leaves: 4, leafL: 0.06, seed: 41 }, trunkLight, trunkLight.clone().lerp(col('#a08a6a'), 0.3),
      [col('#355f2b'), col('#3d6a2f'), col('#4a7a36'), col('#5a8a40')]);
    case 'fern': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.035, 0.05, 0.85, 5), 0, 0.42, 0), col('#3a2c1d')),
      ...fronds(9, 0.55, 0.13, 0.3, 0.85, col('#3f7a2c')),
    ])!;
    case 'palm': return mergeGeometries([
      paint(at(new THREE.CylinderGeometry(0.022, 0.035, 0.92, 6), 0.03, 0.46, 0), trunkLight),
      ...fronds(8, 0.42, 0.09, 0.22, 0.92, col('#4f8a35')),
    ])!;
    case 'bush': return paint(at(new THREE.IcosahedronGeometry(0.5, 0), 0, 0.4, 0).scale(1, 0.8, 1), col('#3c6a2e'));
    // árvore BAIXA de cenário (6,6–9,2 m): era bola num palito; agora com braços como as outras (02/11), verde MÉDIO —
    // a de farm de verdade segue a mais clara (dá pra ver qual se colhe)
    case 'farm': return branchedTree({ top: 0.55, r0: 0.045, limbs: 5, limbY: [0.34, 0.54], reach: [0.2, 0.3], endY: [0.6, 0.8],
      blobR: [0.11, 0.14], flat: 0.85, leaves: 3, leafL: 0.07, seed: 73 }, trunk, trunkLight,
      [col('#3b6b31'), col('#4a7a36'), col('#557f3a'), col('#62903c')]);
    // longe: silhueta de árvore ENCOSTADA no chão (a copa sozinha a meia altura parecia "diamante voando")
    case 'far': return paint(at(new THREE.OctahedronGeometry(0.25, 0).scale(1, 1.9, 1), 0, 0.5, 0), col('#2c562a'));
  }
}
/** (testes) a malha de cada tipo — pra conferir o orçamento de triângulos */
export const zsVegGeometry = (kind: ZsVegKind): THREE.BufferGeometry => kindGeometry(kind);
const KINDS: ZsVegKind[] = ['canopy', 'canopyMid', 'emergent', 'fern', 'palm', 'bush', 'farm', 'far'];
const CAP: Record<ZsVegKind, number> = { canopy: 1500, canopyMid: 3500, emergent: 400, fern: 1600, palm: 500, bush: 2200, farm: 400, far: 12000 };
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
const WIDTH: Record<ZsVegKind, number> = { canopy: 0.85, canopyMid: 0.85, emergent: 0.75, fern: 0.9, palm: 0.9, bush: 1.5, farm: 0.9, far: 0.85 };

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
      if (!caveMouthClear(x, z)) continue; // boca da caverna limpa
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
      else if (kind === 'canopy' && d > ZS_VEG_DETAIL) kind = 'canopyMid'; // mesma árvore, sem as folhinhas (02/11)
      const range = kind === 'far' || kind === 'canopyMid' ? ZS_TREE_H.canopy : ZS_TREE_H[kind];
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
  const bases = useRef<{ pb: unknown; nb: unknown; boxes: number[][] }>({ pb: undefined, nb: undefined, boxes: [] });
  useFrame(() => {
    const hx = heroRef.current.x, hz = heroRef.current.z;
    // base nova/mudou (minha ou de outro jogador): refaz a mata em volta sem nada dentro do quadrado dela
    const pb = useGameStore.getState().playerBase, nb = useNet.getState().bases;
    if (pb !== bases.current.pb || nb !== bases.current.nb) { bases.current = { pb, nb, boxes: baseBoxes(pb, nb) }; lastCell.current = ''; }
    const boxes = bases.current.boxes;
    const key = `${Math.floor(hx / ZS_VEG_CELL)}_${Math.floor(hz / ZS_VEG_CELL)}`;
    if (key === lastCell.current) return;
    lastCell.current = key;
    const counts = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<ZsVegKind, number>;
    const shCounts = { canopy: 0, emergent: 0, farm: 0 } as Record<ShadowKind, number>;
    for (const it of zsVegetationAround(t, hx, hz)) {
      if (boxes.length && boxes.some((b) => it.x > b[0]! && it.x < b[2]! && it.z > b[1]! && it.z < b[3]!)) continue;
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
