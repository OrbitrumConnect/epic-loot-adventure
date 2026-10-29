/**
 * ZONA SUL — dados do terreno (gerados por tools/zona-sul/bake.mjs em /zona-sul/terrain.png).
 * Mapa de ALTURA em grade (célula de 4 m): a altura em qualquer ponto é uma conta (bilinear) — sem raio, sem malha
 * de colisão. Superfície por célula: terra / mar / lagoa / praia / mata. Coordenadas: x = leste, z = SUL, origem no
 * centro. Água (mar e Lagoa) no nível 0.
 */
import { ZS_SURF, ZS_TERRAIN } from './zona-sul-meta';

export const ZS_WATER_Y = 0;

/** Altura EXTRA da água num ponto (ondas do surf). Sem surf: 0 — o mar é exatamente o de antes. */
let waterExtra: ((x: number, z: number, yRef: number) => number) | null = null;
export function setZsWaterExtra(fn: ((x: number, z: number, yRef: number) => number) | null): void { waterExtra = fn; }
/**
 * Nível da água em (x, z): ZS_WATER_Y + onda (se houver). Sem `yRef`: o topo (por cima do tubo). Com `yRef` (altura de
 * quem está ali): dentro da cavidade do tubo vale o chão dele — dá pra entrar no tubo.
 */
export function zsWaterYAt(x: number, z: number, yRef = Infinity): number { return ZS_WATER_Y + (waterExtra ? waterExtra(x, z, yRef - ZS_WATER_Y) : 0); }

/** Correnteza da onda (m/s no mundo) em (x, z), escrita em `out`. Sem surf: nenhuma. */
let waterPush: ((x: number, z: number, out: { x: number; z: number }, yRef: number) => boolean) | null = null;
export function setZsWaterPush(fn: ((x: number, z: number, out: { x: number; z: number }, yRef: number) => boolean) | null): void { waterPush = fn; }
/** Está DENTRO do tubo da onda em (x, z) na altura yRef? Sem surf: não. */
let waterTube: ((x: number, z: number, yRef: number) => boolean) | null = null;
export function setZsWaterTube(fn: ((x: number, z: number, yRef: number) => boolean) | null): void { waterTube = fn; }
export function zsWaterInTubeAt(x: number, z: number, yRef: number): boolean { return waterTube ? waterTube(x, z, yRef - ZS_WATER_Y) : false; }

/** BAFORADA do tubo em (x, z) na altura yRef: aceleração (m/s²) no mundo, escrita em `out`. Sem surf: nenhuma. */
let waterSpit: ((x: number, z: number, yRef: number, out: { x: number; z: number }) => boolean) | null = null;
export function setZsWaterSpit(fn: ((x: number, z: number, yRef: number, out: { x: number; z: number }) => boolean) | null): void { waterSpit = fn; }
export function zsWaterSpitAt(x: number, z: number, yRef: number, out: { x: number; z: number }): boolean { return waterSpit ? waterSpit(x, z, yRef - ZS_WATER_Y, out) : false; }

/** Espuma da onda batendo em (x, z), 0..1 (quem está ali toma a "vaca"). Sem surf: 0. */
let waterChurn: ((x: number, z: number) => number) | null = null;
export function setZsWaterChurn(fn: ((x: number, z: number) => number) | null): void { waterChurn = fn; }
export function zsWaterChurnAt(x: number, z: number): number { return waterChurn ? waterChurn(x, z) : 0; }

/** true se a água empurra em (x, z) (velocidade em `out`). `yRef` = altura de quem boia (dentro do tubo é outra água). */
export function zsWaterPushAt(x: number, z: number, out: { x: number; z: number }, yRef = Infinity): boolean { return waterPush ? waterPush(x, z, out, yRef - ZS_WATER_Y) : false; }

export type ZsTerrain = {
  w: number; h: number; cell: number;
  /** canto noroeste (centro da 1ª célula) em coordenadas do jogo */
  x0: number; z0: number;
  heights: Float32Array;
  surf: Uint8Array;
};

/** Decodifica o RGBA do PNG: R/G = altura em cm (+ deslocamento), B = superfície. Puro (testável). */
export function decodeTerrain(rgba: Uint8ClampedArray | Uint8Array, w: number, h: number, cell = ZS_TERRAIN.cell, offset = ZS_TERRAIN.offset): ZsTerrain {
  const heights = new Float32Array(w * h), surf = new Uint8Array(w * h);
  for (let p = 0; p < w * h; p++) {
    heights[p] = ((rgba[p * 4]! << 8) + rgba[p * 4 + 1]!) / 100 - offset;
    surf[p] = rgba[p * 4 + 2]!;
  }
  return { w, h, cell, x0: (0.5 - w / 2) * cell, z0: (0.5 - h / 2) * cell, heights, surf };
}

/** Baixa e decodifica (sem conversão de cor nem pré-multiplicação: os bytes são DADOS, não imagem). */
export async function loadZsTerrain(): Promise<ZsTerrain> {
  const blob = await (await fetch(ZS_TERRAIN.url)).blob();
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const cv = document.createElement('canvas');
  cv.width = bmp.width; cv.height = bmp.height;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('sem canvas 2d');
  ctx.drawImage(bmp, 0, 0);
  return decodeTerrain(ctx.getImageData(0, 0, bmp.width, bmp.height).data, bmp.width, bmp.height);
}

/** Altura do chão em (x, z) — bilinear entre os centros das células. Fora do mapa: borda. */
export function zsHeightAt(t: ZsTerrain, x: number, z: number): number {
  const fx = Math.max(0, Math.min(t.w - 1.001, (x - t.x0) / t.cell));
  const fz = Math.max(0, Math.min(t.h - 1.001, (z - t.z0) / t.cell));
  const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j;
  const p = j * t.w + i, H = t.heights;
  return (H[p]! * (1 - ax) + H[p + 1]! * ax) * (1 - az) + (H[p + t.w]! * (1 - ax) + H[p + t.w + 1]! * ax) * az;
}

/** Superfície da célula em (x, z) (ZS_SURF). */
export function zsSurfAt(t: ZsTerrain, x: number, z: number): number {
  const i = Math.round((x - t.x0) / t.cell), j = Math.round((z - t.z0) / t.cell);
  if (i < 0 || j < 0 || i >= t.w || j >= t.h) return ZS_SURF.sea;
  return t.surf[j * t.w + i]!;
}

/** Limites andáveis (meia célula pra dentro da borda). */
export function zsBounds(t: ZsTerrain) {
  return { minX: t.x0, maxX: t.x0 + (t.w - 1) * t.cell, minZ: t.z0, maxZ: t.z0 + (t.h - 1) * t.cell };
}

/** Inclinação (graus) em (x, z), pela diferença central. */
export function zsSlopeDeg(t: ZsTerrain, x: number, z: number): number {
  const d = t.cell;
  const gx = (zsHeightAt(t, x + d, z) - zsHeightAt(t, x - d, z)) / (2 * d);
  const gz = (zsHeightAt(t, x, z + d) - zsHeightAt(t, x, z - d)) / (2 * d);
  return Math.atan(Math.hypot(gx, gz)) * 180 / Math.PI;
}

/** Hash determinístico 2D → [0, 1) (vegetação, cor). */
export function zsHash(x: number, z: number, k = 0): number {
  let h = Math.imul((x | 0) ^ 0x27d4eb2d, 0x165667b1) ^ Math.imul((z | 0) + k * 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
