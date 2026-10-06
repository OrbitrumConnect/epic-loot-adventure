export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'tool'
  | 'consumable'
  | 'resource'
  | 'utility'
  | 'skill';

export type Rarity = 'common' | 'rare' | 'epic' | 'mythic';

export type Item = {
  id: string;
  name: string;
  category: ItemCategory;
  rarity: Rarity;
  weight: number;
  maxStack: number;
  dropOnDeath: boolean;
  usable: boolean;
  equippable: boolean;
  attackPower?: number;
  armor?: number;
  healAmount?: number;
  icon: string;
};
