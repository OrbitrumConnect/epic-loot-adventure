/**
 * PvP JUSTO (Pedro 21/10): ninguém morre num golpe. Regras puras e testáveis:
 *  - Jogador × jogador bate uma FRAÇÃO do dano de PvE e o ALVO aplica a própria armadura.
 *  - Teto por golpe: no máximo `PVP_MAX_HIT_FRACTION` da vida MÁXIMA do alvo → mínimo de
 *    golpes pra derrubar (sem one-shot, mesmo nível alto x nível baixo).
 *  - Base inimiga: também uma fração do dano (a cadência da arma já limita o ritmo).
 * Quem APLICA é sempre o dono do alvo (o próprio jogador / o dono da base).
 */
export const PVP_DAMAGE_FACTOR = 0.4;
export const PVP_MAX_HIT_FRACTION = 0.2; // ≥ 5 golpes pra derrubar alguém de vida cheia
export const PVP_BASE_FACTOR = 0.4;

export function pvpPlayerDamage(raw: number, targetMaxHp: number, mitigate: (n: number) => number): number {
  const scaled = mitigate(Math.max(1, raw * PVP_DAMAGE_FACTOR));
  const cap = Math.max(1, Math.floor(targetMaxHp * PVP_MAX_HIT_FRACTION));
  return Math.max(1, Math.min(Math.round(scaled), cap));
}

export function pvpBaseDamage(raw: number): number {
  return Math.max(1, Math.round(raw * PVP_BASE_FACTOR));
}
