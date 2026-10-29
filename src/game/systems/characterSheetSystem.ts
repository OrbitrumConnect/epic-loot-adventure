/**
 * FICHA DO PERSONAGEM (inventário elite, 29/10 — Pedro: "herói ao lado, nome, nível, XP, onde equipar… nível MIR4").
 * Só LÊ as regras que já valem no combate — nenhum número novo de jogo: o ataque é a MESMA conta do golpe
 * (`game-store` → base do nível + arma na mão + dano do equipamento, × atributo de dano), a defesa/resistência é a
 * mesma da mitigação, crítico pela destreza. O "Poder" é só um resumo pra comparar equipamentos (não entra em conta).
 */
import { ITEMS } from '../data/items';
import { weaponRangeFor } from '../data/weapons';
import type { PlayerState } from '../types';
import { damageMultiplier, effectiveAttributes, effectiveMaxWeight, mitigateDamage, playerCritStats } from './attributesSystem';
import { effectiveMaxHp, effectiveResistance, equipmentStats, luckMultiplier } from './equipmentStatsSystem';
import { playerBaseAttack } from './progressionSystem';

export type SheetStats = {
  attack: number;
  defense: number;
  maxHp: number;
  /** redução de dano da resistência (0..0,4) */
  resistance: number;
  /** quanto de um golpe de 100 você realmente leva (armadura + resistência) */
  takenOf100: number;
  critChance: number;
  critMult: number;
  moveSpeed: number;
  luck: number;
  carryKg: number;
  range: number;
  power: number;
};

/** Ataque do golpe com o item `heldId` na mão — espelho de `attack()` no store (sem a tocha). */
export function sheetAttack(player: PlayerState, heldId: string | null): number {
  const held = heldId ? (ITEMS[heldId]?.attackPower ?? 0) : 0;
  return Math.round((playerBaseAttack(player.level) + held + equipmentStats(player).damage) * damageMultiplier(player));
}

export function sheetStats(player: PlayerState, heldId: string | null): SheetStats {
  const eq = equipmentStats(player);
  const crit = playerCritStats(player);
  const attack = sheetAttack(player, heldId);
  const maxHp = effectiveMaxHp(player);
  const takenOf100 = mitigateDamage(100, player);
  // PODER: dano esperado por golpe (com crítico) × sobrevivência (vida ÷ fração do dano que passa). Só resumo.
  const dps = attack * (1 + crit.chance * (crit.multiplier - 1));
  const ehp = maxHp / Math.max(0.05, takenOf100 / 100);
  const power = Math.round(dps * 6 + ehp * 0.6);
  return {
    attack, defense: eq.defense, maxHp,
    resistance: effectiveResistance(eq.resistance), takenOf100,
    critChance: crit.chance, critMult: crit.multiplier,
    moveSpeed: effectiveAttributes(player).moveSpeed,
    luck: luckMultiplier(eq.luck) - 1,
    carryKg: effectiveMaxWeight(player),
    range: weaponRangeFor(heldId, player.level),
    power,
  };
}

/** Abas da mochila (filtro só de VISÃO — a ordem e os índices dos slots não mudam). */
export type BagTab = 'all' | 'gear' | 'use' | 'mat';
export function bagTabOf(itemId: string): Exclude<BagTab, 'all'> {
  const it = ITEMS[itemId];
  if (!it) return 'mat';
  if (it.equippable || it.category === 'weapon' || it.category === 'armor' || it.category === 'tool') return 'gear';
  if (it.usable || it.category === 'consumable' || it.category === 'skill') return 'use';
  return 'mat';
}
