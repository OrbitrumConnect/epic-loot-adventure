// Compara o relevo com os picos do OpenStreetMap que têm nome e altitude (ele): maior altitude num raio de 120 m.
import fs from 'node:fs';
import { BBOX } from './zona-sul-config.mjs';
import { loadDem } from './dem.mjs';
const { at } = await loadDem();
const M_LAT = 110574, M_LON = 111320 * Math.cos((BBOX.s + BBOX.n) / 2 * Math.PI / 180);
const peaks = JSON.parse(fs.readFileSync('tools/zona-sul/raw/osm.json', 'utf8')).elements
  .filter((e) => e.type === 'node' && e.tags?.natural === 'peak' && e.tags.ele && e.tags.name)
  .map((e) => ({ nome: e.tags.name, lat: e.lat, lon: e.lon, ele: parseFloat(e.tags.ele) }))
  .filter((p) => p.ele >= 150).sort((a, b) => b.ele - a.ele);
const errs = [];
for (const p of peaks) {
  let best = -Infinity;
  for (let dy = -120; dy <= 120; dy += 10) for (let dx = -120; dx <= 120; dx += 10) if (dx * dx + dy * dy <= 14400) best = Math.max(best, at(p.lat + dy / M_LAT, p.lon + dx / M_LON));
  errs.push(best / p.ele - 1);
  console.log(`${p.nome.slice(0, 28).padEnd(28)} ${String(p.ele).padStart(5)} m · relevo ${best.toFixed(0).padStart(4)} m (${((best / p.ele - 1) * 100).toFixed(0)}%)`);
}
errs.sort((a, b) => a - b);
console.log(`${errs.length} picos ≥150 m · erro mediano ${(errs[errs.length >> 1] * 100).toFixed(0)}%`);
