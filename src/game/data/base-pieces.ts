import { BASE_GRID, type BasePieceKind } from '../types/playerbase';

/**
 * Peças da base do jogador (Fase 3). Só quatro formas simples, mais o núcleo
 * (a cama). Cada peça ocupa UMA quadrícula de `BASE_GRID` metros.
 * Custos usam itens que já existem na bolsa (madeira, pedra, minério de ferro).
 */

/** Lado do quadrado do claim, em quadrículas (11 x 2 m = 22 m — +3 m/lado p/ a casa grande). */
export const CLAIM_SIZE = 11;
/** Folga mínima entre dois claims, em quadrículas (distância real entre as bordas). */
export const MIN_BASE_DISTANCE = 4;
/** Desnível máximo (m) entre o ponto mais alto e o mais baixo do claim. */
export const MAX_CLAIM_RELIEF = 2.5;
/** Margem (m) que o claim guarda da água: o claim inteiro tem de ficar fora. */
export const CLAIM_WATER_MARGIN = 1;

/** Pedaços de muro (muro + porta) para sair do estágio `foundation` (primeira fiada). */
export const FOUNDATION_MIN_WALLS = 4;
/** Pedaços de muro (muro + porta) para sair do estágio `walls`. */
export const WALLS_MIN = 12;
/** Torres para sair do estágio `towers`. */
export const TOWERS_MIN = 1;

export type BaseCost = { itemId: string; quantity: number };

export type TowerCombat = { range: number; damage: number; cooldownMs: number };
/** Altura do GLB compartilhada com a origem dos disparos. */
export const BASE_TOWER_HEIGHT = 6;
/** Centro interno ocupa uma célula, com margem de 10% para circulação. */
export const BASE_TRAINING_WIDTH = BASE_GRID * 0.9;

export type BasePieceDefinition = {
  kind: BasePieceKind;
  name: string;
  /** Custo por tier (índice 0 = tier 1). */
  cost: [BaseCost[], BaseCost[], BaseCost[]];
  /** HP por tier (índice 0 = tier 1). */
  hp: [number, number, number];
  /** Peça sólida; prédios internos como training não contam no teste de cerco. */
  solid: boolean;
  combat?: [TowerCombat, TowerCombat, TowerCombat];
};

export const BASE_PIECES: Record<BasePieceKind, BasePieceDefinition> = {
  training: {
    kind: 'training',
    name: 'Centro de treinamento',
    cost: [
      [{ itemId: 'wood', quantity: 12 }, { itemId: 'stone', quantity: 8 }],
      [{ itemId: 'wood', quantity: 16 }, { itemId: 'stone', quantity: 18 }],
      [{ itemId: 'iron_ore', quantity: 12 }, { itemId: 'stone', quantity: 24 }],
    ],
    hp: [250, 500, 1000],
    solid: true,
  },
  core: {
    kind: 'core',
    name: 'Cama',
    // Coração da base (alvo FINAL da horda): HP alto pra não cair rápido — só é
    // atacado depois que muros/torres caem (perímetro furado).
    cost: [[{ itemId: 'wood', quantity: 4 }], [{ itemId: 'wood', quantity: 4 }], [{ itemId: 'wood', quantity: 4 }]],
    hp: [400, 800, 1600],
    solid: false,
  },
  wall: {
    kind: 'wall',
    name: 'Muro',
    cost: [
      [{ itemId: 'wood', quantity: 2 }],
      [{ itemId: 'stone', quantity: 2 }, { itemId: 'wood', quantity: 1 }],
      [{ itemId: 'iron_ore', quantity: 2 }, { itemId: 'stone', quantity: 2 }],
    ],
    hp: [100, 240, 480],
    solid: true,
  },
  door: {
    kind: 'door',
    name: 'Porta',
    cost: [
      [{ itemId: 'wood', quantity: 3 }],
      [{ itemId: 'wood', quantity: 2 }, { itemId: 'stone', quantity: 2 }],
      [{ itemId: 'iron_ore', quantity: 3 }, { itemId: 'wood', quantity: 2 }],
    ],
    hp: [60, 140, 300],
    solid: true,
  },
  tower: {
    kind: 'tower',
    name: 'Torre',
    cost: [
      [{ itemId: 'wood', quantity: 6 }, { itemId: 'stone', quantity: 4 }],
      [{ itemId: 'stone', quantity: 8 }, { itemId: 'wood', quantity: 4 }],
      [{ itemId: 'iron_ore', quantity: 6 }, { itemId: 'stone', quantity: 8 }],
    ],
    hp: [200, 450, 900],
    combat: [
      { range: 17, damage: 18, cooldownMs: 1400 },
      { range: 21, damage: 30, cooldownMs: 1100 },
      { range: 25, damage: 46, cooldownMs: 800 },
    ],
    solid: true,
  },
  roof: {
    kind: 'roof',
    name: 'Telhado',
    cost: [
      [{ itemId: 'wood', quantity: 3 }],
      [{ itemId: 'wood', quantity: 2 }, { itemId: 'stone', quantity: 1 }],
      [{ itemId: 'stone', quantity: 3 }],
    ],
    hp: [50, 110, 220],
    solid: false,
  },
};

export function pieceCost(kind: BasePieceKind, tier: 1 | 2 | 3): BaseCost[] {
  return BASE_PIECES[kind].cost[tier - 1]!;
}

export function pieceMaxHp(kind: BasePieceKind, tier: 1 | 2 | 3): number {
  return BASE_PIECES[kind].hp[tier - 1]!;
}
