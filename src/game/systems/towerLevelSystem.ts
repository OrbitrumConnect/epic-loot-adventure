import { BASE_PIECES, BASE_TOWER_HEIGHT, type BaseCost, type TowerCombat } from '../data/base-pieces';
import { BASE_TYPES } from '../data/base-types';
import type { BasePiece, BaseType } from '../types/playerbase';

export const MAX_TOWER_LEVEL = 20;
const START_LEVEL = [1, 8, 15] as const;
export type TowerLevelStats = Readonly<TowerCombat & { hp: number }>;

/** Saves antigos herdam o nível de construção; entradas externas ficam limitadas. */
export function resolveTowerLevel(tier: BasePiece['tier'], level?: number): number {
  return level === undefined || !Number.isFinite(level)
    ? START_LEVEL[tier - 1]!
    : Math.max(1, Math.min(MAX_TOWER_LEVEL, Math.floor(level)));
}

// Calculada uma vez: seleção de alvo e dano só consultam a tabela no quadro.
const STATS: readonly TowerLevelStats[] = Array.from({ length: MAX_TOWER_LEVEL }, (_, index) => {
  const level = index + 1;
  const low = level <= 8 ? 0 : 1;
  const t = (level - START_LEVEL[low]!) / 7;
  const a = BASE_PIECES.tower.combat![low]!;
  const b = BASE_PIECES.tower.combat![low + 1]!;
  const interpolate = (from: number, to: number) => from + (to - from) * t;
  return Object.freeze({
    hp: interpolate(BASE_PIECES.tower.hp[low]!, BASE_PIECES.tower.hp[low + 1]!),
    range: interpolate(a.range, b.range), damage: interpolate(a.damage, b.damage),
    cooldownMs: Math.max(1, interpolate(a.cooldownMs, b.cooldownMs)),
  });
});

export function towerLevelStats(tier: BasePiece['tier'], level?: number): TowerLevelStats {
  return STATS[resolveTowerLevel(tier, level) - 1]!;
}

/** Material da faixa de destino; custo crescente dentro da faixa, com desconto da oficina. */
export function towerUpgradeCost(tier: BasePiece['tier'], level?: number, baseType?: BaseType): BaseCost[] {
  const current = resolveTowerLevel(tier, level);
  if (current === MAX_TOWER_LEVEL) return [];
  const next = current + 1;
  const band = next < 8 ? 0 : next < 15 ? 1 : 2;
  const multiplier = 1 + (next - START_LEVEL[band]!) / 7;
  const discount = baseType ? BASE_TYPES[baseType].cost : 1;
  return BASE_PIECES.tower.cost[band]!.map(c => ({
    itemId: c.itemId, quantity: Math.max(1, Math.floor(Math.ceil(c.quantity * multiplier) * discount)),
  }));
}

export function towerHeight(tier: BasePiece['tier'], level?: number): number {
  return BASE_TOWER_HEIGHT * (1 + (resolveTowerLevel(tier, level) - 1) / (MAX_TOWER_LEVEL - 1) * 0.5);
}
