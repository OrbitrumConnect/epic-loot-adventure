// Relevo da Zona Sul: junta os tiles terrarium baixados num grid de altitude (m reais) e amostra por lat/lon.
import fs from 'node:fs';
import sharp from 'sharp';

const RAW = 'tools/zona-sul/raw/dem';
const TILE = 256;

export async function loadDem() {
  const t = JSON.parse(fs.readFileSync(`${RAW}/tiles.json`, 'utf8'));
  const nx = t.x1 - t.x0 + 1, ny = t.y1 - t.y0 + 1, W = nx * TILE, H = ny * TILE;
  const elev = new Float32Array(W * H);
  for (let x = t.x0; x <= t.x1; x++) for (let y = t.y0; y <= t.y1; y++) {
    const { data } = await sharp(`${RAW}/${t.z}_${x}_${y}.png`).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const ox = (x - t.x0) * TILE, oy = (y - t.y0) * TILE;
    for (let j = 0; j < TILE; j++) for (let i = 0; i < TILE; i++) {
      const p = (j * TILE + i) * 3;
      elev[(oy + j) * W + ox + i] = data[p] * 256 + data[p + 1] + data[p + 2] / 256 - 32768;
    }
  }
  const n = 2 ** t.z;
  // pixel global (web mercator) ↔ lat/lon
  const px = (lon) => ((lon + 180) / 360 * n - t.x0) * TILE;
  const py = (lat) => { const r = lat * Math.PI / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n - t.y0) * TILE; };
  /** Altitude (m) em lat/lon, bilinear. */
  const at = (lat, lon) => {
    const fx = px(lon) - 0.5, fy = py(lat) - 0.5;
    const x0 = Math.max(0, Math.min(W - 2, Math.floor(fx))), y0 = Math.max(0, Math.min(H - 2, Math.floor(fy)));
    const ax = Math.min(1, Math.max(0, fx - x0)), ay = Math.min(1, Math.max(0, fy - y0));
    const e = (i, j) => elev[j * W + i];
    return (e(x0, y0) * (1 - ax) + e(x0 + 1, y0) * ax) * (1 - ay) + (e(x0, y0 + 1) * (1 - ax) + e(x0 + 1, y0 + 1) * ax) * ay;
  };
  return { at, W, H };
}
