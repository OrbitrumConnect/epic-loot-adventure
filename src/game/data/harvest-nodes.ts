import type { HarvestNodeDefinition, HarvestNodeKind, HarvestTool } from '../types';

export const HARVEST_NODES: Record<HarvestNodeKind, HarvestNodeDefinition> = {
  tree: {
    kind: 'tree', name: 'Árvore', resourceId: 'wood', tool: 'axe',
    yieldPerHit: 4, handYield: 1, capacity: 16, respawnMs: 90_000, range: 3.2, xp: 3, icon: 'TreePine',
  },
  pebble: {
    kind: 'pebble', name: 'Pedregulho', resourceId: 'stone', tool: 'hand',
    yieldPerHit: 2, handYield: 2, capacity: 4, respawnMs: 60_000, range: 3.2, xp: 1, icon: 'Mountain',
  },
  rock: {
    kind: 'rock', name: 'Rocha', resourceId: 'stone', tool: 'pickaxe',
    yieldPerHit: 5, handYield: 0, capacity: 25, respawnMs: 120_000, range: 3.2, xp: 3, icon: 'Mountain',
  },
  iron_vein: {
    kind: 'iron_vein', name: 'Veio de Ferro', resourceId: 'iron_ore', tool: 'pickaxe',
    yieldPerHit: 3, handYield: 0, capacity: 12, respawnMs: 180_000, range: 3.2, xp: 6, icon: 'Mountain',
  },
  gold_vein: {
    kind: 'gold_vein', name: 'Veio de Ouro', resourceId: 'gold_ore', tool: 'pickaxe',
    yieldPerHit: 2, handYield: 0, capacity: 8, respawnMs: 300_000, range: 3.2, xp: 10, icon: 'Gem',
  },
  crystal: {
    kind: 'crystal', name: 'Cristal Arcano', resourceId: 'arcane_essence', tool: 'hand',
    yieldPerHit: 1, handYield: 1, capacity: 4, respawnMs: 240_000, range: 3.2, xp: 8, icon: 'Gem',
  },
};

/**
 * Ferramentas de colheita por item. `yieldMultiplier` multiplica `yieldPerHit`
 * (arredondado para cima). A de ferro rende o dobro da básica.
 */
export const HARVEST_TOOLS: Record<string, { tool: HarvestTool; yieldMultiplier: number }> = {
  axe: { tool: 'axe', yieldMultiplier: 1 },
  iron_axe: { tool: 'axe', yieldMultiplier: 2 },
  pickaxe: { tool: 'pickaxe', yieldMultiplier: 1 },
  iron_pickaxe: { tool: 'pickaxe', yieldMultiplier: 2 },
};

/** Quantos nós de cada tipo `createHarvestNodes` posiciona. */
export const HARVEST_NODE_TARGETS: Record<HarvestNodeKind, number> = {
  tree: 140,
  pebble: 50,
  rock: 40,
  iron_vein: 22,
  gold_vein: 10,
  crystal: 14,
};

/** Total de nós do mundo (soma dos alvos acima). */
export const HARVEST_NODE_COUNT: number = Object.values(HARVEST_NODE_TARGETS).reduce((a, b) => a + b, 0);
