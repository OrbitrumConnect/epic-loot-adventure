// Vista de cima da Zona Sul (conferência): relevo sombreado + mar (relevo ≤ 0) + água do OSM (Lagoa) + mata/parque
// + picos. 1 px = 4 m no jogo. Uso: node tools/zona-sul/preview.mjs <saida.png>
import fs from 'node:fs';
import sharp from 'sharp';
import { BBOX, SCALE } from './zona-sul-config.mjs';
import { loadDem } from './dem.mjs';
import { buildMasks } from './masks.mjs';

const [out] = process.argv.slice(2);
const { at } = await loadDem();
const M_LAT = 110574, M_LON = 111320 * Math.cos((BBOX.s + BBOX.n) / 2 * Math.PI / 180);
const PXM = 4 * SCALE; // metros reais por pixel
const W = Math.round((BBOX.e - BBOX.w) * M_LON / PXM), H = Math.round((BBOX.n - BBOX.s) * M_LAT / PXM);
const latOf = (j) => BBOX.n - (j + 0.5) * PXM / M_LAT, lonOf = (i) => BBOX.w + (i + 0.5) * PXM / M_LON;
const toPx = (lat, lon) => [(lon - BBOX.w) * M_LON / PXM, (BBOX.n - lat) * M_LAT / PXM];

const e = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) e[j * W + i] = at(latOf(j), lonOf(i));

const { sea, water, forest } = buildMasks(W, H, toPx);
const osm = JSON.parse(fs.readFileSync('tools/zona-sul/raw/osm.json', 'utf8')).elements;

const img = Buffer.alloc(W * H * 3);
const gameM = PXM / SCALE;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = j * W + i, h = e[k];
  // sombreado (sol do noroeste)
  const dx = (e[j * W + Math.min(W - 1, i + 1)] - e[j * W + Math.max(0, i - 1)]) / (2 * PXM);
  const dz = (e[Math.min(H - 1, j + 1) * W + i] - e[Math.max(0, j - 1) * W + i]) / (2 * PXM);
  const shade = Math.max(0.25, Math.min(1.15, 0.85 - (dx * 0.7 - dz * 0.7) * 2.2));
  const slope = Math.atan(Math.hypot(dx, dz)) * 180 / Math.PI;
  let c;
  if (sea[k]) c = [40, 90, 140];                         // mar (linha da costa do OSM)
  else if (water[k]) c = [60, 120, 165];                 // Lagoa / água
  else if (slope > 38) c = [150, 145, 135];              // paredão de granito
  else if (forest[k] || h > 60) c = [70, 120, 60];       // mata
  else c = [175, 165, 120];                              // baixada (vai virar matagal/ruína)
  img[k * 3] = Math.min(255, c[0] * shade); img[k * 3 + 1] = Math.min(255, c[1] * shade); img[k * 3 + 2] = Math.min(255, c[2] * shade);
}
// picos (≥ 400 m) em amarelo
for (const el of osm) if (el.type === 'node' && el.tags?.natural === 'peak' && parseFloat(el.tags.ele) >= 400) {
  const [x, y] = toPx(el.lat, el.lon);
  for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) { const ii = Math.round(x) + a, jj = Math.round(y) + b; if (ii >= 0 && jj >= 0 && ii < W && jj < H) img.set([255, 220, 0], (jj * W + ii) * 3); }
}
await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(out);
console.log(`vista ${W}x${H} px (1 px = ${gameM} m no jogo) · mar ${(100 * sea.reduce((a, b) => a + b, 0) / sea.length).toFixed(0)}% · água OSM ${water.reduce((a, b) => a + b, 0)} px · mata OSM ${forest.reduce((a, b) => a + b, 0)} px`);
