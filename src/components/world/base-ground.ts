import { BASE_GRID } from '@/game/types/playerbase';
import { glbSurfaceY } from './terrain-collision';
import { terrainHeight } from './world-kit';

/**
 * Altura do CHÃO REAL (malha GLB do mapa) sob uma peça da base: o MAIS BAIXO entre o centro e os
 * 4 cantos da célula, um tico abaixo — assim muro/torre/porta encostam no chão em todos os lados
 * (no lado mais alto entram um pouco na terra, invisível). Antes usava o relevo procedural antigo
 * (`terrainHeight`) e, em terreno inclinado do GLB, as peças ficavam no ar (Pedro, 22/10).
 */
export function pieceGroundY(x: number, z: number): number {
  const h = BASE_GRID * 0.45;
  let min = Infinity;
  for (const [dx, dz] of [[0, 0], [h, h], [h, -h], [-h, h], [-h, -h]] as const) {
    min = Math.min(min, glbSurfaceY(x + dx, z + dz, terrainHeight(x + dx, z + dz)));
  }
  return min - 0.05;
}
