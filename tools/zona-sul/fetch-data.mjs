// ZONA SUL (RJ) — baixa os DADOS ABERTOS da área (Pedro 28/10: Cristo, Lagoa, Ipanema, Copa, Arpoador, Jardim
// Botânico, Gávea, Humaitá até a descida de Botafogo; a oeste um pouco depois da Pedra da Gávea, sem Barra).
//  - Relevo: AWS Terrain Tiles "terrarium" z14 (aberto; origem SRTM etc.) → tools/zona-sul/raw/dem/*.png
//  - Mapa: OpenStreetMap via Overpass (ODbL — crédito "© OpenStreetMap contributors") → raw/osm.json
//    (costa, água/Lagoa, mata/parque, ruas principais e alguns marcos — só o que vira terreno/vegetação/ruína)
// Só baixa; não mexe no jogo. Uso: node tools/zona-sul/fetch-data.mjs
import fs from 'node:fs';
import { BBOX, DEM_Z } from './zona-sul-config.mjs';

const RAW = 'tools/zona-sul/raw';
fs.mkdirSync(`${RAW}/dem`, { recursive: true });
const UA = { 'User-Agent': 'TRIBOS-zona-sul/1.0 (jogo indie; dados abertos)' };

const tx = (lon) => Math.floor((lon + 180) / 360 * 2 ** DEM_Z);
const ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** DEM_Z); };
const X0 = tx(BBOX.w), X1 = tx(BBOX.e), Y0 = ty(BBOX.n), Y1 = ty(BBOX.s);
let ok = 0, skip = 0;
for (let x = X0; x <= X1; x++) for (let y = Y0; y <= Y1; y++) {
  const f = `${RAW}/dem/${DEM_Z}_${x}_${y}.png`;
  if (fs.existsSync(f) && fs.statSync(f).size > 1000) { skip++; continue; }
  const r = await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_Z}/${x}/${y}.png`, { headers: UA });
  if (!r.ok) throw new Error(`relevo ${x}/${y}: ${r.status}`);
  fs.writeFileSync(f, Buffer.from(await r.arrayBuffer())); ok++;
}
fs.writeFileSync(`${RAW}/dem/tiles.json`, JSON.stringify({ z: DEM_Z, x0: X0, x1: X1, y0: Y0, y1: Y1 }));
console.log(`relevo: ${ok} baixados, ${skip} já tinha (${(X1 - X0 + 1) * (Y1 - Y0 + 1)} tiles z${DEM_Z})`);

const b = `${BBOX.s},${BBOX.w},${BBOX.n},${BBOX.e}`;
const q = `[out:json][timeout:120];(
  way["natural"="coastline"](${b});
  way["natural"="water"](${b}); relation["natural"="water"](${b});
  way["landuse"~"forest|grass|meadow"](${b}); relation["landuse"="forest"](${b});
  way["natural"~"wood|scrub|bare_rock|cliff|beach|sand"](${b}); relation["natural"~"wood|bare_rock"](${b});
  way["leisure"~"park|nature_reserve"](${b}); relation["leisure"~"park|nature_reserve"](${b});
  way["highway"~"motorway|trunk|primary|secondary"](${b});
  node["natural"="peak"](${b});
  node["tourism"~"attraction|viewpoint"](${b});
);out geom;`;
const osmFile = `${RAW}/osm.json`;
if (fs.existsSync(osmFile) && fs.statSync(osmFile).size > 10000) console.log('mapa: já tinha raw/osm.json');
else {
  let done = false;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (!r.ok) { console.log(`mapa: ${new URL(url).host} ${r.status}`); continue; }
      const txt = await r.text();
      if (!txt.trimStart().startsWith('{')) { console.log(`mapa: ${new URL(url).host} não devolveu JSON`); continue; }
      fs.writeFileSync(osmFile, txt); done = true; break;
    } catch (e) { console.log(`mapa: ${new URL(url).host} ${e.message}`); }
  }
  if (!done) throw new Error('OpenStreetMap: nenhum servidor respondeu');
  const els = JSON.parse(fs.readFileSync(osmFile, 'utf8')).elements;
  const count = (k, v) => els.filter((e) => e.tags?.[k] && (!v || v.test(e.tags[k]))).length;
  console.log(`mapa: ${els.length} elementos · costa ${count('natural', /coastline/)} · água ${count('natural', /water/)} · mata ${count('landuse', /forest/) + count('natural', /wood/)} · ruas ${count('highway')} · picos ${count('natural', /peak/)}`);
}
