/**
 * Economia de loot (Fase 7) — raridade por MARCO DE VALOR de caça.
 *
 * Direção selada: matar dá ACESSO a tabelas de raridade melhores conforme o
 * VALOR acumulado de caça (não o abate cru — 500 galinhas ≠ 100 bichos duros).
 * O acesso é gate; o drop em si é um ROLL, ponderado pela dificuldade da
 * criatura e reduzido por diminishing returns (farmar a mesma espécie cansa).
 *
 * É ADITIVO: fica POR CIMA da `lootTable` garantida de cada criatura (os drops
 * comuns continuam iguais). Com valor baixo, nunca dá bônus → zero regressão.
 */
import type { CreatureDefinition } from '../types';
import { creatureXp } from './progressionSystem';

/** Drop de bônus: item garantidamente identificado (itemId nunca nulo). */
export type BonusDrop = { itemId: string; quantity: number };

export type BonusRarity = 'rare' | 'epic' | 'mythic';

/** Valor de caça acumulado necessário pra DESBLOQUEAR cada raridade de bônus. */
export const HUNT_THRESHOLDS: Record<BonusRarity, number> = { rare: 180, epic: 300, mythic: 500 };

/** Pools de recompensa por raridade (itens que existem em `ITEMS`). */
export const BONUS_POOLS: Record<BonusRarity, readonly string[]> = {
  rare: ['hunter_bow', 'bone_armor', 'iron_axe', 'iron_pickaxe', 'gold_ore', 'arcane_essence'],
  epic: ['ancestral_blade', 'guardian_plate'],
  mythic: ['eclipse_blade'],
};

type Def = Pick<CreatureDefinition, 'maxHp' | 'attackPower' | 'armor'>;

/** Valor de caça de uma criatura (dificuldade). Reusa `creatureXp`. */
export function huntValueOf(def: Def): number {
  return creatureXp(def);
}

/** Raridades de bônus acessíveis com o valor acumulado (ordem crescente). */
export function accessibleRarities(huntValue: number): BonusRarity[] {
  const out: BonusRarity[] = [];
  if (huntValue >= HUNT_THRESHOLDS.rare) out.push('rare');
  if (huntValue >= HUNT_THRESHOLDS.epic) out.push('epic');
  if (huntValue >= HUNT_THRESHOLDS.mythic) out.push('mythic');
  return out;
}

/**
 * Rola um drop BÔNUS de raridade (além da lootTable garantida). Devolve o item
 * ou null. `huntValue` é o acumulado (gate de acesso), `speciesSeen` quantas
 * vezes essa espécie já foi abatida (diminishing returns). Puro e testável.
 */
export function rollBonusLoot(
  def: Def,
  huntValue: number,
  speciesSeen: number,
  rng: () => number = Math.random,
): BonusDrop | null {
  const tiers = accessibleRarities(huntValue);
  if (tiers.length === 0) return null;

  const value = creatureXp(def);
  // Chance base pela dificuldade: bicho forte dropa mais (≈2%–45%).
  let chance = Math.min(0.45, 0.02 + value / 500);
  // Diminishing returns: repetir a mesma espécie derruba a chance (cap em ~/3,4).
  const eff = Math.min(speciesSeen, 12);
  chance /= 1 + eff * 0.2;
  if (rng() >= chance) return null;

  // Raridade: pondera pros tiers acessíveis, puxando pro topo quanto mais forte
  // a criatura. Base rara mais provável, mítica rara.
  const weight: Record<BonusRarity, number> = {
    rare: 6,
    epic: 2 + value / 200,
    mythic: 0.5 + value / 400,
  };
  const pool = tiers
    .map(t => ({ t, w: weight[t], items: BONUS_POOLS[t] }))
    .filter(x => x.w > 0 && x.items.length > 0);
  const total = pool.reduce((s, x) => s + x.w, 0);
  if (total <= 0) return null;

  let r = rng() * total;
  let picked = pool[0]!;
  for (const x of pool) { r -= x.w; if (r <= 0) { picked = x; break; } }

  const itemId = picked.items[Math.floor(rng() * picked.items.length)]!;
  return { itemId, quantity: 1 };
}
