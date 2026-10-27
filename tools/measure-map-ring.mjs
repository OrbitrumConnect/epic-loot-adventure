// Mede o chão do mapa GLB (27/10, Pedro: "dá pra aumentar a área jogável?"). Só LÊ — não muda o jogo.
// Raio de cima pra baixo a cada metro (mesmo transform do map-floor.tsx) → altura, buraco, inclinação.
// Uso: node tools/measure-map-ring.mjs <saida.png> [alturas.json]
import fs from 'node:fs';
import sharp from 'sharp';
import { loadMapGround } from './map-glb.mjs';

const [outPng, outJson] = process.argv.slice(2);
const { box: wb, heightAt } = loadMapGround();

const X0 = Math.floor(wb.min.x), X1 = Math.ceil(wb.max.x), Z0 = Math.floor(wb.min.z), Z1 = Math.ceil(wb.max.z);
const W = X1 - X0 + 1, H = Z1 - Z0 + 1;
const hgt = new Float32Array(W * H).fill(NaN);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const y = heightAt(X0 + i, Z0 + j);
  if (y !== null) hgt[j * W + i] = y;
}
const at = (i, j) => (i < 0 || j < 0 || i >= W || j >= H ? NaN : hgt[j * W + i]);
const slopeDeg = (i, j) => {
  const h = at(i, j); let m = 0;
  for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const n = at(i + di, j + dj); if (!Number.isNaN(n)) m = Math.max(m, Math.abs(n - h)); }
  return Math.atan(m) * 180 / Math.PI;
};
const LOW_Y = -2.35; // nível da água do mapa (game-world MAP_WATER_Y); fora do plano da água = vala seca
const EDGE = 6;      // beirada do bloco (saia lateral)
const kindAt = (i, j) => {
  const h = at(i, j);
  if (Number.isNaN(h)) return 'buraco';
  const x = X0 + i, z = Z0 + j;
  if (x < wb.min.x + EDGE || x > wb.max.x - EDGE || z < wb.min.z + EDGE || z > wb.max.z - EDGE) return 'beirada';
  const s = slopeDeg(i, j);
  if (s > 45) return 'penhasco';
  if (s > 30) return 'ingreme';
  if (h <= LOW_Y) return 'vala';
  return 'ok';
};
const stats = (pred) => {
  const c = { ok: 0, ingreme: 0, penhasco: 0, vala: 0, buraco: 0, beirada: 0, foraDoGlb: 0 }; let n = 0, hmin = Infinity, hmax = -Infinity;
  for (let z = -200; z <= 200; z++) for (let x = -200; x <= 200; x++) {
    if (!pred(x, z)) continue; n++;
    const i = x - X0, j = z - Z0;
    if (i < 0 || j < 0 || i >= W || j >= H) { c.foraDoGlb++; continue; }
    const k = kindAt(i, j); c[k]++;
    const h = at(i, j); if (!Number.isNaN(h)) { hmin = Math.min(hmin, h); hmax = Math.max(hmax, h); }
  }
  const pct = Object.fromEntries(Object.entries(c).map(([k, v]) => [k, +(100 * v / Math.max(1, n)).toFixed(1)]));
  return { m2: n, pct, alturaMin: +hmin.toFixed(1), alturaMax: +hmax.toFixed(1) };
};
const cheb = (x, z) => Math.max(Math.abs(x), Math.abs(z));
const report = {
  glb: { x: [+wb.min.x.toFixed(1), +wb.max.x.toFixed(1)], z: [+wb.min.z.toFixed(1), +wb.max.z.toFixed(1)], y: [+wb.min.y.toFixed(1), +wb.max.y.toFixed(1)] },
  atual_90: stats((x, z) => cheb(x, z) <= 90),
  anel: {},
  lados_90a125: {
    norte_zMais: stats((x, z) => z > 90 && z <= 125 && Math.abs(x) <= 125),
    sul_zMenos: stats((x, z) => z < -90 && z >= -125 && Math.abs(x) <= 125),
    leste_xMais: stats((x, z) => x > 90 && x <= 125 && Math.abs(z) <= 90),
    oeste_xMenos: stats((x, z) => x < -90 && x >= -125 && Math.abs(z) <= 90),
  },
  norte_alem_125: stats((x, z) => z > 125 && z <= 185 && Math.abs(x) <= 125),
};
for (const L of [100, 110, 120, 125, 130]) report.anel[`90a${L}`] = stats((x, z) => cheb(x, z) > 90 && cheb(x, z) <= L);
console.log(JSON.stringify(report, null, 1));

// Imagem de cima: 3 px por metro. Norte (z+) pra cima.
const PX = 3, IW = W * PX, IH = H * PX;
const img = Buffer.alloc(IW * IH * 3);
const col = { buraco: [230, 40, 200], beirada: [70, 70, 70], penhasco: [210, 60, 40], ingreme: [235, 180, 50], vala: [70, 110, 170] };
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const k = kindAt(i, j); const h = at(i, j);
  let c = col[k];
  if (!c) { const t = Math.max(0, Math.min(1, (h + 3) / 14)); c = [Math.round(40 + 90 * t), Math.round(110 + 110 * t), Math.round(40 + 60 * t)]; }
  const x = X0 + i, z = Z0 + j, ch = cheb(x, z);
  if (Math.abs(ch - 90) < 0.6) c = [255, 255, 255];
  if (Math.abs(ch - 125) < 0.6) c = [40, 230, 255];
  if (Math.hypot(x, z) < 2) c = [255, 255, 0];
  for (let dy = 0; dy < PX; dy++) for (let dx = 0; dx < PX; dx++) {
    const py = (H - 1 - j) * PX + dy, px = i * PX + dx; const p = (py * IW + px) * 3;
    img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2];
  }
}
await sharp(img, { raw: { width: IW, height: IH, channels: 3 } }).png().toFile(outPng);
if (outJson) fs.writeFileSync(outJson, JSON.stringify({ X0, Z0, W, H, h: Array.from(hgt, (v) => (Number.isNaN(v) ? null : +v.toFixed(2))) }));
console.log('imagem', outPng, IW + 'x' + IH);
