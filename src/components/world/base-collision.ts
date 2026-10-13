/**
 * Colisão da base compartilhada entre o PLAYER (game-world) e as CRIATURAS
 * (hostile-ai) — mesma lógica, sem reinventar. O raio do corpo entra por
 * parâmetro (player ~0.5, criatura ~0.5). Lê `houseCollider` (publicado pela
 * casa) e `playerBase.pieces` (a cerca) do store.
 */
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { houseCollider, HOUSE_WALLS_SOLID } from './house-collider';

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

/** Cerca da base sólida (muro + torre bloqueiam; portão/core/telhado passam). */
export function pushOutBasePieces(x: number, z: number, self: number): [number, number] {
  const base = useGameStore.getState().playerBase;
  if (!base) return [x, z];
  let rx = x, rz = z;
  for (const p of base.pieces) {
    if (p.kind !== 'wall' && p.kind !== 'tower') continue; // portão/core/telhado: passa
    const ctr = cellCenter(p.cell);
    [rx, rz] = pushCircle(rx, rz, ctr.x, ctr.z, p.kind === 'tower' ? 1.0 : 0.9, self);
  }
  return [rx, rz];
}
