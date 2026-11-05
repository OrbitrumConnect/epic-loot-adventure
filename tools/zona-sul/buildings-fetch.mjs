// RUÍNAS POR BAIRRO (05/11, Pedro) — 1º passo: baixa do OpenStreetMap os PRÉDIOS (contorno + andares/altura quando tem),
// as áreas de FAVELA (landuse=residential + residential=informal) e os nomes dos bairros (place=suburb/neighbourhood)
// do recorte do mapa. Bruto em tools/zona-sul/raw/buildings.json (fora do git). Uso: node tools/zona-sul/buildings-fetch.mjs
import fs from 'node:fs';
import { BBOX, EXPAND_TO } from './zona-sul-config.mjs';

const RAW = new URL('./raw/', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const out = `${RAW}buildings.json`;
const UA = { 'User-Agent': 'TRIBOS-zona-sul/1.0 (jogo indie; dados abertos)' };
const b = `${EXPAND_TO.s},${EXPAND_TO.w},${BBOX.n},${BBOX.e}`;
const q = `[out:json][timeout:300];
(
  way["building"](${b});
  way["landuse"="residential"]["residential"="informal"](${b});
  relation["landuse"="residential"]["residential"="informal"](${b});
  way["place"~"neighbourhood|suburb|quarter"](${b});
  node["place"~"neighbourhood|suburb|quarter"](${b});
);out geom;`;
if (fs.existsSync(out) && fs.statSync(out).size > 100000) console.log('prédios: já tinha raw/buildings.json');
else {
  let done = false;
  for (const url of ['https://overpass-api.de/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
    try {
      const r = await fetch(url, { method: 'POST', headers: { ...UA, 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q) });
      if (!r.ok) { console.log(`prédios: ${new URL(url).host} ${r.status}`); continue; }
      const txt = await r.text();
      if (!txt.trimStart().startsWith('{')) { console.log(`prédios: ${new URL(url).host} não devolveu JSON`); continue; }
      fs.writeFileSync(out, txt); done = true; break;
    } catch (e) { console.log(`prédios: ${new URL(url).host} ${e.message}`); }
  }
  if (!done) throw new Error('OpenStreetMap: nenhum servidor respondeu');
}
const els = JSON.parse(fs.readFileSync(out, 'utf8')).elements;
const bld = els.filter((e) => e.type === 'way' && e.tags?.building);
const inf = els.filter((e) => e.tags?.residential === 'informal');
const plc = els.filter((e) => e.tags?.place);
console.log(`prédios: ${bld.length} (com andares ${bld.filter((e) => e.tags['building:levels']).length}, com altura ${bld.filter((e) => e.tags.height).length}) · favelas (áreas) ${inf.length} · lugares ${plc.length}`);
console.log('favelas:', inf.map((e) => e.tags.name ?? '?').join(', '));
console.log('lugares:', plc.map((e) => `${e.tags.name}(${e.tags.place})`).join(', '));
