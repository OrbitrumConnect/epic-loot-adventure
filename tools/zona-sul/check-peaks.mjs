// Confere o relevo baixado contra picos conhecidos (maior altitude num raio de 250 m do ponto) + resumo da área.
import { BBOX, PEAKS, SCALE, RELIEF } from './zona-sul-config.mjs';
import { loadDem } from './dem.mjs';

const { at } = await loadDem();
const M_LAT = 110574, M_LON = 111320 * Math.cos((BBOX.s + BBOX.n) / 2 * Math.PI / 180);
for (const p of PEAKS) {
  let best = -Infinity;
  for (let dy = -250; dy <= 250; dy += 10) for (let dx = -250; dx <= 250; dx += 10) {
    if (dx * dx + dy * dy > 250 * 250) continue;
    best = Math.max(best, at(p.lat + dy / M_LAT, p.lon + dx / M_LON));
  }
  console.log(`${p.nome.padEnd(20)} oficial ${String(p.alt).padStart(4)} m · relevo ${best.toFixed(0).padStart(4)} m (${((best / p.alt - 1) * 100).toFixed(0)}%) · no jogo ${(best / SCALE * RELIEF).toFixed(0)} m`);
}
const w = (BBOX.e - BBOX.w) * M_LON, h = (BBOX.n - BBOX.s) * M_LAT;
console.log(`área real ${(w / 1000).toFixed(1)} × ${(h / 1000).toFixed(1)} km → no jogo ${(w / SCALE / 1000).toFixed(2)} × ${(h / SCALE / 1000).toFixed(2)} km · atravessar correndo ${(w / SCALE / 4.32 / 60).toFixed(0)} min`);
