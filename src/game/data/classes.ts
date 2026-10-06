export type ClassDefinition = {
  id: string;
  name: string;
  baseHp: number;
  baseMana: number;
  baseStamina: number;
  baseAttackPower: number;
  primaryWeapon: string;
};

export const CLASSES: Record<string, ClassDefinition> = {
  warrior: {
    id: 'warrior',
    name: 'Guerreiro',
    baseHp: 120,
    baseMana: 40,
    baseStamina: 100,
    baseAttackPower: 18,
    primaryWeapon: 'iron_sword',
  },
  hunter: {
    id: 'hunter',
    name: 'Caçador',
    baseHp: 90,
    baseMana: 60,
    baseStamina: 120,
    baseAttackPower: 14,
    primaryWeapon: 'axe',
  },
  mage: {
    id: 'mage',
    name: 'Mago',
    baseHp: 70,
    baseMana: 120,
    baseStamina: 80,
    baseAttackPower: 10,
    primaryWeapon: 'torch',
  },
};
