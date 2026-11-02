// ZONA SUL — dados da EXPANSÃO (02/11, Pedro: "abrir até a Pedra da Gávea e fazer aparecer as Ilhas Cagarras, sem
// quebrar nada que temos"). Baixa o relevo que falta (tiles AWS terrarium, só os novos) e o OSM do recorte NOVO, e junta
// no raw/osm.json SEM mexer no que já existe:
//  - o osm.json de 28/10 vira raw/osm-v1.json (fica guardado; é a base);
//  - do OSM novo entra SÓ o que (a) não está no v1 e (b) não encosta no recorte antigo — assim nada dentro do mapa de
//    antes muda (nem uma edição do OSM feita depois de 28/10). O que cruza a borda já estava no v1 com a forma inteira.
// Uso: node tools/zona-sul/expand-data.mjs
import fs from 'node:fs';
import { BBOX_V1, DEM_Z, EXPAND_TO } from './zona-sul-config.mjs';

const RAW = 'tools/zona-sul/raw';
const UA = { 'User-Agent': 'TRIBOS-zona-sul/1.0 (jogo indie; dados abertos)' };
const B = { s: EXPAND_TO.s, w: EXPAND_TO.w, n: BBOX_V1.n, e: BBOX_V1.e };

// ---- relevo: os tiles que faltam (os que já existem ficam)
const tx = (lon) => Math.floor((lon + 180) / 360 * 2 ** DEM_Z);
const ty = (lat) => { const r = lat * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * 2 ** DEM_Z); };
// 1 tile de folga no oeste/sul (a amostra bilinear da borda nova não pode cair fora do relevo)
const X0 = tx(B.w) - 1, X1 = tx(B.e), Y0 = ty(B.n), Y1 = ty(B.s) + 1;
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

// ---- OSM: guarda o de 28/10 e baixa o recorte novo
if (!fs.existsSync(`${RAW}/osm-v1.json`)) fs.copyFileSync(`${RAW}/osm.json`, `${RAW}/osm-v1.json`);
const v2File = `${RAW}/osm-v2.json`;
if (!(fs.existsSync(v2File) && fs.statSync(v2File).size > 10000)) {
  const b = `${B.s},${B.w},${B.n},${B.e}`;
  const q = `[out:json][timeout:180];(
    way["natural"="coastline"](${b});
    way["natural"="water"](${b}); relation["natural"="water"](${b});
    way["landuse"~"forest|grass|meadow"](${b}); relation["landuse"="forest"](${b});
    way["natural"~"wood|scrub|bare_rock|cliff|beach|sand"](${b}); relation["natural"~"wood|bare_rock"](${b});
    way["leisure"~"park|nature_reserve"](${b}); relation["leisure"~"park|nature_reserve"](${b});
    way["highway"~"motorway|trunk|primary|secondary"](${b});
    node["natural"="peak"](${b});
    node["tourism"~"attraction|viewpoint"](${b});
    way["place"~"island|islet"](${b}); relation["place"~"island|islet"](${b}); node["place"~"island|islet"](${b});
  );out geom;`;
  let done = false;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (!r.ok) { console.log(`mapa: ${new URL(url).host} ${r.status}`); continue; }
      const txt = await r.text();
      if (!txt.trimStart().startsWith('{')) { console.log(`mapa: ${new URL(url).host} não devolveu JSON`); continue; }
      fs.writeFileSync(v2File, txt); done = true; break;
    } catch (e) { console.log(`mapa: ${new URL(url).host} ${e.message}`); }
  }
  if (!done) throw new Error('OpenStreetMap: nenhum servidor respondeu');
}

// ---- junta: v1 inteiro + do v2 só o que é novo E fica todo fora do recorte antigo
const v1 = JSON.parse(fs.readFileSync(`${RAW}/osm-v1.json`, 'utf8'));
const v2 = JSON.parse(fs.readFileSync(v2File, 'utf8'));
const key = (el) => `${el.type}/${el.id}`;
const have = new Set(v1.elements.map(key));
const pts = (el) => el.type === 'node' ? [{ lat: el.lat, lon: el.lon }]
  : el.type === 'way' ? (el.geometry ?? []) : (el.members ?? []).flatMap((m) => m.geometry ?? (m.lat !== undefined ? [{ lat: m.lat, lon: m.lon }] : []));
const touchesOld = (el) => {
  const p = pts(el).filter(Boolean); if (!p.length) return true;
  let s = 90, n = -90, w = 180, e = -180;
  for (const g of p) { s = Math.min(s, g.lat); n = Math.max(n, g.lat); w = Math.min(w, g.lon); e = Math.max(e, g.lon); }
  return !(n < BBOX_V1.s || s > BBOX_V1.n || e < BBOX_V1.w || w > BBOX_V1.e);
};
let added = 0, newButInside = 0;
const merged = { ...v1, elements: [...v1.elements] };
for (const el of v2.elements) {
  if (have.has(key(el))) continue;
  if (touchesOld(el)) { newButInside++; continue; }
  merged.elements.push(el); added++;
}
fs.writeFileSync(`${RAW}/osm.json`, JSON.stringify(merged));
const isl = merged.elements.filter((e) => /island|islet/.test(e.tags?.place ?? '') && e.tags?.name).map((e) => {
  const p = pts(e).filter(Boolean), la = p.reduce((a, g) => a + g.lat, 0) / p.length, lo = p.reduce((a, g) => a + g.lon, 0) / p.length;
  return `${e.tags.name} (${la.toFixed(4)}, ${lo.toFixed(4)})`;
});
const pk = merged.elements.filter((e) => e.type === 'node' && e.tags?.natural === 'peak' && e.tags?.name && e.lon < BBOX_V1.w).map((e) => `${e.tags.name} ${e.tags.ele ?? '?'} m (${e.lat.toFixed(4)}, ${e.lon.toFixed(4)})`);
console.log(JSON.stringify({ v1: v1.elements.length, v2: v2.elements.length, entraram: added, novos_que_encostam_no_antigo_fora: newButInside, total: merged.elements.length }));
console.log('ilhas:', isl.join(' · '));
console.log('picos novos a oeste:', pk.join(' · '));
