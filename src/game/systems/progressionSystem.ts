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

export const MAX_LEVEL = 250;
/** XP para sair do nível 1. */
export const XP_BASE = 110;
/** Cada nível exige 20% a mais que o anterior (até o soft cap). */
export const XP_GROWTH = 1.2;
/**
 * Até o soft cap a curva é geométrica (×1.2) — IDÊNTICA à de antes (zero
 * regressão nos níveis 1–30). Acima, cresce LINEAR e controlada até 250: 1.2^249
 * explodiria. Os níveis altos continuam valendo muito (HP/ataque/pontos de skill
 * seguem subindo por nível), só não exigem XP absurdo.
 */
export const XP_SOFT_CAP = 30;
const XP_SOFT_CAP_VALUE = Math.round(XP_BASE * Math.pow(XP_GROWTH, XP_SOFT_CAP - 1));
/** Acréscimo fixo de XP por nível acima do soft cap. */
export const XP_LINEAR_STEP = 150;

/** XP necessário para sair de `level` para `level + 1`. No nível máximo, devolve o do último degrau. */
export function xpForLevel(level: number): number {
  const lv = Math.min(MAX_LEVEL, Math.max(1, Math.floor(level)));
  if (lv <= XP_SOFT_CAP) return Math.round(XP_BASE * Math.pow(XP_GROWTH, lv - 1));
  return XP_SOFT_CAP_VALUE + (lv - XP_SOFT_CAP) * XP_LINEAR_STEP;
}

/** Ganho por nível. */
export const LEVEL_GAINS: LevelUpGains = {
  maxHp: 12,
  maxMana: 6,
  maxStamina: 4,
  attackPower: 2,
};

/** Pontos de skill por nível (dá pra pôr até 2 em cada um dos 4 atributos). */
export const SKILL_POINTS_PER_LEVEL = 8;

/** Ataque base do jogador (sem arma) naquele nível. Nível 1 = 10, como era. */
export const BASE_ATTACK_AT_LEVEL_1 = 10;
export function playerBaseAttack(level: number): number {
  return BASE_ATTACK_AT_LEVEL_1 + LEVEL_GAINS.attackPower * (Math.max(1, level) - 1);
}

/**
 * Cooldown (s) do ataque especial (Q/R): 30 s no lvl 1 → 2 s no nível de
 * referência (30), e fica no mínimo daí pra cima. Ancorado em `CD_REF_LEVEL`
 * (não em `MAX_LEVEL`) pra a cadência amadurecer cedo — subir o teto pra 250
 * NÃO estica essa curva (níveis 1–30 idênticos ao de antes). Destreza% reduz mais.
 */
export const CD_REF_LEVEL = 30;
export function specialCooldown(level: number): number {
  const lv = Math.min(CD_REF_LEVEL, Math.max(1, Math.floor(level)));
  return Math.max(2, 30 - (lv - 1) * (28 / Math.max(1, CD_REF_LEVEL - 1)));
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
