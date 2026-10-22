import type { PlayerState } from '../types';
import type { ItemStats } from '../types/item';
import { ITEMS } from '../data/items';

const EQUIPMENT_KEYS = ['armor', 'accessory', 'head', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2'] as const;

/** Soma stats absolutos dos itens equipados; armor legado prevalece sobre defense duplicada. */
export function equipmentStats(player: Pick<PlayerState, 'inventory'>): Required<ItemStats> {
  const total: Required<ItemStats> = { health: 0, defense: 0, damage: 0, resistance: 0, speed: 0, luck: 0 };
  for (const key of EQUIPMENT_KEYS) {
    const id = player.inventory.equipment[key];
    if (!id) continue;
    const item = ITEMS[id];
    if (!item) continue;
    const stats = item.stats ?? {};
    for (const stat of Object.keys(total) as (keyof ItemStats)[]) {
      if (stat === 'defense' && item.armor !== undefined) total.defense += item.armor;
      else total[stat] += stats[stat] ?? 0;
    }
  }
  return total;
}

/** Teto derivado. `player.maxHp` permanece valor base persistido/progredido. */
export function effectiveMaxHp(player: Pick<PlayerState, 'maxHp' | 'inventory'>): number {
  return player.maxHp + equipmentStats(player).health;
}

/** Luck: +1% relative drop chance per point, capped at +50%. */
export const LUCK_RELATIVE_PER_POINT = 0.01;
export const LUCK_RELATIVE_MAX = 0.5;
/** Resistance: 0.5% damage reduction per point, capped at 40%. */
export const RESISTANCE_PER_POINT = 0.005;
export const RESISTANCE_MAX = 0.4;

export function luckMultiplier(luck: number): number {
  return 1 + Math.min(LUCK_RELATIVE_MAX, Math.max(0, luck) * LUCK_RELATIVE_PER_POINT);
}

export function effectiveResistance(resistance: number): number {
  return Math.min(RESISTANCE_MAX, Math.max(0, resistance) * RESISTANCE_PER_POINT);
}
