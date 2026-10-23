/**
 * Casa de PEDRA/METAL com 2 andares + escada/rampa (Pedro, 22/10): a colisão antiga era de 1 andar
 * só — paredes fatiadas numa altura fixa (a escada virava "parede") e piso plano (o 2º andar não
 * existia). Aqui a colisão SEGUE A ALTURA DO HERÓI, sem precisar saber onde fica a escada:
 *  - PISO: raio de cima pra baixo a partir dos pés (+ degrau) contra as superfícies da própria casa
 *    viradas pra cima → degrau de 20–30 cm sobe, rampa sobe, 2º andar vira chão.
 *  - PAREDES: fatias da malha a cada `LEVEL_STEP`; usa a fatia na altura do JOELHO acima do piso em
 *    que ele está → parede de verdade bloqueia, degrau (abaixo do joelho) não.
 * Coordenadas LOCAIS da casa (centro do footprint em XZ, base do modelo em y=0).
 * Casa de MADEIRA e criaturas seguem a colisão antiga (não passam por aqui).
 */
import * as THREE from 'three';
import { MeshBVH, acceleratedRaycast } from 'three-mesh-bvh';

export const LEVEL_STEP = 0.25;
/** Faixa (acima do piso atual) em que uma parede BLOQUEIA: existe em QUALQUER altura entre 0,8 e
 *  1,3 m. Porta (aberta em todas) passa; janela (fechada abaixo do peitoril) segura. A escada das
 *  casas é ÍNGREME (~45°, degrau 0,3–0,4 m): abaixo de 0,8 m o degrau da frente virava parede
 *  (medido: travava a 1,8 m). No TÉRREO soma ainda a fatia antiga (`legacy`, 1,54 m) → nunca fica
 *  mais aberto que antes (teste `casa-dois-andares` nas malhas reais). */
export const WALL_BAND: readonly [number, number] = [0.8, 1.3];
/** Até essa altura (local) dos pés vale também a fatia antiga do térreo. */
export const LEGACY_UNTIL = 1.0;
/** Quanto o herói sobe de uma vez (degrau). */
export const HOUSE_STEP_UP = 0.45;

export type HouseLevels = { step: number; segs: number[][]; band?: Map<number, number[]> };

/** Fatias de parede (segmentos XZ) a cada `step` m, de 0 até o topo. `tris` = [ax,ay,az,bx,...]. */
export function sliceLevels(tris: ArrayLike<number>, top: number, step = LEVEL_STEP): HouseLevels {
  const n = Math.max(1, Math.ceil(top / step) + 1);
  const segs: number[][] = Array.from({ length: n }, () => []);
  const pts: number[] = [];
  for (let i = 0; i + 8 < tris.length; i += 9) {
    const ay = tris[i + 1]!, by = tris[i + 4]!, cy = tris[i + 7]!;
    const lo = Math.max(0, Math.ceil(Math.min(ay, by, cy) / step));
    const hi = Math.min(n - 1, Math.floor(Math.max(ay, by, cy) / step));
    for (let k = lo; k <= hi; k++) {
      const h = k * step;
      pts.length = 0;
      const cut = (p: number, q: number) => {
        const py = tris[p + 1]! - h, qy = tris[q + 1]! - h;
        if ((py <= 0 && qy > 0) || (py > 0 && qy <= 0)) {
          const t = py / (py - qy);
          pts.push(tris[p]! + (tris[q]! - tris[p]!) * t, tris[p + 2]! + (tris[q + 2]! - tris[p + 2]!) * t);
        }
      };
      cut(i, i + 3); cut(i + 3, i + 6); cut(i + 6, i);
      if (pts.length === 4) {
        const dx = pts[2]! - pts[0]!, dz = pts[3]! - pts[1]!;
        if (dx * dx + dz * dz > 0.0025) segs[k]!.push(pts[0]!, pts[1]!, pts[2]!, pts[3]!); // ignora < 5 cm
      }
    }
  }
  return { step, segs };
}

/** Segmentos de parede pra quem está com os pés em `feetRel` (altura local): junta as fatias da
 *  faixa `WALL_BAND` acima do piso (cache por fatia de partida). `legacy` = fatia antiga do térreo,
 *  somada enquanto os pés estão abaixo de `LEGACY_UNTIL`. */
export function levelSegs(levels: HouseLevels, feetRel: number, legacy?: number[]): number[] {
  const last = levels.segs.length - 1;
  const lo = Math.min(last, Math.max(0, Math.round((feetRel + WALL_BAND[0]) / levels.step)));
  const hi = Math.min(last, Math.max(lo, Math.round((feetRel + WALL_BAND[1]) / levels.step)));
  const withLegacy = !!legacy && feetRel < LEGACY_UNTIL;
  const key = withLegacy ? -1 - lo : lo;
  levels.band ??= new Map();
  const cached = levels.band.get(key);
  if (cached) return cached;
  const out: number[] = withLegacy ? [...legacy!] : [];
  for (let k = lo; k <= hi; k++) for (const v of levels.segs[k] ?? []) out.push(v);
  levels.band.set(key, out);
  return out;
}

/** Malha (com BVH) só das superfícies que dá pra PISAR (viradas pra cima: piso, degrau, rampa). */
export function buildFloorMesh(tris: ArrayLike<number>): THREE.Mesh | null {
  const keep: number[] = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3();
  for (let i = 0; i + 8 < tris.length; i += 9) {
    a.set(tris[i]!, tris[i + 1]!, tris[i + 2]!);
    b.set(tris[i + 3]!, tris[i + 4]!, tris[i + 5]!);
    c.set(tris[i + 6]!, tris[i + 7]!, tris[i + 8]!);
    nrm.crossVectors(b.sub(a), c.sub(a));
    const len = nrm.length();
    if (len < 1e-8 || nrm.y / len < 0.5) continue; // parede/teto/face pra baixo
    for (let j = 0; j < 9; j++) keep.push(tris[i + j]!);
  }
  if (keep.length === 0) return null;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(keep, 3));
  (geo as unknown as { boundsTree: MeshBVH }).boundsTree = new MeshBVH(geo);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  mesh.raycast = acceleratedRaycast;
  mesh.updateMatrixWorld(true);
  return mesh;
}

const ray = new THREE.Raycaster();
(ray as unknown as { firstHitOnly: boolean }).firstHitOnly = true;
const ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Piso da casa sob os pés (local): raio de `feetRel + degrau` pra baixo. null = nada. */
export function floorBelow(mesh: THREE.Mesh, x: number, z: number, feetRel: number): number | null {
  ORIGIN.set(x, feetRel + HOUSE_STEP_UP, z);
  ray.set(ORIGIN, DOWN);
  ray.far = HOUSE_STEP_UP + 8; // alcança o térreo saindo da borda do 2º andar
  const hit = ray.intersectObject(mesh, false)[0];
  return hit ? hit.point.y : null;
}

/** Junta os triângulos de um objeto (já com matrixWorld) num array plano [ax,ay,az,...]. */
export function collectTris(root: THREE.Object3D): Float32Array {
  root.updateMatrixWorld(true);
  let count = 0;
  root.traverse((m) => {
    const g = (m as THREE.Mesh).isMesh ? (m as THREE.Mesh).geometry : null;
    if (g) count += g.getIndex()?.count ?? g.getAttribute('position').count;
  });
  const out = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  let o = 0;
  root.traverse((m) => {
    const mesh = m as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const idx = mesh.geometry.getIndex();
    const n = idx ? idx.count : pos.count;
    for (let i = 0; i < n; i++) {
      v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      out[o++] = v.x; out[o++] = v.y; out[o++] = v.z;
    }
  });
  return out;
}
