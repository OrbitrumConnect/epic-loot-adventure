import type { Position } from './player';
import type { InventorySlot } from './inventory';

export type CreatureBehavior = 'idle' | 'patrol' | 'chase' | 'attack' | 'flee' | 'dead' | 'respawning';

export type CreatureState = {
  id: string;
  speciesId: string;
  name: string;
  hp: number;
  maxHp: number;
  attackPower: number;
  armor: number;
  attackCooldown: number;
  lastAttackAt: number;
  position: Position;
  behavior: CreatureBehavior;
  lootTable: InventorySlot[];
  respawnAt: number | null;
};

export type CreatureDefinition = {
  id: string;
  name: string;
  maxHp: number;
  attackPower: number;
  armor: number;
  attackCooldown: number;
  attackRange: number;
  aggroRange: number;
  lootTable: { itemId: string; quantity: number; chance: number }[];
  icon: string;
};
