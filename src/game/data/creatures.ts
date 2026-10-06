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
  },
};
