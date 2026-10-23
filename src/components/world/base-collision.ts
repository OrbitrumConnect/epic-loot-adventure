/**
 * Colisão da base compartilhada entre o PLAYER (game-world) e as CRIATURAS
 * (hostile-ai) — mesma lógica, sem reinventar. O raio do corpo entra por
 * parâmetro (player ~0.5, criatura ~0.5). Lê `houseCollider` (publicado pela
 * casa) e `playerBase.pieces` (a cerca) do store.
 */
import { useGameStore } from '@/game/state/game-store';
import { useNet } from '@/net/multiplayer';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { BASE_GRID } from '@/game/types/playerbase';
import { BASE_TRAINING_WIDTH } from '@/game/data/base-pieces';
import { houseCollider, HOUSE_WALLS_SOLID } from './house-collider';
import { factoryColliders, FACTORY_WALLS_SOLID, FACTORY_ROOF_CUT } from './factory-collider';
import { trainingColliders } from './training-collider';

/** Empurra (x,z) pra fora de um círculo sólido de raio r, deslize natural. */
function pushCircle(x: number, z: number, ox: number, oz: number, r: number, self: number): [number, number] {
  const dx = x - ox, dz = z - oz;
  const d = Math.hypot(dx, dz);
  const min = r + self;
  if (d < min && d > 1e-4) {
    const push = min - d;
    return [x + (dx / d) * push, z + (dz / d) * push];
  }
  return [x, z];
}

/** Altura do assoalho da casa quando (px,pz) está dentro do footprint (senão -∞). */
export function houseFloorSurfaceY(px: number, pz: number): number {
  const h = houseCollider.current;
  if (!h) return -Infinity;
  if (Math.abs(px - h.cx) <= h.halfX && Math.abs(pz - h.cz) <= h.halfZ) return h.floorY;
  return -Infinity;
}

/**
 * Paredes da casa sólidas usando os segmentos REAIS do modelo (altura do peito).
 * Onde não há segmento (vão da porta) passa. `self` = raio do corpo.
 */
export function pushOutHouseWalls(x: number, z: number, self: number): [number, number] {
  const h = houseCollider.current;
  if (!h || !HOUSE_WALLS_SOLID) return [x, z];
  const segs = h.wallSegs;
  const R = self + 0.12; // raio do corpo + meia-espessura da parede
  let rx = x, rz = z;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = h.cx + segs[i]!, az = h.cz + segs[i + 1]!;
    const ex = segs[i + 2]! - segs[i]!, ez = segs[i + 3]! - segs[i + 1]!;
    const len2 = ex * ex + ez * ez || 1e-6;
    let t = ((rx - ax) * ex + (rz - az) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = rx - (ax + ex * t), dz = rz - (az + ez * t);
    const d = Math.hypot(dx, dz);
    if (d < R && d > 1e-4) {
      const push = R - d;
      rx += (dx / d) * push;
      rz += (dz / d) * push;
    }
  }
  return [rx, rz];
}

/** Empurra (x,z) pra fora dos SEGMENTOS de parede (relativos a cx,cz). */
function pushOutSegs(x: number, z: number, cx: number, cz: number, segs: number[], R: number): [number, number] {
  let rx = x, rz = z;
  for (let i = 0; i < segs.length; i += 4) {
    const ax = cx + segs[i]!, az = cz + segs[i + 1]!;
    const ex = segs[i + 2]! - segs[i]!, ez = segs[i + 3]! - segs[i + 1]!;
    const len2 = ex * ex + ez * ez || 1e-6;
    let t = ((rx - ax) * ex + (rz - az) * ez) / len2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = rx - (ax + ex * t), dz = rz - (az + ez * t);
    const d = Math.hypot(dx, dz);
    if (d < R && d > 1e-4) { const push = R - d; rx += (dx / d) * push; rz += (dz / d) * push; }
  }
  return [rx, rz];
}

/** Paredes das FÁBRICAS sólidas (entra pela abertura); vale pra player e criatura. */
export function pushOutFactoryWalls(x: number, z: number, self: number): [number, number] {
  if (!FACTORY_WALLS_SOLID) return [x, z];
  let rx = x, rz = z;
  for (const f of factoryColliders) [rx, rz] = pushOutSegs(rx, rz, f.cx, f.cz, f.wallSegs, self + 0.12);
  return [rx, rz];
}

/** Dentro de alguma fábrica? Retorna o Y do corte do teto, ou null. */
export function factoryRoofCutY(px: number, pz: number): number | null {
  for (const f of factoryColliders) {
    if (Math.abs(px - f.cx) <= f.halfX && Math.abs(pz - f.cz) <= f.halfZ) return f.baseY + FACTORY_ROOF_CUT;
  }
  return null;
}

/** O segmento AB (chão, XZ) cruza algum segmento de parede (relativo a cx,cz)? */
function crossesSegs(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, segs: number[]): boolean {
  const rx = bx - ax, rz = bz - az;
  for (let i = 0; i < segs.length; i += 4) {
    const px = cx + segs[i]!, pz = cz + segs[i + 1]!;
    const sx = segs[i + 2]! - segs[i]!, sz = segs[i + 3]! - segs[i + 1]!;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) continue; // paralelos
    const t = ((px - ax) * sz - (pz - az) * sx) / den;
    const u = ((px - ax) * rz - (pz - az) * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) return true;
  }
  return false;
}

/**
 * Linha de tiro: parede GRANDE no caminho? Casa (pedra/metal) e fábricas bloqueiam; muro/torre
 * da base (finos) deixam passar — decisão do Pedro (22/10). Pela porta/abertura passa.
 */
export function bigWallBetween(ax: number, az: number, bx: number, bz: number): boolean {
  const h = houseCollider.current;
  if (h && HOUSE_WALLS_SOLID && crossesSegs(ax, az, bx, bz, h.cx, h.cz, h.wallSegs)) return true;
  if (FACTORY_WALLS_SOLID) {
    for (const f of factoryColliders) if (crossesSegs(ax, az, bx, bz, f.cx, f.cz, f.wallSegs)) return true;
  }
  return false;
}

/** Muro, torre e centro bloqueiam; portão/core/telhado passam. */
export function pushOutBasePieces(x: number, z: number, self: number): [number, number] {
  const base = useGameStore.getState().playerBase;
  if (!base) return pushOutRemoteBases(x, z, self);
  let rx = x, rz = z;
  for (const p of base.pieces) {
    if (p.kind === 'training') {
      // Fallback sólido durante carregamento do GLB; footprint publicado substitui as medidas.
      let cx = (p.cell.gx + 0.5) * BASE_GRID, cz = (p.cell.gz + 0.5) * BASE_GRID;
      let halfX = BASE_TRAINING_WIDTH / 2, halfZ = BASE_TRAINING_WIDTH / 2;
      for (const collider of trainingColliders) {
        if (collider.pieceId !== p.id) continue;
        cx = collider.cx; cz = collider.cz; halfX = collider.halfX; halfZ = collider.halfZ;
        break;
      }
      const dx = rx - cx, dz = rz - cz;
      const overlapX = halfX + self - Math.abs(dx), overlapZ = halfZ + self - Math.abs(dz);
      if (overlapX > 0 && overlapZ > 0) {
        if (overlapX < overlapZ) rx += (dx < 0 ? -1 : 1) * overlapX;
        else rz += (dz < 0 ? -1 : 1) * overlapZ;
      }
      continue;
    }
    if (p.kind !== 'wall' && p.kind !== 'tower') continue; // portão/core/telhado: passa
    const ctr = cellCenter(p.cell);
    [rx, rz] = pushCircle(rx, rz, ctr.x, ctr.z, p.kind === 'tower' ? 1.0 : 0.9, self);
  }
  return pushOutRemoteBases(rx, rz, self);
}

/** Online: muro/torre das bases dos OUTROS jogadores também são sólidos (antes atravessava). */
function pushOutRemoteBases(x: number, z: number, self: number): [number, number] {
  const bases = useNet.getState().bases;
  let rx = x, rz = z;
  for (const id in bases) {
    const pieces = bases[id]?.pieces;
    if (!pieces) continue;
    for (const p of pieces) {
      if (p.kind !== 'wall' && p.kind !== 'tower') continue;
      const ctr = cellCenter(p.cell);
      [rx, rz] = pushCircle(rx, rz, ctr.x, ctr.z, p.kind === 'tower' ? 1.0 : 0.9, self);
    }
  }
  return [rx, rz];
}
