/**
 * Peças da base como alvo de criaturas hostis.
 *
 * `hostile-ai.ts` chama `nearestBasePiece` no laço de quadro; para não varrer a
 * store nem alocar, os centros das peças ficam em arrays planos reconstruídos só
 * quando a identidade de `playerBase.pieces` muda (igual a `creatureById`).
 * A cama (`core`) fica de fora: um lobo que passa correndo não deve apagar a
 * base inteira (o wipe é consequência de cerco, não de acidente).
 */
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import type { BasePiece } from '@/game/types/playerbase';

/** Distância máxima (centro da peça -> criatura) para contar como "encostada". */
export const BASE_HIT_RANGE = 2.3;

export type BaseTarget = { id: string; kind: BasePiece['kind']; x: number; z: number };

let cachedPieces: BasePiece[] | null = null;
let targets: BaseTarget[] = [];
const result: BaseTarget = { id: '', kind: 'wall', x: 0, z: 0 };

function refresh(): void {
  const base = useGameStore.getState().playerBase;
  const pieces = base ? base.pieces : null;
  if (pieces === cachedPieces) return;
  cachedPieces = pieces;
  targets = [];
  if (!pieces) return;
  for (const p of pieces) {
    if (p.kind === 'core') continue;
    const c = cellCenter(p.cell);
    targets.push({ id: p.id, kind: p.kind, x: c.x, z: c.z });
  }
}

/** Peça mais próxima dentro de `reach` metros de (x, z), ou null. Resultado reaproveitado. */
export function nearestBasePiece(x: number, z: number, reach: number = BASE_HIT_RANGE): BaseTarget | null {
  refresh();
  let best: BaseTarget | null = null;
  let bestD = reach * reach;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const dx = t.x - x;
    const dz = t.z - z;
    const d = dx * dx + dz * dz;
    if (d < bestD) { bestD = d; best = t; }
  }
  if (!best) return null;
  result.id = best.id;
  result.kind = best.kind;
  result.x = best.x;
  result.z = best.z;
  return result;
}
