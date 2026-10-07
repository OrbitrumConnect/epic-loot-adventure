import type { BaseUnitDefinition, ExpeditionDefinition } from '../types';

/** custo(pesquisa, nível atual) = custoBase * RESEARCH_COST_GROWTH^nívelAtual */
export const RESEARCH_COST_GROWTH = 1.6;
/** tempo(pesquisa, nível atual) = tempoBase * RESEARCH_TIME_GROWTH^nívelAtual */
export const RESEARCH_TIME_GROWTH = 1.5;

/** Id da tropa usada nas expedições. */
export const SCOUT_UNIT_ID = 'scout';

/** Expedições simultâneas = 1 + floor(nível da tenda / EXPEDITION_LEVELS_PER_SLOT) */
export const EXPEDITION_LEVELS_PER_SLOT = 5;
/** Bônus de saque por nível da tenda acima do 1. */
export const EXPEDITION_LOOT_PER_TENT_LEVEL = 0.05;

/** Tropas, ferramentas e pesquisas produzidas nas filas das construções. */
export const UNITS: Record<string, BaseUnitDefinition> = {
  // --- Tropas (Campo de Guerra) ---
  warrior: {
    id: 'warrior',
    name: 'Guerreiro',
    description: 'Infantaria básica da tribo.',
    kind: 'troop',
    icon: 'Swords',
    building: 'war_camp',
    minBuildingLevel: 1,
    cost: { wood: 10, stone: 0, food: 30, essence: 0 },
    durationSeconds: 4,
  },
  spearman: {
    id: 'spearman',
    name: 'Lanceiro',
    description: 'Mantém a linha contra feras e cavalaria.',
    kind: 'troop',
    icon: 'Shield',
    building: 'war_camp',
    minBuildingLevel: 3,
    cost: { wood: 25, stone: 5, food: 40, essence: 0 },
    durationSeconds: 6,
  },
  archer: {
    id: 'archer',
    name: 'Arqueiro',
    description: 'Ataca à distância.',
    kind: 'troop',
    icon: 'Crosshair',
    building: 'war_camp',
    minBuildingLevel: 5,
    cost: { wood: 35, stone: 0, food: 45, essence: 0 },
    durationSeconds: 8,
  },
  // --- Batedores (Tenda dos Batedores) ---
  scout: {
    id: 'scout',
    name: 'Batedor',
    description: 'Explora o mapa em expedições e traz recursos.',
    kind: 'troop',
    icon: 'Compass',
    building: 'scout_tent',
    minBuildingLevel: 1,
    cost: { wood: 0, stone: 0, food: 25, essence: 0 },
    durationSeconds: 4,
  },
  // --- Ferramentas (Forja) -> inventário do jogador ---
  tool_torch: {
    id: 'tool_torch',
    name: 'Tocha',
    description: 'Ilumina cavernas e a noite.',
    kind: 'tool',
    icon: 'Flame',
    building: 'forge',
    minBuildingLevel: 1,
    cost: { wood: 15, stone: 0, food: 0, essence: 0 },
    durationSeconds: 3,
    itemId: 'torch',
  },
  tool_trap: {
    id: 'tool_trap',
    name: 'Armadilha',
    description: 'Prende criaturas no mapa.',
    kind: 'tool',
    icon: 'Crosshair',
    building: 'forge',
    minBuildingLevel: 1,
    cost: { wood: 20, stone: 10, food: 0, essence: 0 },
    durationSeconds: 5,
    itemId: 'trap',
  },
  tool_axe: {
    id: 'tool_axe',
    name: 'Machado',
    description: 'Ferramenta para cortar madeira.',
    kind: 'tool',
    icon: 'Axe',
    building: 'forge',
    minBuildingLevel: 2,
    cost: { wood: 30, stone: 20, food: 0, essence: 0 },
    durationSeconds: 6,
    itemId: 'axe',
  },
  tool_pickaxe: {
    id: 'tool_pickaxe',
    name: 'Picareta',
    description: 'Ferramenta para minerar pedra.',
    kind: 'tool',
    icon: 'Pickaxe',
    building: 'forge',
    minBuildingLevel: 2,
    cost: { wood: 30, stone: 25, food: 0, essence: 0 },
    durationSeconds: 6,
    itemId: 'pickaxe',
  },
  tool_iron_sword: {
    id: 'tool_iron_sword',
    name: 'Espada de Ferro',
    description: 'Arma de combate corpo a corpo.',
    kind: 'tool',
    icon: 'Swords',
    building: 'forge',
    minBuildingLevel: 4,
    cost: { wood: 40, stone: 60, food: 0, essence: 2 },
    durationSeconds: 10,
    itemId: 'iron_sword',
  },
  // --- Pesquisas (Círculo do Xamã) ---
  fertile_lands: {
    id: 'fertile_lands',
    name: 'Terras Férteis',
    description: '+10% de produção de recursos por nível.',
    kind: 'research',
    icon: 'Leaf',
    building: 'shaman_circle',
    minBuildingLevel: 1,
    cost: { wood: 0, stone: 0, food: 80, essence: 5 },
    durationSeconds: 10,
    effect: { kind: 'production_pct', perRank: 0.1 },
    maxRank: 5,
  },
  master_builders: {
    id: 'master_builders',
    name: 'Mestres Construtores',
    description: '-5% de tempo de obra por nível.',
    kind: 'research',
    icon: 'Hammer',
    building: 'shaman_circle',
    minBuildingLevel: 2,
    cost: { wood: 80, stone: 80, food: 0, essence: 6 },
    durationSeconds: 12,
    effect: { kind: 'build_time_pct', perRank: 0.05 },
    maxRank: 5,
  },
  ancestral_trails: {
    id: 'ancestral_trails',
    name: 'Trilhas Ancestrais',
    description: '+15% de saque das expedições por nível.',
    kind: 'research',
    icon: 'Compass',
    building: 'shaman_circle',
    minBuildingLevel: 3,
    cost: { wood: 60, stone: 0, food: 100, essence: 8 },
    durationSeconds: 14,
    effect: { kind: 'expedition_loot_pct', perRank: 0.15 },
    maxRank: 5,
  },
  tribal_logistics: {
    id: 'tribal_logistics',
    name: 'Logística Tribal',
    description: '+1 vaga em todas as filas de produção por nível.',
    kind: 'research',
    icon: 'Package',
    building: 'shaman_circle',
    minBuildingLevel: 4,
    cost: { wood: 120, stone: 120, food: 60, essence: 12 },
    durationSeconds: 18,
    effect: { kind: 'queue_slots', perRank: 1 },
    maxRank: 3,
  },
};

export const UNIT_IDS = Object.keys(UNITS);

export const EXPEDITIONS: Record<string, ExpeditionDefinition> = {
  near_trail: {
    id: 'near_trail',
    name: 'Trilha próxima',
    durationSeconds: 20,
    minTentLevel: 1,
    lootPerScout: { wood: 20, stone: 12, food: 15, essence: 0 },
    explorePerScout: 0.5,
  },
  deep_valley: {
    id: 'deep_valley',
    name: 'Vale profundo',
    durationSeconds: 60,
    minTentLevel: 3,
    lootPerScout: { wood: 55, stone: 35, food: 40, essence: 1 },
    explorePerScout: 1.2,
  },
  far_lands: {
    id: 'far_lands',
    name: 'Terras distantes',
    durationSeconds: 180,
    minTentLevel: 6,
    lootPerScout: { wood: 150, stone: 100, food: 110, essence: 3 },
    explorePerScout: 3,
  },
};

export const EXPEDITION_IDS = Object.keys(EXPEDITIONS);
