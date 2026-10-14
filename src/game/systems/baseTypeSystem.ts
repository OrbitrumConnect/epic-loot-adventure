import { BASE_TYPES } from '../data/base-types';
import { pieceCost, pieceMaxHp } from '../data/base-pieces';
import type { BasePieceKind, BaseType } from '../types/playerbase';

export function basePieceCost(kind: BasePieceKind, tier: 1 | 2 | 3, type?: BaseType) {
  const cost = pieceCost(kind, tier);
  if (!type || BASE_TYPES[type].cost === 1) return cost;
  // Por recurso e por peça: preview, entrega e cobrança usam o mesmo arredondamento.
  return cost.map(c => ({ ...c, quantity: Math.max(1, Math.floor(c.quantity * BASE_TYPES[type].cost)) }));
}
export function basePieceMaxHp(kind: BasePieceKind, tier: 1 | 2 | 3, type?: BaseType): number {
  return Math.round(pieceMaxHp(kind, tier) * (type ? BASE_TYPES[type].hp : 1));
}
export function baseTowerRange(range: number, type?: BaseType): number {
  return range * (type ? BASE_TYPES[type].range : 1);
}
