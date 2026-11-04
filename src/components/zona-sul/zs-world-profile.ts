/**
 * PERFIL DA ZONA SUL a partir do terreno (29/10): o que as regras do jogo precisam saber do mapa — chão, terra firme,
 * limites, nascedouro/zona segura (praia do Arpoador), faixas de perigo e os acampamentos na mata.
 * Puro (recebe o terreno decodificado): o mundo 3D usa ao carregar; os testes usam com o PNG de verdade.
 */
import type { WorldProfile } from '@/game/data/world-profile';
import { CREATURES, scaleEnemyHp } from '@/game/data/creatures';
import type { CreatureState, HarvestNodeState } from '@/game/types';
import { HARVEST_NODES } from '@/game/data/harvest-nodes';
import { pickZsCampSites, ZS_HILLTOP_CAMPS, ZS_SAFE, ZS_SHARK_MIN_DEPTH, ZS_ZONE_RADII, type ZsQuery } from '@/game/systems/zsSpawnSystem';
import { type ZsTerrain, zsBounds, zsHeightAt, zsSeaBounds, zsSlopeDeg, zsSurfAt, ZS_WATER_Y, zsWaterYAt } from './zs-terrain-data';
import { ZS_SURF } from './zona-sul-meta';
import { CAVE_BOSS, CAVE_TUNE, caveEnemySpots, caveLayer, caveOreSpots, zsCaveUnder } from './zs-cave';

/** Os BICHOS da caverna (31/10): Fauce de Sílex e Aberração nos salões — mesmo formato da fauna (`wild_cave_*` → força
 *  pela região e renascer iguais aos da mata); nascem no chão da caverna (`homeY`). Precisa do chão ligado (zsCaveUnder). */
export function createCaveCreatures(): CreatureState[] {
  const out: CreatureState[] = [];
  for (const s of caveEnemySpots()) {
    const def = CREATURES[s.speciesId];
    if (!def) continue;
    const k = CAVE_TUNE[def.id] ?? { hp: 1, atk: 1 }; // versão "comum" de quem é chefe noutro lugar (03/11)
    const hp = Math.round(scaleEnemyHp(def.maxHp) * k.hp);
    out.push({
      id: s.id, speciesId: def.id, name: def.name, hp, maxHp: hp, attackPower: Math.round(def.attackPower * k.atk), armor: def.armor,
      attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: s.x, z: s.z }, behavior: 'patrol', lootTable: [], respawnAt: null,
    });
  }
  const boss = createCaveBoss();
  if (boss) out.push(boss);
  return out;
}

/** VEIOS DE FERRO da caverna (02/11): nós de coleta comuns (o veio do jogo: picareta, 12 de ferro, renasce em 3 min) na
 *  CAMADA da caverna e na altura do chão de lá. Precisa do chão ligado (setCaveTerrain). */
export function createCaveOreNodes(): HarvestNodeState[] {
  const def = HARVEST_NODES.iron_vein;
  return caveOreSpots().map((s, i) => ({
    id: s.id, kind: 'iron_vein' as const, position: { x: s.x, z: s.z }, y: s.y, layer: caveLayer(s.x, s.y, s.z),
    quantity: def.capacity, maxQuantity: def.capacity, depleted: false, respawnAt: null, seed: ((i * 0.6180339887) % 1),
  }));
}

/** O CHEFE da caverna (salão do fundo) — mesmo formato da fauna; nasce no chão de lá (`homeY` da camada de baixo). */
export function createCaveBoss(): CreatureState | null {
  const def = CREATURES[CAVE_BOSS.speciesId];
  if (!def) return null;
  const hp = Math.round(scaleEnemyHp(def.maxHp) * CAVE_BOSS.hpK);
  return {
    id: CAVE_BOSS.id, speciesId: def.id, name: def.name, hp, maxHp: hp, attackPower: def.attackPower, armor: def.armor,
    attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: CAVE_BOSS.x, z: CAVE_BOSS.z }, behavior: 'patrol', lootTable: [], respawnAt: null,
  };
}

export function zsQuery(t: ZsTerrain): ZsQuery {
  const b = zsBounds(t);
  return {
    bounds: { minX: b.minX, maxX: b.maxX, minZ: b.minZ, maxZ: b.maxZ },
    surf: (x, z) => zsSurfAt(t, x, z),
    height: (x, z) => zsHeightAt(t, x, z),
    slope: (x, z) => zsSlopeDeg(t, x, z),
  };
}

/** Terra firme pra bicho/inimigo andar: dentro do mapa, acima da água e não é mar/Lagoa. */
export function zsWalkable(t: ZsTerrain, x: number, z: number): boolean {
  const b = zsBounds(t);
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  const s = zsSurfAt(t, x, z);
  if (s === ZS_SURF.sea || s === ZS_SURF.lagoon || s === ZS_SURF.out) return false;
  return zsHeightAt(t, x, z) > ZS_WATER_Y + 0.25;
}

/** MAR FUNDO pra bicho aquático (tubarão, 01/11): dentro do mapa + a faixa de mar além da borda (`ZS_SEA_BAND`), chão
 *  de MAR (não Lagoa) e fundura mínima. */
export function zsSwimmable(t: ZsTerrain, x: number, z: number, minDepth: number = ZS_SHARK_MIN_DEPTH): boolean {
  const b = zsSeaBounds(t);
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  return zsSurfAt(t, x, z) === ZS_SURF.sea && zsHeightAt(t, x, z) <= ZS_WATER_Y - minDepth;
}

/** ÁGUA NAVEGÁVEL pro navio de guerra (01/11, Pedro: "o canal do Jardim de Alah mais fundo pra passar o navio"): mar,
 *  canal e Lagoa — qualquer água com a fundura do casco (`minDepth`). Pela ALTURA (bilinear), não pelo tipo da célula
 *  mais perto: na beira do canal (célula de 4 m) a água funda vai até onde o fundo sobe de verdade. Chão abaixo da água
 *  só existe dentro d'água (a terra mais baixa do mapa fica a +0,15 m). */
export function zsNavigable(t: ZsTerrain, x: number, z: number, minDepth: number): boolean {
  const b = zsSeaBounds(t);
  if (x < b.minX || x > b.maxX || z < b.minZ || z > b.maxZ) return false;
  return zsHeightAt(t, x, z) <= ZS_WATER_Y - minDepth;
}

/** `spawnQ` (02/11): onde os acampamentos são SORTEADOS — o terreno dos sorteios (o mapa de 28/10), pra ficarem onde
 *  sempre estiveram; limites/chão/água são os do mapa de agora (`q`). */
export function zsWorldProfile(t: ZsTerrain, q: ZsQuery = zsQuery(t), spawnQ: ZsQuery = q): WorldProfile {
  return {
    id: 'zona-sul',
    bounds: q.bounds,
    spawn: { x: ZS_SAFE.x, z: ZS_SAFE.z },
    safeZone: { x: ZS_SAFE.x, z: ZS_SAFE.z, radius: ZS_SAFE.radius },
    // 8 sorteados + os TOPOS armados (Sumaré, Horto, Gávea, Rocinha — Pedro 31/10)
    camps: [...pickZsCampSites(spawnQ), ...ZS_HILLTOP_CAMPS.map((c) => ({ ...c, position: { ...c.position } }))],
    lakes: [],
    height: (x, z) => zsHeightAt(t, x, z),
    walkable: (x, z) => zsWalkable(t, x, z),
    zoneRadii: ZS_ZONE_RADII,
    // CAVERNA (30/10): o mundo embaixo do Rebouças/Jardim Botânico/Gávea
    under: zsCaveUnder(t),
    // MAR FUNDO (01/11): onde o tubarão nada; a superfície sobe e desce com a onda do surf
    water: { swimmable: (x, z) => zsSwimmable(t, x, z), surfaceY: (x, z) => zsWaterYAt(x, z) },
  };
}
