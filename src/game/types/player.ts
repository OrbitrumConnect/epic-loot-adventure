import type { InventoryState } from './inventory';

export type Position = { x: number; z: number };

export type PlayerState = {
  id: string;
  name: string;
  classId: string;
  level: number;
  /** XP dentro do nível atual (0 até `xpToNext`). */
  xp: number;
  /** XP necessário para sair do nível atual. */
  xpToNext: number;
  /** Total histórico de XP. */
  totalXp: number;
  hp: number;
  maxHp: number;
  mana: number;
  maxMana: number;
  stamina: number;
  maxStamina: number;
  gold: number;
  position: Position;
  inventory: InventoryState;
  attackCooldown: number;
  lastAttackAt: number;
  dead: boolean;
  respawnAt: number;
};
