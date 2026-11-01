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
import { floorBelow, levelSegs } from './house-levels';
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
 * Casa de 2 andares (pedra/metal): piso caminhável sob os pés do jogador — degrau, rampa e 2º
 * andar. `-Infinity` = fora da casa, casa de madeira (usa o piso antigo) ou nada embaixo.
 */
export function houseWalkFloorY(px: number, pz: number, feetY: number): number {
  const h = houseCollider.current;
  if (!h?.floorMesh || h.baseY === undefined) return -Infinity;
  if (Math.abs(px - h.cx) > h.halfX || Math.abs(pz - h.cz) > h.halfZ) return -Infinity;
  const y = floorBelow(h.floorMesh, px - h.cx, pz - h.cz, feetY - h.baseY);
  return y === null ? -Infinity : h.baseY + y;
}

/**
 * Paredes da casa sólidas usando os segmentos REAIS do modelo (altura do peito).
 * Onde não há segmento (vão da porta) passa. `self` = raio do corpo.
 * `feetY` (só o jogador): na casa de 2 andares usa a fatia no JOELHO acima do piso em que ele
 * está (escada não vira parede; no 2º andar valem as paredes de cima). Sem `feetY` (criaturas) ou
 * casa de madeira: a fatia única de sempre.
 */
/** Raio do corpo do jogador contra as paredes da casa de 2 andares (escada estreita). */
export const HOUSE_BODY = 0.38;

export function pushOutHouseWalls(x: number, z: number, self: number, feetY?: number): [number, number] {
  const h = houseCollider.current;
  if (!h || !HOUSE_WALLS_SOLID) return [x, z];
  const byFloor = !!h.levels && h.baseY !== undefined && feetY !== undefined && Number.isFinite(feetY);
  const segs = byFloor ? levelSegs(h.levels!, feetY! - h.baseY!, h.wallSegs) : h.wallSegs;
  // Casa de 2 andares: corpo efetivo 0,5 m (0,38 + 0,12). Com 0,62 a escada de PEDRA (estreita) travava
  // — Pedro subia pulando (medido na malha real, `casa-dois-andares.test`). Madeira/criaturas: igual.
  const R = (byFloor ? Math.min(self, HOUSE_BODY) : self) + 0.12; // raio do corpo + meia-espessura da parede
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

/** O segmento AB (chão, XZ) cruza algum segmento de parede (relativo a cx,cz)? `accept(t)` (opcional): só conta o
 *  cruzamento no ponto `t` (0..1 ao longo de AB) que ele aceitar. */
function crossesSegs(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, segs: number[], accept?: (t: number) => boolean): boolean {
  const rx = bx - ax, rz = bz - az;
  for (let i = 0; i < segs.length; i += 4) {
    const px = cx + segs[i]!, pz = cz + segs[i + 1]!;
    const sx = segs[i + 2]! - segs[i]!, sz = segs[i + 3]! - segs[i + 1]!;
    const den = rx * sz - rz * sx;
    if (Math.abs(den) < 1e-9) continue; // paralelos
    const t = ((px - ax) * sz - (pz - az) * sx) / den;
    const u = ((px - ax) * rz - (pz - az) * rx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1 && (!accept || accept(t))) return true;
  }
  return false;
}

/** Passo (m) da linha de tiro dentro da casa de 2 andares (testa a parede da altura de cada trecho). */
const SHOT_STEP_IN_HOUSE = 0.4;

/**
 * Linha de tiro: parede GRANDE no caminho? Casa (pedra/metal) e fábricas bloqueiam; muro/torre
 * da base (finos) deixam passar — decisão do Pedro (22/10). Pela porta/abertura passa.
 * COM ALTURA (01/11, Pedro: "atirando, a bala vai lá e mal pega — nem tá tão longe"; ele atirava da VARANDA/2º andar
 * do Salão da Tribo): antes a conta era só no chão (2D) com a parede do TÉRREO — de cima, todo tiro pra fora "batia"
 * nela e virava tiro no vazio (a bala desenhava, sem dano). Com `ay`/`by` (altura de quem atira e do alvo): na casa de
 * 2 andares vale a parede DA ALTURA por onde a linha passa (janela e porta deixam passar; por cima do telhado passa);
 * na de madeira, só bloqueia abaixo do topo dela. Sem altura: como antes.
 */
export function bigWallBetween(ax: number, az: number, bx: number, bz: number, ay?: number, by?: number): boolean {
  const h = houseCollider.current;
  if (h && HOUSE_WALLS_SOLID) {
    const has3d = ay !== undefined && by !== undefined && Number.isFinite(ay) && Number.isFinite(by);
    if (has3d && h.levels && h.baseY !== undefined) {
      if (shotCrossesHouseLevels(h.levels, h.baseY, h.cx, h.cz, h.halfX, h.halfZ, ax, ay!, az, bx, by!, bz)) return true;
    } else if (has3d && h.topY !== undefined) {
      if (crossesSegs(ax, az, bx, bz, h.cx, h.cz, h.wallSegs, (t) => ay! + (by! - ay!) * t < h.topY!)) return true;
    } else if (crossesSegs(ax, az, bx, bz, h.cx, h.cz, h.wallSegs)) return true;
  }
  if (FACTORY_WALLS_SOLID) {
    for (const f of factoryColliders) if (crossesSegs(ax, az, bx, bz, f.cx, f.cz, f.wallSegs)) return true;
  }
  return false;
}

/** A linha 3D A→B cruza uma parede da casa de 2 andares NA ALTURA em que passa? Anda em trechos de
 *  `SHOT_STEP_IN_HOUSE` só dentro do retângulo da casa (+1 m); cada trecho testa a fatia de parede da altura dele. */
export function shotCrossesHouseLevels(
  levels: { step: number; segs: number[][] }, baseY: number, cx: number, cz: number, halfX: number, halfZ: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
): boolean {
  // recorta A→B no retângulo da casa (+1 m) — fora dele não há parede
  const dx = bx - ax, dz = bz - az;
  let t0 = 0, t1 = 1;
  for (const [p, d, lo, hi] of [[ax, dx, cx - halfX - 1, cx + halfX + 1], [az, dz, cz - halfZ - 1, cz + halfZ + 1]] as const) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let ta = (lo - p) / d, tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  const len = Math.hypot(dx, dz) * (t1 - t0);
  const n = Math.max(1, Math.ceil(len / SHOT_STEP_IN_HOUSE));
  for (let k = 0; k < n; k++) {
    const s0 = t0 + ((t1 - t0) * k) / n, s1 = t0 + ((t1 - t0) * (k + 1)) / n, sm = (s0 + s1) / 2;
    const slice = levels.segs[Math.round((ay + (by - ay) * sm - baseY) / levels.step)];
    if (!slice || slice.length === 0) continue; // acima do telhado / abaixo do piso / vão
    if (crossesSegs(ax + dx * s0, az + dz * s0, ax + dx * s1, az + dz * s1, cx, cz, slice)) return true;
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
