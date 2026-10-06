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
};
