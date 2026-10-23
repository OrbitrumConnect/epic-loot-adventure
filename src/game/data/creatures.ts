import type { CreatureDefinition } from '../types';

/**
 * Ajustes globais de dificuldade/dinâmica (aplicados no SPAWN, não no dado-base).
 * Mantêm `CREATURES` e `creatureXp` estáveis (valor da caça/economia intactos);
 * só mudam o que a criatura instanciada tem no mundo.
 */
/** Vida dos inimigos +15% (lutas um pouco mais longas). */
// 1,15 → 1,32 (+15% em cima, Pedro 23/10: nv 71 matava rápido demais).
export const ENEMY_HP_MULT = 1.32;
/** Reaparecem 20% mais rápido (mundo mais vivo). */
export const ENEMY_RESPAWN_MULT = 0.8;
/** Bichos SOLTOS do mapa (`wild_*`) voltam mais rápido (Pedro, 22/10 — nv 37 limpava o mapa e o
 *  piloto ficava parado): 3–5 min base × 0,5 = 1,5–2,5 min (era × 0,8 = 2,4–4 min). Acampamentos e
 *  horda seguem com `ENEMY_RESPAWN_MULT`. */
export const WILD_RESPAWN_MULT = 0.5;
/** Vida instanciada de um inimigo a partir da vida-base do dado. */
export function scaleEnemyHp(baseHp: number): number {
  return Math.round(baseHp * ENEMY_HP_MULT);
}

export const CREATURES: Record<string, CreatureDefinition> = {
  wolf: {
    id: 'wolf',
    name: 'Raposa do Vale',
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
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
      { itemId: 'health_potion', quantity: 1, chance: 0.15 },
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
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
      { itemId: 'health_potion', quantity: 1, chance: 0.15 },
    ],
    icon: 'Swords',
    peaceful: false,
  },

  raider_puglin: {
    id: 'raider_puglin',
    name: 'Puglin',
    maxHp: 60,
    attackPower: 9,
    armor: 2,
    attackCooldown: 1.5,
    attackRange: 2.0,
    aggroRange: 10,
    lootTable: [
      { itemId: 'raw_meat', quantity: 1, chance: 0.5 },
      { itemId: 'raider_token', quantity: 1, chance: 0.6 },
      { itemId: 'stone', quantity: 2, chance: 0.4 },
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
    ],
    icon: 'Skull',
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
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
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
      { itemId: 'health_potion', quantity: 2, chance: 0.15 },
      { itemId: 'raider_token', quantity: 2, chance: 0.7 },
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
      { itemId: 'ancestral_strike', quantity: 1, chance: 0.05 },
    ],
    icon: 'Sparkles',
    peaceful: false,
  },

  // Mini-boss do vale: nasce aleatório (timer de 15 min, ver BossSpawner), não
  // pertence a acampamento. Humanoide articulado gigante (2,5× o brutamontes),
  // gira como o especial do herói. Vida muito maior e dano um pouco acima do urso.
  raider_warlord: {
    id: 'raider_warlord',
    name: 'Colosso dos Ancestrais',
    maxHp: 600,
    attackPower: 30,
    armor: 10,
    attackCooldown: 2.2,
    attackRange: 4.5,
    aggroRange: 22,
    lootTable: [
      { itemId: 'iron_ore', quantity: 8, chance: 0.9 },
      { itemId: 'leather_armor', quantity: 1, chance: 0.5 },
      { itemId: 'iron_sword', quantity: 1, chance: 0.4 },
      { itemId: 'raider_token', quantity: 10, chance: 1 },
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
      { itemId: 'cooked_meat', quantity: 6, chance: 0.8 },
    ],
    icon: 'Shield',
    peaceful: false,
  },

  // Bosses MAIORES das ordas — mesmo rig (Imp) escalado. Fúngico ~1,5× o Colosso;
  // Kaiju ~1,5× o Fúngico. Só aparecem nas ondas (ver spawnWaveRaiders).
  raider_mushroom: {
    id: 'raider_mushroom',
    name: 'Aberração Fúngica',
    maxHp: 1400,
    attackPower: 48,
    armor: 16,
    attackCooldown: 2.6,
    attackRange: 6,
    aggroRange: 26,
    lootTable: [
      { itemId: 'iron_ore', quantity: 14, chance: 1 },
      { itemId: 'leather_armor', quantity: 1, chance: 0.7 },
      { itemId: 'raider_token', quantity: 24, chance: 1 },
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
      { itemId: 'cooked_meat', quantity: 10, chance: 0.9 },
    ],
    icon: 'Shield',
    peaceful: false,
  },
  raider_kaiju: {
    id: 'raider_kaiju',
    name: 'Kaiju Lunar',
    maxHp: 3200,
    attackPower: 75,
    armor: 24,
    attackCooldown: 3,
    attackRange: 8,
    aggroRange: 32,
    lootTable: [
      { itemId: 'iron_ore', quantity: 24, chance: 1 },
      { itemId: 'iron_sword', quantity: 1, chance: 0.8 },
      { itemId: 'raider_token', quantity: 50, chance: 1 },
      { itemId: 'ammo', quantity: 50, chance: 0.35 },
      { itemId: 'arrow', quantity: 50, chance: 0.35 },
      { itemId: 'cooked_meat', quantity: 18, chance: 1 },
    ],
    icon: 'Shield',
    peaceful: false,
  },
  raider_samurai: {
    id: 'raider_samurai',
    name: 'Couraça de Espinhos',
    maxHp: 1800,
    attackPower: 39, // -35% (era 60, quase one-hit)
    armor: 18,
    attackCooldown: 2,
    attackRange: 5,
    aggroRange: 32,
    lootTable: [
      { itemId: 'iron_ore', quantity: 16, chance: 1 },
      { itemId: 'iron_sword', quantity: 1, chance: 0.6 },
      { itemId: 'raider_token', quantity: 30, chance: 1 },
      { itemId: 'ammo', quantity: 100, chance: 0.35 },
      { itemId: 'arrow', quantity: 100, chance: 0.35 },
      { itemId: 'cooked_meat', quantity: 12, chance: 1 },
    ],
    icon: 'Shield',
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

  goose: {
    id: 'goose',
    name: 'Ganso Selvagem',
    maxHp: 22,
    attackPower: 2,
    armor: 0,
    attackCooldown: 2,
    attackRange: 1.2,
    aggroRange: 8,
    lootTable: [
      { itemId: 'raw_meat', quantity: 1, chance: 0.8 },
    ],
    icon: 'Bird',
    peaceful: true,
  },

  pigeon: {
    id: 'pigeon',
    name: 'Pombo Bravo',
    maxHp: 10,
    attackPower: 2,
    armor: 0,
    attackCooldown: 1.5,
    attackRange: 1.8,
    aggroRange: 9,
    lootTable: [
      { itemId: 'raw_meat', quantity: 1, chance: 0.6 },
    ],
    icon: 'Bird',
    peaceful: false, // ATACA voando (usa o clip de voo como mergulho); fraco e caçável
  },

  pheasant: {
    id: 'pheasant',
    name: 'Faisão',
    maxHp: 18,
    attackPower: 1,
    armor: 0,
    attackCooldown: 2,
    attackRange: 1.2,
    aggroRange: 8,
    lootTable: [
      { itemId: 'raw_meat', quantity: 1, chance: 0.75 },
    ],
    icon: 'Bird',
    peaceful: true,
  },

  eel: {
    id: 'eel',
    name: 'Serpe Rastejante',
    maxHp: 150,
    attackPower: 18,
    armor: 4,
    attackCooldown: 1.8,
    attackRange: 2.6,
    aggroRange: 11,
    lootTable: [
      { itemId: 'raw_meat', quantity: 3, chance: 0.8 },
      { itemId: 'bone', quantity: 2, chance: 0.5 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  collector: {
    id: 'collector',
    name: 'O Coletor',
    maxHp: 260,
    attackPower: 26,
    armor: 6,
    attackCooldown: 2.1,
    attackRange: 2.8,
    aggroRange: 12,
    lootTable: [
      { itemId: 'raw_meat', quantity: 2, chance: 0.6 },
      { itemId: 'bone', quantity: 3, chance: 0.7 },
      { itemId: 'health_potion', quantity: 1, chance: 0.15 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  monster: {
    id: 'monster',
    name: 'Aberração',
    maxHp: 190,
    attackPower: 22,
    armor: 5,
    attackCooldown: 2.0,
    attackRange: 2.8,
    aggroRange: 10,
    lootTable: [
      { itemId: 'raw_meat', quantity: 3, chance: 0.7 },
      { itemId: 'bone', quantity: 2, chance: 0.6 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  civilian: {
    id: 'civilian',
    name: 'Saqueador Rústico',
    maxHp: 55,
    attackPower: 8,
    armor: 2,
    attackCooldown: 1.6,
    attackRange: 2.0,
    aggroRange: 10,
    lootTable: [
      { itemId: 'raider_token', quantity: 1, chance: 0.5 },
      { itemId: 'raw_meat', quantity: 1, chance: 0.4 },
    ],
    icon: 'Swords',
    peaceful: false,
  },

  zombie: {
    id: 'zombie',
    name: 'Morto-Vivo',
    maxHp: 48,
    attackPower: 7,
    armor: 1,
    attackCooldown: 1.8,
    attackRange: 1.9,
    aggroRange: 11,
    lootTable: [
      { itemId: 'bone', quantity: 2, chance: 0.6 },
      { itemId: 'raw_meat', quantity: 1, chance: 0.3 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  pelter: {
    id: 'pelter',
    name: 'Mecha Pelter',
    maxHp: 130,
    attackPower: 16,
    armor: 6,
    attackCooldown: 2.0,
    attackRange: 2.6,
    aggroRange: 11,
    lootTable: [
      { itemId: 'iron_ore', quantity: 3, chance: 0.6 },
      { itemId: 'stone', quantity: 3, chance: 0.5 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  flintmaw: {
    id: 'flintmaw',
    name: 'Fauce de Sílex',
    maxHp: 95,
    attackPower: 14,
    armor: 3,
    attackCooldown: 1.6,
    attackRange: 2.4,
    aggroRange: 12,
    lootTable: [
      { itemId: 'bone', quantity: 2, chance: 0.6 },
      { itemId: 'raw_meat', quantity: 2, chance: 0.5 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  boar: {
    id: 'boar',
    name: 'Jacaré',
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
    name: 'Leoa',
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
      { itemId: 'health_potion', quantity: 1, chance: 0.15 },
    ],
    icon: 'Skull',
    peaceful: false,
  },

  bear: {
    id: 'bear',
    name: 'Búfalo',
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
      { itemId: 'health_potion', quantity: 1, chance: 0.15 },
      { itemId: 'leather_armor', quantity: 1, chance: 0.06 },
    ],
    icon: 'PawPrint',
    peaceful: false,
  },
};

// Drops common/uncommon distribuídos pela fauna; tiers raros ficam nos pools de caça.
const huntArmorIds = ['head_common', 'leather_armor', 'gloves_common', 'legs_common', 'boots_common', 'amulet_common', 'ring1_common', 'ring2_common', 'head_uncommon', 'chest_uncommon', 'gloves_uncommon', 'legs_uncommon', 'boots_uncommon', 'amulet_uncommon', 'ring1_uncommon', 'ring2_uncommon'];
const huntableCreatures = Object.values(CREATURES).filter(creature => creature.peaceful || creature.id.startsWith('raider_') || creature.id === 'wolf');
huntArmorIds.forEach((itemId, index) => {
  huntableCreatures[index % huntableCreatures.length]!.lootTable.push({ itemId, quantity: 1, chance: index < 8 ? 0.08 : 0.04 });
});
