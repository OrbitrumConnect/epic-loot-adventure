import type { HarvestNodeState, Position } from '../types';
import { HARVEST_NODES } from '../data/harvest-nodes';
import { freeOfSpawn, near, rng32, SURF, ZS_SAFE, type ZsQuery } from './zsSpawnSystem';

const NODE_SPACING = 14;
/** Folga (m) de PISTA e de ÁGUA (Pedro 01/11: "não ficar em cima da estrada, nem dentro da Lagoa"): medido, 4 pedras
 *  estavam a < 4 m de uma pista — a árvore/pedra é larga, o centro fora da pista não basta. */
export const ZS_NODE_CLEAR = 6;
const clearOfRoadAndWater = (q: ZsQuery, x: number, z: number) =>
  !near(q, x, z, SURF.road, ZS_NODE_CLEAR) && !near(q, x, z, SURF.lagoon, ZS_NODE_CLEAR) && !near(q, x, z, SURF.sea, ZS_NODE_CLEAR);
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

/**
 * MAIS FARM (Pedro 01/11: "ainda vejo pouco material de farm — falta árvore e pedra"; "na área verde perto da praia, perto
 * da Lagoa, mas não dentro da água ou na estrada"). Medido: eram 108 no mapa INTEIRO (1 a cada ~125 m) e nenhum a menos
 * de 140 m do nascedouro. Os 108 de antes ficam EXATAMENTE onde estavam (mesma leva, mesma seed); esta 2ª leva SOMA,
 * com ids continuando a contagem: árvore também no VERDE (terra, não só mata) — uma parte reservada pra beira da
 * praia/Lagoa —, mais perto do nascedouro (fora da zona segura) e sempre com a folga de pista/água.
 */
export const ZS_FARM_EXTRA: { kind: 'tree' | 'pebble' | 'rock'; count: number; shore?: boolean; maxFromSpawn?: number }[] = [
  // perto de onde se começa (medido: entre 70 e 260 m do nascedouro cabem ~170 com a folga de 14 m; antes: 0 a < 140 m)
  { kind: 'tree', count: 16, maxFromSpawn: 260 },
  { kind: 'rock', count: 6, maxFromSpawn: 260 },
  { kind: 'pebble', count: 6, maxFromSpawn: 260 },
  { kind: 'tree', count: 30, shore: true },   // verde perto da praia/Lagoa
  { kind: 'tree', count: 42 },                // mata e verde em geral
  { kind: 'pebble', count: 20 },
  { kind: 'rock', count: 30 },
];
/** a 2ª leva chega até aqui do nascedouro (a zona segura tem 45 m) */
export const ZS_FARM_EXTRA_CLEAR = 70;
/** "perto da praia/Lagoa": areia ou água da Lagoa a até isto (m) */
const SHORE_R = 70;
const nearShore = (q: ZsQuery, x: number, z: number) => near(q, x, z, SURF.beach, SHORE_R) || near(q, x, z, SURF.lagoon, SHORE_R);

/** Nós de madeira/pedra da Zona Sul. Mesma seed = mesmo mapa. */
export function createZsHarvestNodes(q: ZsQuery, seed = 20261029): HarvestNodeState[] {
  const nodes = createZsBaseHarvestNodes(q, seed);
  addZsExtraHarvestNodes(q, nodes, seed ^ 0x6661726d);
  return nodes;
}

/** 2ª leva (ver ZS_FARM_EXTRA): soma em `nodes`, mantendo o espaçamento com os que já existem. */
function addZsExtraHarvestNodes(q: ZsQuery, nodes: HarvestNodeState[], seed: number): void {
  const rand = rng32(seed);
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const clear2 = ZS_FARM_EXTRA_CLEAR * ZS_FARM_EXTRA_CLEAR;
  for (const target of ZS_FARM_EXTRA) {
    const def = HARVEST_NODES[target.kind];
    let added = 0, attempts = 0;
    while (added < target.count && attempts++ < target.count * 4000) {
      let x: number, z: number;
      if (target.maxFromSpawn) { // sorteia direto no disco em volta do nascedouro
        const r = Math.sqrt(rand()) * target.maxFromSpawn, a = rand() * Math.PI * 2;
        x = ZS_SAFE.x + Math.sin(a) * r; z = ZS_SAFE.z + Math.cos(a) * r;
        if (x < minX + 8 || x > maxX - 8 || z < minZ + 8 || z > maxZ - 8) continue;
      } else {
        x = minX + 8 + rand() * Math.max(1, maxX - minX - 16);
        z = minZ + 8 + rand() * Math.max(1, maxZ - minZ - 16);
      }
      if (!dryGround(q, x, z) || q.surf(x, z) === SURF.beach) continue;
      if ((x - ZS_SAFE.x) ** 2 + (z - ZS_SAFE.z) ** 2 < clear2) continue;
      const forest = q.surf(x, z) === SURF.forest;
      if (target.kind !== 'tree' && forest) continue;            // pedra fora da mata (igual à 1ª leva)
      if (target.shore && !nearShore(q, x, z)) continue;
      if (!clearOfRoadAndWater(q, x, z)) continue;
      const position = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
      if (nodes.some(n => distance2(n.position, position) < NODE_SPACING ** 2)) continue;
      const ordinal = nodes.filter(n => n.kind === target.kind).length;
      nodes.push({
        id: `zs_hn_${target.kind}_${ordinal}`, kind: target.kind, position,
        quantity: def.capacity, maxQuantity: def.capacity, depleted: false, respawnAt: null, seed: rand(),
      });
      added++;
    }
  }
}

/** 1ª leva (a de sempre): 48 árvores na mata, 24 pedrinhas e 36 pedras fora dela, longe do nascedouro. */
function createZsBaseHarvestNodes(q: ZsQuery, seed: number): HarvestNodeState[] {
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
      if (!clearOfRoadAndWater(q, x, z)) continue;
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
