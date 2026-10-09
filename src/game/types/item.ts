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
  /**
   * Bônus de atributo (%) explícito ao equipar. Se ausente, armadura/acessório
   * usam a tabela por raridade de `attributesSystem`. Somado e travado em 0–100.
   */
  attrBonus?: Partial<{ damage: number; dexterity: number; carry: number; moveSpeed: number }>;
  /** Força o slot de equipamento (ex.: 'accessory'); sem isso o slot sai da categoria. */
  equipSlot?: 'accessory';
  icon: string;
  /**
   * Convenção: o sprite de todo item fica em `/assets/items/<id>.webp` (ver
   * `itemSpriteUrl`). Este campo só existe para sobrescrever o caminho; o `icon`
   * (nome de ícone do lucide) continua sendo o fallback.
   */
  sprite?: string;
};
