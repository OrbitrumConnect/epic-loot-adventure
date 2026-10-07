export type Recipe = {
  id: string;
  result: { itemId: string; quantity: number };
  materials: { itemId: string; quantity: number }[];
  station: 'none' | 'fob' | 'forge';
  requiredKnowledge?: string;
  craftTime: number;
};

export const RECIPES: Record<string, Recipe> = {
  iron_sword: {
    id: 'iron_sword',
    result: { itemId: 'iron_sword', quantity: 1 },
    materials: [
      { itemId: 'wood', quantity: 10 },
      { itemId: 'stone', quantity: 8 },
    ],
    station: 'forge',
    craftTime: 3,
  },
  health_potion: {
    id: 'health_potion',
    result: { itemId: 'health_potion', quantity: 2 },
    materials: [
      { itemId: 'arcane_essence', quantity: 1 },
      { itemId: 'wood', quantity: 3 },
    ],
    station: 'none',
    craftTime: 2,
  },
  leather_armor: {
    id: 'leather_armor',
    result: { itemId: 'leather_armor', quantity: 1 },
    materials: [
      { itemId: 'wolf_pelt', quantity: 3 },
      { itemId: 'wood', quantity: 5 },
    ],
    station: 'forge',
    craftTime: 5,
  },
  trap: {
    id: 'trap',
    result: { itemId: 'trap', quantity: 2 },
    materials: [
      { itemId: 'wood', quantity: 5 },
      { itemId: 'stone', quantity: 3 },
    ],
    station: 'none',
    craftTime: 2,
  },
  torch: {
    id: 'torch',
    result: { itemId: 'torch', quantity: 3 },
    materials: [
      { itemId: 'wood', quantity: 4 },
    ],
    station: 'none',
    craftTime: 1,
  },

  // Ferramentas de colheita: feitas no campo, sem bancada.
  axe: {
    id: 'axe',
    result: { itemId: 'axe', quantity: 1 },
    materials: [
      { itemId: 'wood', quantity: 5 },
      { itemId: 'stone', quantity: 3 },
    ],
    station: 'none',
    craftTime: 3,
  },
  pickaxe: {
    id: 'pickaxe',
    result: { itemId: 'pickaxe', quantity: 1 },
    materials: [
      { itemId: 'wood', quantity: 4 },
      { itemId: 'stone', quantity: 6 },
    ],
    station: 'none',
    craftTime: 3,
  },
  iron_axe: {
    id: 'iron_axe',
    result: { itemId: 'iron_axe', quantity: 1 },
    materials: [
      { itemId: 'wood', quantity: 4 },
      { itemId: 'iron_ore', quantity: 4 },
    ],
    station: 'none',
    craftTime: 4,
  },
  iron_pickaxe: {
    id: 'iron_pickaxe',
    result: { itemId: 'iron_pickaxe', quantity: 1 },
    materials: [
      { itemId: 'wood', quantity: 4 },
      { itemId: 'iron_ore', quantity: 5 },
    ],
    station: 'none',
    craftTime: 4,
  },

  // Receitas de caça: consomem os materiais que a fauna e os saqueadores largam.
  sinew_traps: {
    id: 'sinew_traps',
    result: { itemId: 'trap', quantity: 4 },
    materials: [
      { itemId: 'sinew', quantity: 2 },
      { itemId: 'wood', quantity: 4 },
    ],
    station: 'none',
    craftTime: 2,
  },
  hunter_bow: {
    id: 'hunter_bow',
    result: { itemId: 'hunter_bow', quantity: 1 },
    materials: [
      { itemId: 'bone', quantity: 3 },
      { itemId: 'sinew', quantity: 4 },
      { itemId: 'wood', quantity: 6 },
    ],
    station: 'none',
    craftTime: 4,
  },
  bone_armor: {
    id: 'bone_armor',
    result: { itemId: 'bone_armor', quantity: 1 },
    materials: [
      { itemId: 'bone', quantity: 6 },
      { itemId: 'sinew', quantity: 4 },
      { itemId: 'bear_pelt', quantity: 1 },
    ],
    station: 'forge',
    craftTime: 6,
  },
  // Fecha o laço da caça: os bichos selvagens dropam carne crua, que sem isto
  // não serviria para nada — e o jogador teria saído perdendo cura ao caçar.
  cooked_meat: {
    id: 'cooked_meat',
    result: { itemId: 'cooked_meat', quantity: 2 },
    materials: [
      { itemId: 'raw_meat', quantity: 2 },
      { itemId: 'wood', quantity: 1 },
    ],
    station: 'none',
    craftTime: 2,
  },
};
