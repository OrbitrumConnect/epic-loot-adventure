import type { InventoryState } from './inventory';

export type Position = { x: number; z: number };

/**
 * Atributos como bônus percentuais (0 = sem bônus, 100 = +100%). Camada ADITIVA
 * por cima dos stats absolutos — multiplicam os valores base. Alimentados por
 * nível/equipamento/skill (ainda não). Default 0 = comportamento idêntico.
 */
export type PlayerAttributes = {
  /** % de dano a mais. */
  damage: number;
  /** % de destreza (crítico / cadência — ligar depois). */
  dexterity: number;
  /** % de capacidade da bolsa (peso — ligar depois). */
  carry: number;
  /** % de velocidade de movimento a mais. */
  moveSpeed: number;
};

export const DEFAULT_ATTRIBUTES: PlayerAttributes = { damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 };

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
  /** Bônus percentuais aditivos (ver PlayerAttributes). Ausente = sem bônus. */
  attributes?: PlayerAttributes;
};
