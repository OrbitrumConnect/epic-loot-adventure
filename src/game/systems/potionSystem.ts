import type { InventoryState } from '../types';
import { ITEMS } from '../data/items';
import { removeItem } from './inventorySystem';

/**
 * Abaixo desta fração de vida o jogador bebe sozinho durante luta manual
 * (com `autoPotion` ligado). É um pouco acima do recuo do piloto (0.35).
 */
export const AUTO_DRINK_HP_RATIO = 0.4;

/** Poção usada como fallback quando as poções infinitas de dev estão ligadas. */
export const FALLBACK_HEAL_ITEM = 'health_potion';

/** Regra pura: o mundo chama a cada quadro/tick; sem timers aqui. */
export function shouldAutoDrink(
  player: { hp: number; maxHp: number; dead: boolean },
  autoPotion: boolean,
): boolean {
  if (!autoPotion || player.dead) return false;
  if (player.hp <= 0) return false;
  return player.hp < player.maxHp * AUTO_DRINK_HP_RATIO;
}

/**
 * Melhor cura da mochila (maior `healAmount` em estoque). Com `infinite` e sem
 * nenhuma cura, devolve a poção de vida mesmo assim.
 */
export function findBestHealItem(inventory: InventoryState, infinite = false): string | null {
  let bestId: string | null = null;
  let bestHeal = 0;
  for (const slot of inventory.slots) {
    if (!slot.itemId || slot.quantity <= 0) continue;
    const item = ITEMS[slot.itemId];
    if (!item?.usable) continue;
    const heal = item.healAmount ?? 0;
    if (heal > bestHeal) {
      bestHeal = heal;
      bestId = item.id;
    }
  }
  if (bestId == null && infinite) return FALLBACK_HEAL_ITEM;
  return bestId;
}

export type DrinkResult = {
  ok: boolean;
  itemId: string | null;
  healed: number;
  hp: number;
  inventory: InventoryState;
  message: string;
};

/** Bebe a melhor cura. Com `infinite`, não gasta o item. */
export function drinkBestPotion(
  inventory: InventoryState,
  hp: number,
  maxHp: number,
  infinite = false,
): DrinkResult {
  const itemId = findBestHealItem(inventory, infinite);
  if (!itemId) {
    return { ok: false, itemId: null, healed: 0, hp, inventory, message: 'Você não tem nenhuma poção.' };
  }
  if (hp >= maxHp) {
    return { ok: false, itemId, healed: 0, hp, inventory, message: 'Sua vida já está cheia.' };
  }
  const item = ITEMS[itemId]!;
  const heal = item.healAmount ?? 0;
  const newHp = Math.min(maxHp, hp + heal);
  const consume = !infinite;
  return {
    ok: true,
    itemId,
    healed: newHp - hp,
    hp: newHp,
    inventory: consume ? removeItem(inventory, itemId, 1) : inventory,
    message: `${item.name} utilizada. +${newHp - hp} de vida.`,
  };
}
