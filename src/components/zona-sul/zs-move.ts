/**
 * ZONA SUL — passo do herói (puro, testável): anda no chão do mapa de altura, PAREDÃO íngreme é parede (desliza),
 * água funda = NADA (corpo afundado até o peito, mais lento, sem correr/pular), raso = vadeia. Limite do mapa.
 */
import { ZS_SURF } from './zona-sul-meta';
import { type ZsTerrain, zsBounds, zsHeightAt, zsSurfAt, ZS_WATER_Y } from './zs-terrain-data';

export const ZS_WALK = 1.8;          // m/s (igual ao jogo)
export const ZS_RUN = 4.32;          // m/s (igual ao jogo)
export const ZS_SWIM_K = 0.55;       // (antigo) nadando: 55% da velocidade de andar — trocado pelo nado com embalo abaixo
/** NADO (Pedro 28/10: "afundei e fiquei lento demais; Shift nada mais rápido; não agarrar tanto na água, mais fluido"):
 *  velocidade própria com EMBALO (acelera/freia suave, desliza ao soltar), mais rápido que andar; Shift = braçada forte. */
export const ZS_SWIM = 2.4, ZS_SWIM_FAST = 4.2, ZS_SWIM_GLIDE = 2.2;
export const ZS_SWIM_DEPTH = 1.2;    // água mais funda que isso = nada
export const ZS_SWIM_SINK = 0.35;    // BOIANDO parado (em pé na água): o pé fica isto abaixo da superfície (cabeça e ombros pra fora — conferido na foto)
export const ZS_SWIM_SINK_MOVE = 0.1;  // NADANDO (corpo deitado na braçada): rente à superfície — 0,55 ainda afundava (foto)
/** Subida máxima por metro andado (1 = 45°). Mais íngreme = paredão de pedra: não sobe, desliza. */
export const ZS_MAX_CLIMB = 1.0;
const EDGE = 6;

export type ZsMoveResult = { x: number; z: number; ground: number; swimming: boolean; wading: boolean };

export function zsWaterState(ground: number): { swimming: boolean; wading: boolean } {
  const depth = ZS_WATER_Y - ground;
  return { swimming: depth > ZS_SWIM_DEPTH, wading: depth > 0.05 && depth <= ZS_SWIM_DEPTH };
}

/** Passo de (x, z) por (dx, dz): parede íngreme desliza no eixo livre; borda do mapa segura. */
export function zsStep(t: ZsTerrain, x: number, z: number, dx: number, dz: number): ZsMoveResult {
  const b = zsBounds(t);
  const clampX = (v: number) => Math.max(b.minX + EDGE, Math.min(b.maxX - EDGE, v));
  const clampZ = (v: number) => Math.max(b.minZ + EDGE, Math.min(b.maxZ - EDGE, v));
  const g0 = zsHeightAt(t, x, z);
  const ok = (nx: number, nz: number) => {
    if (zsSurfAt(t, nx, nz) === ZS_SURF.out && zsSurfAt(t, x, z) !== ZS_SURF.out) return false; // fora da área jogável
    const run = Math.hypot(nx - x, nz - z);
    if (run < 1e-6) return true;
    const rise = zsHeightAt(t, nx, nz) - g0;
    // nadando dá pra encostar em qualquer margem; paredão só conta acima d'água
    return rise <= 0.05 || rise / run <= ZS_MAX_CLIMB || zsHeightAt(t, nx, nz) < ZS_WATER_Y;
  };
  let nx = clampX(x + dx), nz = clampZ(z + dz);
  if (!ok(nx, nz)) {
    if (ok(nx, z)) nz = z;
    else if (ok(x, nz)) nx = x;
    else { nx = x; nz = z; }
  }
  const ground = zsHeightAt(t, nx, nz);
  return { x: nx, z: nz, ground, ...zsWaterState(ground) };
}
