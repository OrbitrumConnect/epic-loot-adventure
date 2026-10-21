export type ItemCategory =
  | 'weapon'
  | 'armor'
  | 'tool'
  | 'consumable'
  | 'resource'
  | 'utility'
  | 'skill';

/** 6 tiers (Pedro, fotos TRIBOS): Comum→Incomum→Raro→Épico→Lendário→Ancestral.
 *  Os 4 originais (common/rare/epic + o antigo 'mythic' = legendary) mantêm os
 *  MESMOS valores; 'uncommon' e 'ancestral' são novos (nenhum item atual usa). */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'ancestral';

/** Ordem/índice do tier (0..5) — fonte única pra fórmulas de escala e drop. */
export const RARITY_ORDER: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
/** Rótulos PT da UI. */
export const RARITY_LABEL: Record<Rarity, string> = {
  common: 'Comum', uncommon: 'Incomum', rare: 'Raro', epic: 'Épico', legendary: 'Lendário', ancestral: 'Ancestral',
};
/** Multiplicador de atributo por tier (escala a grade inteira; ajustável). */
export const RARITY_MULT: Record<Rarity, number> = {
  common: 1.0, uncommon: 1.3, rare: 1.7, epic: 2.2, legendary: 2.8, ancestral: 3.5,
};

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
