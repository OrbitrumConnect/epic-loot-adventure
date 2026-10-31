/**
 * PERFIL DA ZONA SUL a partir do terreno (29/10): o que as regras do jogo precisam saber do mapa — chão, terra firme,
 * limites, nascedouro/zona segura (praia do Arpoador), faixas de perigo e os acampamentos na mata.
 * Puro (recebe o terreno decodificado): o mundo 3D usa ao carregar; os testes usam com o PNG de verdade.
 */
import type { WorldProfile } from '@/game/data/world-profile';
import { CREATURES, scaleEnemyHp } from '@/game/data/creatures';
import type { CreatureState } from '@/game/types';
import { pickZsCampSites, ZS_HILLTOP_CAMPS, ZS_SAFE, ZS_ZONE_RADII, type ZsQuery } from '@/game/systems/zsSpawnSystem';
import { type ZsTerrain, zsBounds, zsHeightAt, zsSlopeDeg, zsSurfAt, ZS_WATER_Y } from './zs-terrain-data';
import { ZS_SURF } from './zona-sul-meta';
import { CAVE_BOSS, caveEnemySpots, zsCaveUnder } from './zs-cave';

/** Os BICHOS da caverna (31/10): Fauce de Sílex e Aberração nos salões — mesmo formato da fauna (`wild_cave_*` → força
 *  pela região e renascer iguais aos da mata); nascem no chão da caverna (`homeY`). Precisa do chão ligado (zsCaveUnder). */
export function createCaveCreatures(): CreatureState[] {
  const out: CreatureState[] = [];
  for (const s of caveEnemySpots()) {
    const def = CREATURES[s.speciesId];
    if (!def) continue;
    const hp = scaleEnemyHp(def.maxHp);
    out.push({
      id: s.id, speciesId: def.id, name: def.name, hp, maxHp: hp, attackPower: def.attackPower, armor: def.armor,
      attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: s.x, z: s.z }, behavior: 'patrol', lootTable: [], respawnAt: null,
    });
  }
  const boss = createCaveBoss();
  if (boss) out.push(boss);
  return out;
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

export function zsWorldProfile(t: ZsTerrain, q: ZsQuery = zsQuery(t)): WorldProfile {
  return {
    id: 'zona-sul',
    bounds: q.bounds,
    spawn: { x: ZS_SAFE.x, z: ZS_SAFE.z },
    safeZone: { x: ZS_SAFE.x, z: ZS_SAFE.z, radius: ZS_SAFE.radius },
    // 8 sorteados + os TOPOS armados (Sumaré, Horto, Gávea, Rocinha — Pedro 31/10)
    camps: [...pickZsCampSites(q), ...ZS_HILLTOP_CAMPS.map((c) => ({ ...c, position: { ...c.position } }))],
    lakes: [],
    height: (x, z) => zsHeightAt(t, x, z),
    walkable: (x, z) => zsWalkable(t, x, z),
    zoneRadii: ZS_ZONE_RADII,
    // CAVERNA (30/10): o mundo embaixo do Rebouças/Jardim Botânico/Gávea
    under: zsCaveUnder(t),
  };
}
