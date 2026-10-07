import type {
  HarvestNodeKind, HarvestNodeState, HarvestResult, HarvestTool, InventoryState, Position,
} from '../types';
import { HARVEST_NODES, HARVEST_NODE_TARGETS, HARVEST_TOOLS } from '../data/harvest-nodes';
import { CAMPS, CAMP_PLACEMENTS, PLAYER_SPAWN, RUINS_POSITION, RUINS_RADIUS, WORLD_HALF } from '../data/camps';
import { ITEMS } from '../data/items';
import { addItem, canAddItem } from './inventorySystem';

// ---------------------------------------------------------------------------
// Colocação procedural
// ---------------------------------------------------------------------------

/** Nenhum nó nasce a menos disto do centro do nascedouro. */
export const HARVEST_SPAWN_CLEARING = 5;
/** Folga extra além do raio de cada acampamento. */
export const HARVEST_CAMP_MARGIN = 2;
/** Distância mínima entre dois nós. */
export const HARVEST_MIN_SPACING = 1.6;
/** Margem para não colar na borda do mapa. */
const EDGE_MARGIN = 2;
export const DEFAULT_HARVEST_SEED = 20260;

type Zone = { x: number; z: number; spread: number };

/** Centros de floresta e de terreno rochoso (pontos fixos do vale). */
const FOREST_ZONES: Zone[] = [
  { x: -20, z: -12, spread: 9 },
  { x: 12, z: 26, spread: 9 },
  { x: -12, z: 32, spread: 8 },
  { x: 24, z: -4, spread: 8 },
  { x: -38, z: 36, spread: 7 },
  { x: 38, z: 30, spread: 7 },
  { x: -8, z: -34, spread: 8 },
];
const ROCKY_ZONES: Zone[] = [
  { x: -36, z: 2, spread: 7 },
  { x: 36, z: 8, spread: 7 },
  { x: 2, z: -38, spread: 8 },
  { x: 16, z: -30, spread: 6 },
  { x: -18, z: 40, spread: 6 },
];

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Posição livre para um nó: dentro do mapa, fora da clareira, dos acampamentos e das ruínas. */
export function isFreeForNode(p: Position): boolean {
  const limit = WORLD_HALF - EDGE_MARGIN;
  if (Math.abs(p.x) > limit || Math.abs(p.z) > limit) return false;
  if (dist(p, PLAYER_SPAWN) < HARVEST_SPAWN_CLEARING) return false;
  if (dist(p, RUINS_POSITION) < RUINS_RADIUS) return false;
  for (const placement of CAMP_PLACEMENTS) {
    const def = CAMPS[placement.defId];
    if (!def) continue;
    if (dist(p, placement.position) < def.radius + HARVEST_CAMP_MARGIN) return false;
  }
  return true;
}

const INVALID: Position = { x: Number.NaN, z: Number.NaN };

/**
 * Posiciona os nós de forma determinística (mesma `seed` = mesmo mundo).
 *  - árvores: 85% em manchas de floresta, 15% espalhadas
 *  - rochas e ferro: terreno rochoso; ouro só a 25m+ da base
 *  - pedregulhos: espalhados; cristais: espalhados a 15m+ da base
 */
export function createHarvestNodes(seed: number = DEFAULT_HARVEST_SEED): HarvestNodeState[] {
  const rng = mulberry32(seed);
  const nodes: HarvestNodeState[] = [];

  const around = (zone: Zone): Position => ({
    x: zone.x + (rng() + rng() - 1) * zone.spread * 1.5,
    z: zone.z + (rng() + rng() - 1) * zone.spread * 1.5,
  });
  const anywhere = (): Position => ({
    x: (rng() * 2 - 1) * WORLD_HALF,
    z: (rng() * 2 - 1) * WORLD_HALF,
  });
  const pick = (zones: Zone[]): Zone => zones[Math.floor(rng() * zones.length)]!;

  const sampler: Record<HarvestNodeKind, () => Position> = {
    tree: () => (rng() < 0.85 ? around(pick(FOREST_ZONES)) : anywhere()),
    pebble: () => anywhere(),
    rock: () => (rng() < 0.8 ? around(pick(ROCKY_ZONES)) : anywhere()),
    iron_vein: () => around(pick(ROCKY_ZONES)),
    gold_vein: () => {
      const p = around(pick(ROCKY_ZONES));
      return dist(p, PLAYER_SPAWN) < 25 ? INVALID : p;
    },
    crystal: () => {
      const p = anywhere();
      return dist(p, PLAYER_SPAWN) < 15 ? INVALID : p;
    },
  };

  // Raros primeiro: pegam o espaço antes das árvores.
  const order: HarvestNodeKind[] = ['gold_vein', 'iron_vein', 'crystal', 'rock', 'tree', 'pebble'];
  for (const kind of order) {
    const target = HARVEST_NODE_TARGETS[kind];
    const def = HARVEST_NODES[kind];
    let placed = 0;
    let attempts = 0;
    while (placed < target && attempts < target * 200) {
      attempts += 1;
      const p = sampler[kind]();
      if (!Number.isFinite(p.x) || !Number.isFinite(p.z)) continue;
      const pos: Position = { x: Math.round(p.x * 100) / 100, z: Math.round(p.z * 100) / 100 };
      if (!isFreeForNode(pos)) continue;
      if (nodes.some(n => dist(n.position, pos) < HARVEST_MIN_SPACING)) continue;
      nodes.push({
        id: `hn_${kind}_${placed}`,
        kind,
        position: pos,
        quantity: def.capacity,
        maxQuantity: def.capacity,
        depleted: false,
        respawnAt: null,
        seed: rng(),
      });
      placed += 1;
    }
  }
  return nodes;
}

// ---------------------------------------------------------------------------
// Colheita
// ---------------------------------------------------------------------------

export type HarvestOutcome = HarvestResult & {
  node: HarvestNodeState;
  /** Inventário depois de receber o recurso (igual ao de entrada quando `ok` é false). */
  inventory: InventoryState;
  resourceId: string | null;
};

/**
 * Melhor multiplicador de rendimento entre as ferramentas do tipo, olhando a
 * equipada e a mochila inteira (carregar a ferramenta basta). `null` = não tem.
 */
export function getToolMultiplier(
  tool: HarvestTool,
  equippedToolItemId: string | null,
  inventory: InventoryState,
): number | null {
  if (tool === 'hand') return 1;
  let best: number | null = null;
  const consider = (itemId: string | null | undefined) => {
    if (!itemId) return;
    const entry = HARVEST_TOOLS[itemId];
    if (!entry || entry.tool !== tool) return;
    if (best == null || entry.yieldMultiplier > best) best = entry.yieldMultiplier;
  };
  consider(equippedToolItemId);
  for (const slot of inventory.slots) {
    if (slot.itemId && slot.quantity > 0) consider(slot.itemId);
  }
  return best;
}

function refuse(
  node: HarvestNodeState,
  inventory: InventoryState,
  message: string,
  missingTool: HarvestTool | null = null,
): HarvestOutcome {
  return { ok: false, harvested: 0, xp: 0, message, missingTool, node, inventory, resourceId: null };
}

export function harvestNode(
  node: HarvestNodeState,
  equippedToolItemId: string | null,
  inventory: InventoryState,
  now: number,
): HarvestOutcome {
  const def = HARVEST_NODES[node.kind];
  if (node.depleted || node.quantity <= 0) {
    return refuse(node, inventory, `${def.name} esgotado.`);
  }

  const multiplier = getToolMultiplier(def.tool, equippedToolItemId, inventory);
  let perHit: number;
  let handOnly = false;
  if (multiplier != null) {
    perHit = Math.ceil(def.yieldPerHit * multiplier);
  } else if (def.handYield > 0) {
    perHit = def.handYield;
    handOnly = true;
  } else {
    const toolName = def.tool === 'axe' ? 'um Machado' : 'uma Picareta';
    return refuse(node, inventory, `Você precisa de ${toolName} para colher ${def.name}.`, def.tool);
  }

  const amount = Math.min(perHit, node.quantity);
  if (!canAddItem(inventory, def.resourceId, amount)) {
    return refuse(node, inventory, 'Mochila cheia. Retorne à base.');
  }

  const remaining = node.quantity - amount;
  const depleted = remaining <= 0;
  const nextNode: HarvestNodeState = {
    ...node,
    quantity: remaining,
    depleted,
    respawnAt: depleted ? now + def.respawnMs : null,
  };
  const itemName = ITEMS[def.resourceId]?.name ?? def.resourceId;
  const toolHint = handOnly
    ? ` (na mão rende pouco: ${def.tool === 'axe' ? 'um Machado' : 'uma Picareta'} rende mais)`
    : '';
  const message = `+${amount} ${itemName}${toolHint}.${depleted ? ` ${def.name} esgotado.` : ''}`;

  return {
    ok: true,
    harvested: amount,
    xp: def.xp,
    message,
    missingTool: null,
    node: nextNode,
    inventory: addItem(inventory, def.resourceId, amount),
    resourceId: def.resourceId,
  };
}

/** Repõe os nós esgotados cujo `respawnAt` venceu. Devolve o mesmo array se nada mudou. */
export function tickHarvestNodes(nodes: HarvestNodeState[], now: number): HarvestNodeState[] {
  let changed = false;
  const next = nodes.map(node => {
    if (!node.depleted || node.respawnAt == null || now < node.respawnAt) return node;
    changed = true;
    return { ...node, quantity: node.maxQuantity, depleted: false, respawnAt: null };
  });
  return changed ? next : nodes;
}
