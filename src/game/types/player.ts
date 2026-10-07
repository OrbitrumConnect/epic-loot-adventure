import type { InventoryState } from './inventory';

export type Position = { x: number; z: number };

export type PlayerState = {
  id: string;
  name: string;
  classId: string;
  level: number;
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
