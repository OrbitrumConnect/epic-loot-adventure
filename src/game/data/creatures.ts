import type { CreatureDefinition } from '../types';

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
      { itemId: 'cooked_meat', quantity: 1, chance: 0.6 },
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
      { itemId: 'cooked_meat', quantity: 2, chance: 0.8 },
      { itemId: 'deer_hide', quantity: 1, chance: 0.5 },
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
      { itemId: 'cooked_meat', quantity: 3, chance: 0.7 },
      { itemId: 'boar_tusk', quantity: 1, chance: 0.5 },
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
      { itemId: 'cooked_meat', quantity: 4, chance: 0.8 },
      { itemId: 'health_potion', quantity: 1, chance: 0.25 },
    ],
    icon: 'PawPrint',
    peaceful: false,
  },
};
