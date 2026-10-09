/**
 * Camada de atributos (0–100%) DERIVADA das fontes do jogo — a "fonte dos %"
 * que faltava. Puro e testável. É ADITIVO: no nível 1, sem skill e sem equip,
 * tudo dá 0% → comportamento idêntico ao de antes (zero regressão).
 *
 * Fontes hoje:
 *   • Nível   → cresce linear de 0% (lvl 1) até o teto de cada atributo no nível
 *               máximo. É o motor principal da progressão.
 *   • Equip   → arma equipada dá bônus de DANO conforme a raridade.
 *   • Skill   → `player.attributes` (alocação manual/futura) soma por cima.
 *
 * Os quatro canais, uma vez somados e travados em 0–100%, alimentam:
 *   damage    → × poder de ataque (normal e especial)
 *   moveSpeed → × velocidade de deslocamento
 *   carry     → × capacidade da bolsa (peso máximo)
 *   dexterity → reduz a cadência (cooldown) do especial
 */
import type { InventoryState, PlayerState } from '../types';
import { DEFAULT_ATTRIBUTES, type PlayerAttributes } from '../types/player';
import { ITEMS } from '../data/items';
import { specialCooldown } from './progressionSystem';

/** Teto de cada atributo em % (atingido no nível-referência). */
export const ATTRIBUTE_CAPS: PlayerAttributes = { damage: 40, dexterity: 50, carry: 100, moveSpeed: 20 };
/**
 * Nível em que os atributos VINDOS DO NÍVEL chegam ao teto. Ancorado em 30 (não
 * em MAX_LEVEL) pra a progressão amadurecer cedo: subir o teto pra 250 NÃO achata
 * o começo (níveis 1–30 idênticos). Acima de 30, o poder vem de HP/ataque/pontos
 * de skill por nível — não de mais % automático.
 */
export const ATTR_REF_LEVEL = 30;

/** Peso máximo base da bolsa (carry 0% = este valor). */
export const BASE_MAX_WEIGHT = 40;

/** Quanto cada ponto de skill soma num atributo (%). */
export const SKILL_STEP = 1;
/** Teto do que a SKILL (alocação manual) pode somar por atributo (%). O efetivo
 *  ainda é travado em 100% no total (nível + equip + skill). */
export const SKILL_CAP_PER_ATTR = 60;

/** Bônus de dano (%) por raridade da arma equipada. */
const RARITY_DAMAGE: Record<string, number> = { common: 0, rare: 8, epic: 16, mythic: 28 };

/** Contribuição do NÍVEL para cada atributo (%). Linear: 0 no lvl 1 → teto no nível-referência (e fica no teto acima dele). */
export function levelAttributes(level: number): PlayerAttributes {
  const lv = Math.max(1, Math.floor(level));
  const t = Math.min(1, (lv - 1) / Math.max(1, ATTR_REF_LEVEL - 1)); // 0 → 1 (satura em ATTR_REF_LEVEL)
  return {
    damage: Math.round(ATTRIBUTE_CAPS.damage * t),
    dexterity: Math.round(ATTRIBUTE_CAPS.dexterity * t),
    carry: Math.round(ATTRIBUTE_CAPS.carry * t),
    moveSpeed: Math.round(ATTRIBUTE_CAPS.moveSpeed * t),
  };
}

/** Bônus de DANO (%) vindo da arma primária equipada (pela raridade). */
export function weaponDamageBonus(inventory: InventoryState): number {
  const id = inventory.equipment.primary;
  if (!id) return 0;
  const rarity = ITEMS[id]?.rarity ?? 'common';
  return RARITY_DAMAGE[rarity] ?? 0;
}

/** Armadura equipada → CARGA (%) por raridade (alças/placas reforçadas aguentam mais peso). */
const RARITY_ARMOR_CARRY: Record<string, number> = { common: 4, rare: 8, epic: 14, mythic: 22 };
/** Acessório equipado → DESTREZA (%) por raridade. */
const RARITY_ACCESSORY_DEX: Record<string, number> = { common: 3, rare: 8, epic: 14, mythic: 22 };
/** Acessório equipado → VELOCIDADE (%) por raridade. */
const RARITY_ACCESSORY_MOVE: Record<string, number> = { common: 1, rare: 3, epic: 6, mythic: 10 };

/**
 * Bônus de atributo (%) vindo da ARMADURA e do ACESSÓRIO equipados. Um `attrBonus`
 * explícito no item tem prioridade sobre a tabela por raridade. Slot vazio = 0.
 */
export function gearAttributeBonus(inventory: InventoryState): PlayerAttributes {
  const out: PlayerAttributes = { damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 };
  const armorId = inventory.equipment.armor;
  const armor = armorId ? ITEMS[armorId] : undefined;
  if (armor) {
    const b = armor.attrBonus;
    out.carry += RARITY_ARMOR_CARRY[armor.rarity] ?? 0;
    if (b) {
      out.damage += b.damage ?? 0;
      out.dexterity += b.dexterity ?? 0;
      out.moveSpeed += b.moveSpeed ?? 0;
      if (b.carry !== undefined) out.carry = b.carry; // explícito substitui o padrão da raridade
    }
  }
  const accId = inventory.equipment.accessory;
  const acc = accId ? ITEMS[accId] : undefined;
  if (acc) {
    const b = acc.attrBonus;
    out.dexterity += RARITY_ACCESSORY_DEX[acc.rarity] ?? 0;
    out.moveSpeed += RARITY_ACCESSORY_MOVE[acc.rarity] ?? 0;
    if (b) {
      out.damage += b.damage ?? 0;
      out.carry += b.carry ?? 0;
      if (b.dexterity !== undefined) out.dexterity = out.dexterity - (RARITY_ACCESSORY_DEX[acc.rarity] ?? 0) + b.dexterity;
      if (b.moveSpeed !== undefined) out.moveSpeed = out.moveSpeed - (RARITY_ACCESSORY_MOVE[acc.rarity] ?? 0) + b.moveSpeed;
    }
  }
  return out;
}

/** Atributos efetivos do jogador: nível + equip (arma, armadura, acessório) + skill, travados em 0–100%. */
export function effectiveAttributes(player: PlayerState): PlayerAttributes {
  const lv = levelAttributes(player.level);
  const stored = player.attributes ?? DEFAULT_ATTRIBUTES;
  const equipDamage = weaponDamageBonus(player.inventory);
  const gear = gearAttributeBonus(player.inventory);
  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  return {
    damage: clamp(lv.damage + stored.damage + equipDamage + gear.damage),
    dexterity: clamp(lv.dexterity + stored.dexterity + gear.dexterity),
    carry: clamp(lv.carry + stored.carry + gear.carry),
    moveSpeed: clamp(lv.moveSpeed + stored.moveSpeed + gear.moveSpeed),
  };
}

/** Teto da chance de crítico (destreza 100 → 30%). */
export const CRIT_CHANCE_MAX = 0.3;
/** Multiplicador de crítico: 1,5× em destreza 0 → 2,0× em destreza 100. */
export const CRIT_MULT_MIN = 1.5;
export const CRIT_MULT_MAX = 2;

/**
 * Crítico a partir da destreza efetiva (0–100). Linear: chance = 30% × dex/100
 * (dex 0 → exatamente 0, ou seja, nível 1 sem pontos nunca critica);
 * multiplicador 1,5 → 2,0. No teto do nível (dex 50) = 15% e ×1,75.
 */
export function critFromDexterity(dexterity: number): { chance: number; multiplier: number } {
  const d = Math.max(0, Math.min(100, dexterity)) / 100;
  return { chance: CRIT_CHANCE_MAX * d, multiplier: CRIT_MULT_MIN + (CRIT_MULT_MAX - CRIT_MULT_MIN) * d };
}

/** Crítico do jogador (usa a destreza efetiva: nível + equip + skill). */
export function playerCritStats(player: PlayerState): { chance: number; multiplier: number } {
  return critFromDexterity(effectiveAttributes(player).dexterity);
}

/** Multiplicador de dano (1 + damage%/100). Usado no ataque normal e no especial. */
export function damageMultiplier(player: PlayerState): number {
  return 1 + effectiveAttributes(player).damage / 100;
}


/** Peso máximo efetivo da bolsa: base × (1 + carry%/100). */
export function effectiveMaxWeight(player: PlayerState): number {
  return Math.round(BASE_MAX_WEIGHT * (1 + effectiveAttributes(player).carry / 100));
}

/** Armadura do peito equipado (0 = nu). */
export function equippedArmor(player: PlayerState): number {
  const id = player.inventory.equipment.armor;
  return (id ? ITEMS[id]?.armor : 0) ?? 0;
}

/**
 * Dano que o jogador REALMENTE leva, já reduzido pela armadura. Mitigação
 * suave (armor/(armor+50)): armadura de osso (16) corta ~24%, peitoral do
 * guardião (26) ~34%. Sem armadura = dano cheio (mínimo 1).
 */
export function mitigateDamage(rawDamage: number, player: PlayerState): number {
  const a = equippedArmor(player);
  const mitigated = rawDamage * (1 - a / (a + 50));
  return Math.max(1, Math.round(mitigated));
}

/**
 * Cadência (cooldown, s) do especial com destreza. A destreza reduz o cooldown
 * em até 25% (dex 100 → −25%), por cima da redução que já vem do nível.
 * No lvl 1 (dex 0) devolve exatamente `specialCooldown(1)` — sem regressão.
 */
export function effectiveSpecialCooldown(player: PlayerState): number {
  const base = specialCooldown(player.level);
  const dex = effectiveAttributes(player).dexterity; // 0..100
  const reduced = base * (1 - (dex / 100) * 0.25);
  return Math.max(1.5, Math.round(reduced * 10) / 10);
}
