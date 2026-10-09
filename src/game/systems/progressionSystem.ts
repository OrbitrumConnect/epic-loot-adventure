import type {
  CreatureDefinition, LevelUpGains, LevelUpResult, PlayerState, ProgressionState,
} from '../types';

// ---------------------------------------------------------------------------
// XP de criatura
//
//   xp = round(0.15 * maxHp + 2 * attackPower + 3 * armor)
//
// Vida pesa pouco (é só tempo de luta), ataque pesa mais (é o perigo real) e
// armadura mais ainda por unidade (cada ponto corta dano de todos os golpes).
// ---------------------------------------------------------------------------

export function creatureXp(def: Pick<CreatureDefinition, 'maxHp' | 'attackPower' | 'armor'>): number {
  return Math.max(1, Math.round(def.maxHp * 0.15 + def.attackPower * 2 + def.armor * 3));
}

// ---------------------------------------------------------------------------
// Curva de nível
// ---------------------------------------------------------------------------

export const MAX_LEVEL = 30;
/** XP para sair do nível 1. */
export const XP_BASE = 110;
/** Cada nível exige 20% a mais que o anterior. */
export const XP_GROWTH = 1.2;

/** XP necessário para sair de `level` para `level + 1`. No nível máximo, devolve o do último degrau. */
export function xpForLevel(level: number): number {
  const lv = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return Math.round(XP_BASE * Math.pow(XP_GROWTH, lv - 1));
}

/** Ganho por nível. */
export const LEVEL_GAINS: LevelUpGains = {
  maxHp: 12,
  maxMana: 6,
  maxStamina: 4,
  attackPower: 2,
};

/** Pontos de skill ganhos por nível, pra distribuir nos atributos (0–100%). */
export const SKILL_POINTS_PER_LEVEL = 3;

/** Ataque base do jogador (sem arma) naquele nível. Nível 1 = 10, como era. */
export const BASE_ATTACK_AT_LEVEL_1 = 10;
export function playerBaseAttack(level: number): number {
  return BASE_ATTACK_AT_LEVEL_1 + LEVEL_GAINS.attackPower * (Math.max(1, level) - 1);
}

/**
 * Cooldown (s) do ataque especial (Q/R) por nível: 30 s no lvl 1 → 2 s no nível
 * máximo (linear). Recalibrar quando `MAX_LEVEL` subir. Destreza% pode reduzir depois.
 */
export function specialCooldown(level: number): number {
  const lv = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  return Math.max(2, 30 - (lv - 1) * (28 / Math.max(1, MAX_LEVEL - 1)));
}

export function createProgression(level = 1): ProgressionState {
  return { xp: 0, xpToNext: xpForLevel(level), totalXp: 0 };
}

export function applyXp(
  progression: ProgressionState,
  level: number,
  amount: number,
): { progression: ProgressionState; level: number; result: LevelUpResult } {
  const gain = Math.max(0, Math.floor(amount));
  let lv = level;
  let xp = progression.xp;
  let levelsGained = 0;

  if (lv >= MAX_LEVEL) {
    // No nível máximo a barra fica cheia e o total continua contando.
    return {
      progression: { xp: progression.xpToNext, xpToNext: progression.xpToNext, totalXp: progression.totalXp + gain },
      level: lv,
      result: emptyResult(lv),
    };
  }

  xp += gain;
  let need = progression.xpToNext;
  while (lv < MAX_LEVEL && xp >= need) {
    xp -= need;
    lv += 1;
    levelsGained += 1;
    need = xpForLevel(lv);
  }
  if (lv >= MAX_LEVEL) {
    xp = need;
  }

  return {
    progression: { xp, xpToNext: need, totalXp: progression.totalXp + gain },
    level: lv,
    result: {
      levelsGained,
      newLevel: lv,
      gains: {
        maxHp: LEVEL_GAINS.maxHp * levelsGained,
        maxMana: LEVEL_GAINS.maxMana * levelsGained,
        maxStamina: LEVEL_GAINS.maxStamina * levelsGained,
        attackPower: LEVEL_GAINS.attackPower * levelsGained,
      },
    },
  };
}

function emptyResult(level: number): LevelUpResult {
  return { levelsGained: 0, newLevel: level, gains: { maxHp: 0, maxMana: 0, maxStamina: 0, attackPower: 0 } };
}

export function levelUpMessage(result: LevelUpResult): string {
  return `Nível ${result.newLevel}! +${result.gains.maxHp} de vida máxima.`;
}

/**
 * Dá XP ao jogador: soma, sobe de nível, aumenta os máximos e enche vida/mana/vigor
 * quando sobe. Pura: devolve o jogador novo e a mensagem (ou null sem level-up).
 */
export function grantXp(
  player: PlayerState,
  amount: number,
): { player: PlayerState; result: LevelUpResult; message: string | null } {
  const applied = applyXp(
    { xp: player.xp, xpToNext: player.xpToNext, totalXp: player.totalXp },
    player.level,
    amount,
  );
  let next: PlayerState = {
    ...player,
    level: applied.level,
    xp: applied.progression.xp,
    xpToNext: applied.progression.xpToNext,
    totalXp: applied.progression.totalXp,
  };
  if (applied.result.levelsGained > 0) {
    const maxHp = player.maxHp + applied.result.gains.maxHp;
    const maxMana = player.maxMana + applied.result.gains.maxMana;
    const maxStamina = player.maxStamina + applied.result.gains.maxStamina;
    const skillPoints = (player.skillPoints ?? 0) + applied.result.levelsGained * SKILL_POINTS_PER_LEVEL;
    next = { ...next, maxHp, maxMana, maxStamina, hp: maxHp, mana: maxMana, stamina: maxStamina, skillPoints };
  }
  return {
    player: next,
    result: applied.result,
    message: applied.result.levelsGained > 0 ? levelUpMessage(applied.result) : null,
  };
}
