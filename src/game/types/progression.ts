/** Progressão do personagem: experiência, nível e o que cada nível concede. */

export type LevelUpGains = {
  maxHp: number;
  maxMana: number;
  maxStamina: number;
  /** Poder de ataque base somado ao da arma. */
  attackPower: number;
};

export type ProgressionState = {
  xp: number;
  /** XP acumulado necessário para o próximo nível. */
  xpToNext: number;
  /** Total histórico, para a UI mostrar progresso de verdade. */
  totalXp: number;
};

export type LevelUpResult = {
  levelsGained: number;
  newLevel: number;
  gains: LevelUpGains;
};
