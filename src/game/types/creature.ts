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
  /** ENFURECIDO (Elite): mais vida/dano/velocidade, fumaça vermelha, loot ×2 (difficultySystem, 25/10). */
  elite?: boolean;
  /** Nível do mundo usado na última escala de vida/dano (só bichos hostis do mapa/acampamento). */
  scaledLevel?: number;
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
  /** Pacífica foge do jogador; hostil ataca. O mundo 3D lê esta flag. */
  peaceful: boolean;
  /** Vive na ÁGUA FUNDA (tubarão, 01/11): só nada onde o mapa diz que dá (`WORLD.water`), na superfície, e só caça quem
   *  está na água. Ausente = bicho de terra (todos os outros, nada muda). */
  aquatic?: boolean;
};
