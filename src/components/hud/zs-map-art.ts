/**
 * MAPA DESENHADO da Zona Sul (05/11). O `terrain.png` é DADO (altura em cm nos canais R/G, superfície no B) — mostrado cru
 * na tela fica um verde-neon que não se lê. Aqui ele vira um mapa de verdade, 1 vez por sessão (~300 mil pixels, uma
 * passada): mar azul (mais escuro no fundo), lagoa, areia, rua, mata e morro com relevo sombreado (luz do noroeste),
 * pedra lá no alto. Usado na tela de renascer (zs-respawn-screen). Cores em `paintZsMap` (pura, testável).
 */
import { ZS_SURF } from '@/components/zona-sul/zona-sul-meta';
import { loadZsTerrain, type ZsTerrain } from '@/components/zona-sul/zs-terrain-data';

type RGB = [number, number, number];
const mix = (a: RGB, b: RGB, k: number): RGB => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const SEA_SHALLOW: RGB = [74, 150, 186], SEA_DEEP: RGB = [18, 58, 96], LAGOON: RGB = [80, 160, 182];
const SAND: RGB = [226, 207, 152], ROAD: RGB = [150, 146, 136];
const GRASS: RGB = [124, 154, 82], FOREST_LO: RGB = [62, 108, 52], FOREST_HI: RGB = [44, 82, 40], ROCK: RGB = [138, 128, 112], PEAK: RGB = [176, 168, 152];

/** Cor de uma célula: superfície + altura (m) + sombra do relevo (1 = plano; < 1 contra a luz, > 1 de frente pra ela). */
export function zsMapColor(surf: number, h: number, shade: number): RGB {
  if (surf === ZS_SURF.sea || surf === ZS_SURF.out) return mix(SEA_SHALLOW, SEA_DEEP, clamp01(-h / 30));
  if (surf === ZS_SURF.lagoon) return LAGOON;
  let c: RGB;
  if (surf === ZS_SURF.beach) c = SAND;
  else if (surf === ZS_SURF.road) c = ROAD;
  else if (surf === ZS_SURF.forest) c = mix(FOREST_LO, FOREST_HI, clamp01(h / 500));
  else c = h < 120 ? mix(GRASS, FOREST_LO, clamp01(h / 120)) : h < 450 ? mix(FOREST_LO, ROCK, clamp01((h - 300) / 150)) : mix(ROCK, PEAK, clamp01((h - 450) / 400));
  return [Math.min(255, c[0] * shade), Math.min(255, c[1] * shade), Math.min(255, c[2] * shade)];
}

/** Pinta o terreno inteiro em `out` (RGBA, w×h do terreno — 1 pixel por célula). Pura. */
export function paintZsMap(t: ZsTerrain, out: Uint8ClampedArray): void {
  const { w, h, heights: H, surf: S } = t;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const p = j * w + i;
      // relevo: inclinação pelos vizinhos (luz do noroeste → encosta virada pra lá clareia). Sobe pro sudeste (dx, dz > 0)
      // = a encosta olha pro noroeste = de frente pra luz
      const dx = H[j * w + Math.min(w - 1, i + 1)]! - H[j * w + Math.max(0, i - 1)]!;
      const dz = H[Math.min(h - 1, j + 1) * w + i]! - H[Math.max(0, j - 1) * w + i]!;
      const shade = Math.max(0.55, Math.min(1.35, 1 + (dx + dz) * 0.012));
      const c = zsMapColor(S[p]!, H[p]!, shade);
      out[p * 4] = c[0]; out[p * 4 + 1] = c[1]; out[p * 4 + 2] = c[2]; out[p * 4 + 3] = 255;
    }
  }
}

let art: Promise<string> | null = null;
/** URL da imagem do mapa (calcula 1 vez; o terreno vem do cache do navegador — o mundo já baixou). */
export function zsMapArtUrl(): Promise<string> {
  art ??= loadZsTerrain().then((t) => {
    const cv = document.createElement('canvas');
    cv.width = t.w; cv.height = t.h;
    const ctx = cv.getContext('2d');
    if (!ctx) throw new Error('sem canvas 2d');
    const img = ctx.createImageData(t.w, t.h);
    paintZsMap(t, img.data);
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }).catch((e) => { art = null; throw e; });
  return art;
}
