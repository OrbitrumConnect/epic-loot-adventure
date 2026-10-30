import type { HarvestNodeState, Position } from '../types';
import { HARVEST_NODES } from '../data/harvest-nodes';
import { freeOfSpawn, rng32, SURF, type ZsQuery } from './zsSpawnSystem';

const NODE_SPACING = 14;
const TARGETS = [
  { kind: 'tree' as const, count: 48 },
  { kind: 'pebble' as const, count: 24 },
  { kind: 'rock' as const, count: 36 },
];

const distance2 = (a: Position, b: Position) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
const dryGround = (q: ZsQuery, x: number, z: number) => {
  const surf = q.surf(x, z);
  return (surf === SURF.land || surf === SURF.forest) && q.height(x, z) > 0.5;
};

/** Nós de madeira/pedra da Zona Sul. Mesma seed = mesmo mapa. */
export function createZsHarvestNodes(q: ZsQuery, seed = 20261029): HarvestNodeState[] {
  const rand = rng32(seed);
  const nodes: HarvestNodeState[] = [];
  const { minX, maxX, minZ, maxZ } = q.bounds;
  for (const target of TARGETS) {
    const def = HARVEST_NODES[target.kind];
    let attempts = 0;
    while (nodes.filter(n => n.kind === target.kind).length < target.count && attempts++ < target.count * 2500) {
      const x = minX + 8 + rand() * Math.max(1, maxX - minX - 16);
      const z = minZ + 8 + rand() * Math.max(1, maxZ - minZ - 16);
      const forest = q.surf(x, z) === SURF.forest;
      if (!dryGround(q, x, z) || !freeOfSpawn(q, x, z) || (target.kind === 'tree' ? !forest : forest)) continue;
      const position = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
      if (nodes.some(n => distance2(n.position, position) < NODE_SPACING ** 2)) continue;
      const ordinal = nodes.filter(n => n.kind === target.kind).length;
      nodes.push({
        id: `zs_hn_${target.kind}_${ordinal}`,
        kind: target.kind,
        position,
        quantity: def.capacity,
        maxQuantity: def.capacity,
        depleted: false,
        respawnAt: null,
        seed: rand(),
      });
    }
  }
  return nodes;
}
