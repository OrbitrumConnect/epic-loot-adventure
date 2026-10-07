import type { BaseResourceId, BaseResources, BuildingDefinition, BuildingId, EraDefinition } from '../types';

/**
 * Escala única de tempo da cidade. Todas as durações (obras, filas, expedições)
 * são multiplicadas por este valor. 1 = protótipo jogável em minutos
 * (ações de nível 1 levam poucos segundos). Aumente para um ritmo "real".
 */
export const BASE_TIME_SCALE = 1;

export const MAX_BUILDING_LEVEL = 20;

/** Grade isométrica de terrenos (GRID_SIZE x GRID_SIZE). */
export const GRID_SIZE = 5;
export const PLOT_COUNT = GRID_SIZE * GRID_SIZE;
/** Terreno central, onde o Salão da Tribo nasce. */
export const HALL_PLOT_INDEX = Math.floor(PLOT_COUNT / 2);

/** Obras simultâneas; pedidos extras aguardam na fila em ordem de chegada. */
export const BASE_BUILDERS = 2;

/** custo(nível) = custoBase * COST_GROWTH^(nível-1) */
export const COST_GROWTH = 1.4;
/** tempo(nível) = tempoBase * TIME_GROWTH^(nível-1) */
export const TIME_GROWTH = 1.45;
/** produção(nível) = base * nível * PRODUCTION_GROWTH^(nível-1) por minuto */
export const PRODUCTION_GROWTH = 1.12;

/** capacidade(nível do salão) = base * STORAGE_GROWTH^(nível-1) */
export const STORAGE_BASE: BaseResources = { wood: 500, stone: 500, food: 500, essence: 100 };
export const STORAGE_GROWTH = 1.35;

/** vagas da fila = QUEUE_BASE_CAPACITY + floor(nível / QUEUE_LEVELS_PER_SLOT) + pesquisas */
export const QUEUE_BASE_CAPACITY = 2;
export const QUEUE_LEVELS_PER_SLOT = 3;

export const STARTING_RESOURCES: BaseResources = { wood: 300, stone: 200, food: 150, essence: 10 };

export const BASE_RESOURCE_IDS: BaseResourceId[] = ['wood', 'stone', 'food', 'essence'];

export const BASE_RESOURCE_NAMES: Record<BaseResourceId, string> = {
  wood: 'Madeira',
  stone: 'Pedra',
  food: 'Comida',
  essence: 'Essência',
};

/** Itens do inventário do jogador que podem ser depositados no estoque da base. */
export const DEPOSIT_ITEMS: { itemId: string; resource: BaseResourceId }[] = [
  { itemId: 'wood', resource: 'wood' },
  { itemId: 'stone', resource: 'stone' },
  { itemId: 'arcane_essence', resource: 'essence' },
];

export const ERAS: EraDefinition[] = [
  { id: 'hide', name: 'Era da Pele', minLevel: 1, maxLevel: 4 },
  { id: 'wood', name: 'Era da Madeira', minLevel: 5, maxLevel: 8 },
  { id: 'stone', name: 'Era da Pedra', minLevel: 9, maxLevel: 12 },
  { id: 'bronze', name: 'Era do Bronze', minLevel: 13, maxLevel: 16 },
  { id: 'iron', name: 'Era do Ferro', minLevel: 17, maxLevel: 20 },
];

export const BUILDINGS: Record<BuildingId, BuildingDefinition> = {
  tribe_hall: {
    id: 'tribe_hall',
    name: 'Salão da Tribo',
    description: 'Coração da tribo. Limita o nível das demais construções e amplia o armazém.',
    icon: 'Castle',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 1,
    unlockHallLevel: 1,
    baseCost: { wood: 120, stone: 60, food: 0, essence: 0 },
    baseBuildSeconds: 8,
    produces: null,
    queueKind: null,
  },
  lumber_camp: {
    id: 'lumber_camp',
    name: 'Acampamento de Lenhadores',
    description: 'Produz madeira continuamente.',
    icon: 'TreePine',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 3,
    unlockHallLevel: 1,
    baseCost: { wood: 50, stone: 20, food: 0, essence: 0 },
    baseBuildSeconds: 5,
    produces: { resource: 'wood', basePerMinute: 30 },
    queueKind: null,
  },
  quarry: {
    id: 'quarry',
    name: 'Pedreira',
    description: 'Produz pedra continuamente.',
    icon: 'Mountain',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 3,
    unlockHallLevel: 1,
    baseCost: { wood: 60, stone: 20, food: 0, essence: 0 },
    baseBuildSeconds: 5,
    produces: { resource: 'stone', basePerMinute: 24 },
    queueKind: null,
  },
  hunting_lodge: {
    id: 'hunting_lodge',
    name: 'Cabana de Caça',
    description: 'Produz comida continuamente.',
    icon: 'Utensils',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 3,
    unlockHallLevel: 1,
    baseCost: { wood: 50, stone: 10, food: 0, essence: 0 },
    baseBuildSeconds: 5,
    produces: { resource: 'food', basePerMinute: 24 },
    queueKind: null,
  },
  war_camp: {
    id: 'war_camp',
    name: 'Campo de Guerra',
    description: 'Treina tropas para defender e atacar.',
    icon: 'Swords',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 1,
    unlockHallLevel: 2,
    baseCost: { wood: 120, stone: 80, food: 40, essence: 0 },
    baseBuildSeconds: 8,
    produces: null,
    queueKind: 'troop',
  },
  scout_tent: {
    id: 'scout_tent',
    name: 'Tenda dos Batedores',
    description: 'Treina batedores e envia expedições para explorar o mapa.',
    icon: 'Tent',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 1,
    unlockHallLevel: 2,
    baseCost: { wood: 80, stone: 0, food: 40, essence: 0 },
    baseBuildSeconds: 6,
    produces: null,
    queueKind: 'troop',
  },
  forge: {
    id: 'forge',
    name: 'Forja',
    description: 'Fabrica ferramentas que vão para a mochila do jogador.',
    icon: 'Hammer',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 1,
    unlockHallLevel: 3,
    baseCost: { wood: 100, stone: 120, food: 0, essence: 0 },
    baseBuildSeconds: 8,
    produces: null,
    queueKind: 'tool',
  },
  shaman_circle: {
    id: 'shaman_circle',
    name: 'Círculo do Xamã',
    description: 'Pesquisa tecnologias que concedem bônus permanentes.',
    icon: 'Sparkles',
    maxLevel: MAX_BUILDING_LEVEL,
    maxInstances: 1,
    unlockHallLevel: 3,
    baseCost: { wood: 150, stone: 150, food: 0, essence: 5 },
    baseBuildSeconds: 10,
    produces: null,
    queueKind: 'research',
  },
};

export const BUILDING_IDS = Object.keys(BUILDINGS) as BuildingId[];
