import type { CreatureDefinition } from '../types';

/**
 * Ajustes globais de dificuldade/dinâmica (aplicados no SPAWN, não no dado-base).
 * Mantêm `CREATURES` e `creatureXp` estáveis (valor da caça/economia intactos);
 * só mudam o que a criatura instanciada tem no mundo.
 */
/** Vida dos inimigos +15% (lutas um pouco mais longas). */
export const ENEMY_HP_MULT = 1.15;
/** Reaparecem 20% mais rápido (mundo mais vivo). */
export const ENEMY_RESPAWN_MULT = 0.8;
/** Vida instanciada de um inimigo a partir da vida-base do dado. */
export function scaleEnemyHp(baseHp: number): number {
  return Math.round(baseHp * ENEMY_HP_MULT);
}

export const CREATURES: Record<string, CreatureDefinition> = {
  wolf: {
    id: 'wolf',
    name: 'Lobo do Vale',
    maxHp: 80,
    attackPower: 8,
    armor: 2,
    attackCooldown: 1.5,
    attackRange: 1.8,
    aggroRange: 6,
    lootTable: [
      { itemId: 'wolf_fang', quantity: 1, chance: 0.7 },
      { itemId: 'wolf_pelt', quantity: 1, chance: 0.4 },
      { itemId: 'cooked_meat', quantity: 2, chance: 0.5 },
      { itemId: 'bone', quantity: 1, chance: 0.4 },
      { itemId: 'sinew', quantity: 1, chance: 0.3 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  // ---------------------------------------------------------------------------
  // Saqueadores: humanoides que ocupam os acampamentos inimigos do vale.
  // Referência de poder do jogador nível 1 com Espada de Ferro: ~29-39 de dano
  // por golpe a cada 0,8 s, 100 de vida, e sofre (ataque do inimigo - 2) por troca.
  // ---------------------------------------------------------------------------

  raider_scout: {
    id: 'raider_scout',
    name: 'Saqueador Batedor',
    maxHp: 45,
    attackPower: 7,
    armor: 1,
    attackCooldown: 1.2,
    attackRange: 1.8,
    aggroRange: 9,
    lootTable: [
      { itemId: 'cooked_meat', quantity: 1, chance: 0.5 },
      { itemId: 'wood', quantity: 3, chance: 0.4 },
      { itemId: 'raider_token', quantity: 1, chance: 0.6 },
      { itemId: 'health_potion', quantity: 1, chance: 0.2 },
    ],
    icon: 'Crosshair',
    peaceful: false,
  },

  raider_warrior: {
    id: 'raider_warrior',
    name: 'Saqueador Guerreiro',
    maxHp: 95,
    attackPower: 12,
    armor: 4,
    attackCooldown: 1.6,
    attackRange: 2.0,
    aggroRange: 8,
    lootTable: [
      { itemId: 'stone', quantity: 4, chance: 0.5 },
      { itemId: 'iron_ore', quantity: 2, chance: 0.35 },
      { itemId: 'wolf_pelt', quantity: 1, chance: 0.3 },
      { itemId: 'raider_token', quantity: 2, chance: 0.7 },
      { itemId: 'health_potion', quantity: 1, chance: 0.25 },
    ],
    icon: 'Swords',
    peaceful: false,
  },

  raider_brute: {
    id: 'raider_brute',
    name: 'Saqueador Brutamontes',
    maxHp: 180,
    attackPower: 22,
    armor: 8,
    attackCooldown: 2.4,
    attackRange: 2.2,
    aggroRange: 7,
    lootTable: [
      { itemId: 'iron_ore', quantity: 3, chance: 0.5 },
      { itemId: 'leather_armor', quantity: 1, chance: 0.15 },
      { itemId: 'iron_sword', quantity: 1, chance: 0.08 },
      { itemId: 'raider_token', quantity: 3, chance: 0.8 },
      { itemId: 'cooked_meat', quantity: 3, chance: 0.5 },
    ],
    icon: 'Shield',
    peaceful: false,
  },

  raider_shaman: {
    id: 'raider_shaman',
    name: 'Saqueador Xamã',
    maxHp: 60,
    attackPower: 16,
    armor: 2,
    attackCooldown: 2.0,
    attackRange: 7,
    aggroRange: 11,
    lootTable: [
      { itemId: 'arcane_essence', quantity: 2, chance: 0.6 },
      { itemId: 'health_potion', quantity: 2, chance: 0.35 },
      { itemId: 'raider_token', quantity: 2, chance: 0.7 },
      { itemId: 'ancestral_strike', quantity: 1, chance: 0.05 },
    ],
    icon: 'Sparkles',
    peaceful: false,
  },

  // ---------------------------------------------------------------------------
  // Fauna selvagem do vale. `peaceful` foge do jogador; hostil ataca ao ver.
  // O XP de cada uma sai de `creatureXp` (progressionSystem).
  // ---------------------------------------------------------------------------

  rabbit: {
    id: 'rabbit',
    name: 'Coelho Selvagem',
    maxHp: 15,
    attackPower: 1,
    armor: 0,
    attackCooldown: 2,
    attackRange: 1.2,
    aggroRange: 8,
    lootTable: [
      { itemId: 'raw_meat', quantity: 1, chance: 0.7 },
      { itemId: 'rabbit_foot', quantity: 1, chance: 0.12 },
    ],
    icon: 'Rabbit',
    peaceful: true,
  },

  deer: {
    id: 'deer',
    name: 'Cervo do Vale',
    maxHp: 40,
    attackPower: 3,
    armor: 0,
    attackCooldown: 2,
    attackRange: 1.5,
    aggroRange: 10,
    lootTable: [
      { itemId: 'raw_meat', quantity: 2, chance: 0.8 },
      { itemId: 'deer_hide', quantity: 1, chance: 0.6 },
      { itemId: 'antler', quantity: 1, chance: 0.2 },
    ],
    icon: 'Footprints',
    peaceful: true,
  },

  boar: {
    id: 'boar',
    name: 'Javali Bravo',
    maxHp: 70,
    attackPower: 10,
    armor: 3,
    attackCooldown: 1.4,
    attackRange: 1.8,
    aggroRange: 5,
    lootTable: [
      { itemId: 'raw_meat', quantity: 3, chance: 0.7 },
      { itemId: 'boar_tusk', quantity: 1, chance: 0.5 },
      { itemId: 'sinew', quantity: 1, chance: 0.35 },
    ],
    icon: 'PawPrint',
    peaceful: false,
  },

  wolf_alpha: {
    id: 'wolf_alpha',
    name: 'Lobo Alfa',
    maxHp: 140,
    attackPower: 16,
    armor: 5,
    attackCooldown: 1.3,
    attackRange: 2.0,
    aggroRange: 9,
    lootTable: [
      { itemId: 'wolf_fang', quantity: 2, chance: 0.9 },
      { itemId: 'wolf_pelt', quantity: 2, chance: 0.6 },
      { itemId: 'bone', quantity: 2, chance: 0.6 },
      { itemId: 'sinew', quantity: 2, chance: 0.5 },
      { itemId: 'health_potion', quantity: 1, chance: 0.2 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  bear: {
    id: 'bear',
    name: 'Urso Pardo',
    maxHp: 220,
    attackPower: 24,
    armor: 6,
    attackCooldown: 2.2,
    attackRange: 2.2,
    aggroRange: 6,
    lootTable: [
      { itemId: 'bear_pelt', quantity: 1, chance: 0.6 },
      { itemId: 'bear_claw', quantity: 1, chance: 0.4 },
      { itemId: 'raw_meat', quantity: 4, chance: 0.8 },
      { itemId: 'bone', quantity: 2, chance: 0.5 },
      { itemId: 'health_potion', quantity: 1, chance: 0.25 },
      { itemId: 'leather_armor', quantity: 1, chance: 0.06 },
    ],
    icon: 'PawPrint',
    peaceful: false,
  },
};
