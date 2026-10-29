/**
 * PERFIL DA ZONA SUL a partir do terreno (29/10): o que as regras do jogo precisam saber do mapa — chão, terra firme,
 * limites, nascedouro/zona segura (praia do Arpoador), faixas de perigo e os acampamentos na mata.
 * Puro (recebe o terreno decodificado): o mundo 3D usa ao carregar; os testes usam com o PNG de verdade.
 */
import type { WorldProfile } from '@/game/data/world-profile';
import { pickZsCampSites, ZS_SAFE, ZS_ZONE_RADII, type ZsQuery } from '@/game/systems/zsSpawnSystem';
import { type ZsTerrain, zsBounds, zsHeightAt, zsSlopeDeg, zsSurfAt, ZS_WATER_Y } from './zs-terrain-data';
import { ZS_SURF } from './zona-sul-meta';

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
    camps: pickZsCampSites(q),
    lakes: [],
    height: (x, z) => zsHeightAt(t, x, z),
    walkable: (x, z) => zsWalkable(t, x, z),
    zoneRadii: ZS_ZONE_RADII,
  };
}
