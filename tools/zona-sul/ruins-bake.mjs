// RUÍNAS POR BAIRRO (05/11, Pedro: "por bairro uns 2 a 5%, nada colado, onde realmente são os prédios, já com textura,
// como ruína" · "mais área de favela no morro, alguns da pista, detalhes" · "custo 15 mil triângulos — dá pra pôr mais
// uns 15 mil, ficar nos 30 mil?"). 2º passo: dos prédios do OSM (raw/buildings.json — buildings-fetch.mjs), escolhe
// por bairro uma fração ESPAÇADA no lugar de verdade e grava public/zona-sul/ruins.json (o jogo desenha e põe colisão).
//  - FAVELA = casa pequena + muitas juntas + na encosta (ou perto de favela com nome no OSM): ~9%, em cacho (pouco espaço);
//  - PRÉDIO (asfalto) = ~4% por bairro, ≥ PREDIO_GAP m entre eles, os mais ALTOS e os da beira das AVENIDAS primeiro;
//  - nunca em rua / praia / mar / lagoa / mata / fora do mapa; base escalada (o mapa é 1:7,4 — um prédio de 20 m viraria
//    2,7 m: base × K pra ficar do tamanho do herói) e altura do OSM (height / andares) reduzida pra ruína;
//  - orçamento: ≤ TRI_BUDGET triângulos (a conta da geometria é a mesma do zs-ruins.ts).
// Uso: node tools/zona-sul/ruins-bake.mjs
import fs from 'node:fs';
import sharp from 'sharp';
import { BBOX_V1, SCALE } from './zona-sul-config.mjs';

const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const RAW = `${ROOT}tools/zona-sul/raw/`;
export const PARAMS = {
  PREDIO_PCT: 0.07, PREDIO_MIN: 2, PREDIO_MAX: 48, PREDIO_GAP: 16, PREDIO_K: 2.6,
  FAVELA_PCT: 0.2, FAVELA_GAP: 1.2, FAVELA_K: 4.2,
  ROAD_NEAR: 7, TRI_BUDGET: 30000, TRI_PREDIO: 52, TRI_FAVELA: 13,
};
const P = PARAMS;
// a mesma conta do bake.mjs (origem = centro do recorte de 28/10; x leste, z SUL)
const CELL = 4, M_LAT = 110574, M_LON = 111320 * Math.cos(((BBOX_V1.s + BBOX_V1.n) / 2) * Math.PI / 180), PXM = CELL * SCALE;
const W_OLD = Math.round((BBOX_V1.e - BBOX_V1.w) * M_LON / PXM), H_OLD = Math.round((BBOX_V1.n - BBOX_V1.s) * M_LAT / PXM);
const gx = (lon) => (lon - BBOX_V1.w) * M_LON / SCALE - (W_OLD * CELL) / 2;
const gz = (lat) => (BBOX_V1.n - lat) * M_LAT / SCALE - (H_OLD * CELL) / 2;

// terreno do jogo (altura + tipo de chão)
const meta = fs.readFileSync(`${ROOT}src/components/zona-sul/zona-sul-meta.ts`, 'utf8');
const T = JSON.parse(meta.match(/export const ZS_TERRAIN = (\{[^}]+\})/)[1].replace(/(\w+):/g, '"$1":').replace(/'/g, '"'));
const SURF = JSON.parse(meta.match(/export const ZS_SURF = (\{[^}]+\})/)[1]);
const { data, info } = await sharp(fs.readFileSync(`${ROOT}public${T.url}`)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const hAt = (x, z) => { const i = Math.round((x - T.x0) / T.cell), j = Math.round((z - T.z0) / T.cell); if (i < 0 || j < 0 || i >= info.width || j >= info.height) return NaN; const p = (j * info.width + i) * 4; return ((data[p] << 8) + data[p + 1]) / 100 - T.offset; };
const sAt = (x, z) => { const i = Math.round((x - T.x0) / T.cell), j = Math.round((z - T.z0) / T.cell); if (i < 0 || j < 0 || i >= info.width || j >= info.height) return SURF.out; return data[(j * info.width + i) * 4 + 2]; };
const BAD = new Set([SURF.sea, SURF.lagoon, SURF.beach, SURF.out, SURF.road, SURF.forest]);

// semente fixa por id do OSM (o mesmo sorteio sempre)
const hash = (n) => { let h = Math.imul(n | 0, 2654435761) ^ (n / 4294967296 | 0); h = Math.imul(h ^ (h >>> 15), 2246822519); h ^= h >>> 13; return (h >>> 0) / 4294967296; };

const els = JSON.parse(fs.readFileSync(`${RAW}buildings.json`, 'utf8')).elements;
const places = els.filter((e) => e.type === 'node' && e.tags?.place === 'suburb').map((e) => ({ name: e.tags.name, x: gx(e.lon), z: gz(e.lat) }));
const FAVELA_NAMES = ['Rocinha', 'Vidigal', 'Santa Marta', 'Chácara do Céu', 'Vale Encantado'];
const favelaPts = els.filter((e) => e.tags?.place && FAVELA_NAMES.includes(e.tags.name)).map((e) => ({ name: e.tags.name, x: gx(e.lon ?? e.center?.lon ?? e.geometry?.[0]?.lon), z: gz(e.lat ?? e.center?.lat ?? e.geometry?.[0]?.lat) })).filter((q) => Number.isFinite(q.x));
const bairro = (x, z) => { let b = places[0], d = Infinity; for (const q of places) { const dd = (q.x - x) ** 2 + (q.z - z) ** 2; if (dd < d) { d = dd; b = q; } } return b.name; };

// avenidas (o OSM do mapa) — "alguns da pista"
const osm = JSON.parse(fs.readFileSync(`${RAW}osm-v2.json`, 'utf8')).elements;
const segs = [];
for (const w of osm) if (w.type === 'way' && /^(trunk|primary|secondary|tertiary)(_link)?$/.test(w.tags?.highway ?? '') && w.geometry) {
  for (let i = 1; i < w.geometry.length; i++) segs.push([gx(w.geometry[i - 1].lon), gz(w.geometry[i - 1].lat), gx(w.geometry[i].lon), gz(w.geometry[i].lat)]);
}
const SG = 16, segGrid = new Map();
for (const s of segs) { const x0 = Math.floor(Math.min(s[0], s[2]) / SG), x1 = Math.floor(Math.max(s[0], s[2]) / SG), z0 = Math.floor(Math.min(s[1], s[3]) / SG), z1 = Math.floor(Math.max(s[1], s[3]) / SG); for (let i = x0; i <= x1; i++) for (let j = z0; j <= z1; j++) { const k = `${i},${j}`; (segGrid.get(k) ?? segGrid.set(k, []).get(k)).push(s); } }
const roadDist = (x, z) => { let best = Infinity; const ci = Math.floor(x / SG), cj = Math.floor(z / SG); for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const s of segGrid.get(`${i},${j}`) ?? []) { const dx = s[2] - s[0], dz = s[3] - s[1], l2 = dx * dx + dz * dz || 1; let t = ((x - s[0]) * dx + (z - s[1]) * dz) / l2; t = Math.max(0, Math.min(1, t)); best = Math.min(best, Math.hypot(x - (s[0] + dx * t), z - (s[1] + dz * t))); } return best; };
// conferência da conta (a mesma do mapa): a ponta sul do Túnel Rebouças do OSM é a boca da caverna, (−70, −59) no jogo
{ const tn = osm.find((w) => w.type === 'way' && /Antônio Rebouças/.test(w.tags?.name ?? '') && w.tags?.tunnel && w.geometry.some((g) => gz(g.lat) > -100)); const g = tn.geometry.reduce((a, q) => (gz(q.lat) > gz(a.lat) ? q : a)); const d = Math.hypot(gx(g.lon) + 70, gz(g.lat) + 59); console.log(`conta lat/lon → jogo: ponta sul do Rebouças a ${d.toFixed(1)} m da boca da caverna`); if (d > 3) throw new Error('a conta do mapa não bate'); }

// prédios
const B = [];
for (const e of els) {
  if (e.type !== 'way' || !e.tags?.building || !e.geometry || e.geometry.length < 4) continue;
  let pts = e.geometry.map((g) => [gx(g.lon), gz(g.lat)]);
  if (pts[0][0] === pts[pts.length - 1][0] && pts[0][1] === pts[pts.length - 1][1]) pts = pts.slice(0, -1);
  let a = 0, cx = 0, cz = 0;
  for (let i = 0; i < pts.length; i++) { const [x1, z1] = pts[i], [x2, z2] = pts[(i + 1) % pts.length], c = x1 * z2 - x2 * z1; a += c; cx += (x1 + x2) * c; cz += (z1 + z2) * c; }
  if (Math.abs(a) < 1e-6) continue;
  cx /= 3 * a; cz /= 3 * a;
  const areaReal = Math.abs(a / 2) * SCALE * SCALE;
  const t = e.tags, hTag = parseFloat(String(t.height ?? '').replace(',', '.')), lv = parseFloat(t['building:levels'] ?? '');
  const hReal = Number.isFinite(hTag) && hTag > 0 ? hTag : Number.isFinite(lv) && lv > 0 ? lv * 3.1 : /house|detached|residential/.test(t.building) ? 7 : 10;
  B.push({ id: e.id, pts, cx, cz, areaReal, hReal, levels: Number.isFinite(lv) ? lv : Math.round(hReal / 3.1) });
}
// densidade (vizinhos a 25 m reais) e encosta
const DG = 4, dGrid = new Map();
for (const b of B) { const k = `${Math.floor(b.cx / DG)},${Math.floor(b.cz / DG)}`; (dGrid.get(k) ?? dGrid.set(k, []).get(k)).push(b); }
const R25 = 25 / SCALE;
for (const b of B) {
  let n = 0; const ci = Math.floor(b.cx / DG), cj = Math.floor(b.cz / DG);
  for (let i = ci - 1; i <= ci + 1; i++) for (let j = cj - 1; j <= cj + 1; j++) for (const q of dGrid.get(`${i},${j}`) ?? []) if (Math.hypot(q.cx - b.cx, q.cz - b.cz) < R25) n++;
  b.dens = n;
  const dh = Math.max(Math.abs(hAt(b.cx + 6, b.cz) - hAt(b.cx - 6, b.cz)), Math.abs(hAt(b.cx, b.cz + 6) - hAt(b.cx, b.cz - 6)));
  b.slope = (Math.atan2(dh, 12) * 180) / Math.PI;
  const nearFavela = favelaPts.some((q) => Math.hypot(q.x - b.cx, q.z - b.cz) < (q.name === 'Rocinha' ? 110 : 60));
  b.favela = (b.areaReal < 110 && b.dens >= 9 && b.slope >= 7) || (nearFavela && b.areaReal < 220);
  b.bairro = b.favela ? (favelaPts.find((q) => Math.hypot(q.x - b.cx, q.z - b.cz) < (q.name === 'Rocinha' ? 110 : 60))?.name ?? `favela · ${bairro(b.cx, b.cz)}`) : bairro(b.cx, b.cz);
  b.road = roadDist(b.cx, b.cz);
}
// base escalada em volta do centro e simplificada (≤ 8 cantos), sentido anti-horário
const simplify = (pts, max) => {
  let p = pts.slice();
  while (p.length > max) { let bi = 0, bv = Infinity; for (let i = 0; i < p.length; i++) { const a = p[(i - 1 + p.length) % p.length], b = p[i], c = p[(i + 1) % p.length]; const v = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1])); if (v < bv) { bv = v; bi = i; } } p.splice(bi, 1); }
  return p;
};
// CONVEXA (o contorno do OSM em L/U tem o centro fora e a laje em leque sairia errada; a colisão também é de convexo)
const hull = (pts) => {
  const q = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]), cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const v of q) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], v) <= 0) lo.pop(); lo.push(v); }
  for (const v of q.slice().reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], v) <= 0) up.pop(); up.push(v); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
};
const shape = (b, K, maxV) => {
  let p = simplify(hull(b.pts), maxV).map(([x, z]) => [(x - b.cx) * K, (z - b.cz) * K]);
  let a = 0; for (let i = 0; i < p.length; i++) { const [x1, z1] = p[i], [x2, z2] = p[(i + 1) % p.length]; a += x1 * z2 - x2 * z1; }
  if (a < 0) p.reverse(); // anti-horário (no plano x, z)
  return p.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]);
};
const radius = (p) => Math.max(...p.map(([x, z]) => Math.hypot(x, z)));
// o centro, os cantos e as PAREDES (a cada 1,5 m) longe de rua/praia/água/mata — na posição já arredondada (a do arquivo)
const fits = (cx, cz, p) => {
  if (BAD.has(sAt(cx, cz)) || !Number.isFinite(hAt(cx, cz))) return false;
  for (let i = 0; i < p.length; i++) {
    const [ax, az] = p[i], [bx, bz] = p[(i + 1) % p.length], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 1.5));
    for (let k = 0; k < n; k++) if (BAD.has(sAt(cx + ax + ((bx - ax) * k) / n, cz + az + ((bz - az) * k) / n))) return false;
  }
  return true;
};

// escolha: prédios por bairro (mais altos e da avenida primeiro) + favela em cacho
const byB = new Map();
for (const b of B) { const k = (b.favela ? 'F:' : 'P:') + b.bairro; (byB.get(k) ?? byB.set(k, []).get(k)).push(b); } // favela e asfalto do mesmo bairro: grupos separados
const chosen = [];
const taken = new Map(); // grade dos escolhidos (pra espaçar)
const TG = 16, near = (x, z, r) => { const out = []; const ci = Math.floor(x / TG), cj = Math.floor(z / TG), k = Math.ceil(r / TG); for (let i = ci - k; i <= ci + k; i++) for (let j = cj - k; j <= cj + k; j++) out.push(...(taken.get(`${i},${j}`) ?? [])); return out; };
const take = (c) => { const k = `${Math.floor(c.x / TG)},${Math.floor(c.z / TG)}`; (taken.get(k) ?? taken.set(k, []).get(k)).push(c); chosen.push(c); };
const stats = [];
let pct = { p: P.PREDIO_PCT, f: P.FAVELA_PCT };
for (let tries = 0; tries < 6; tries++) {
  chosen.length = 0; taken.clear(); stats.length = 0;
  for (const [key, list] of byB) {
    const name = key.slice(2);
    const isFav = list[0].favela;
    const want = isFav ? Math.round(list.length * pct.f) : Math.max(P.PREDIO_MIN, Math.min(P.PREDIO_MAX, Math.round(list.length * pct.p)));
    const score = (b) => isFav ? hash(b.id) : Math.min(1, b.hReal / 60) * 0.6 + (b.road < P.ROAD_NEAR ? 0.35 : 0) + hash(b.id) * 0.4;
    const cand = list.filter((b) => b.favela === isFav).sort((a, b) => score(b) - score(a));
    let n = 0;
    for (const b of cand) {
      if (n >= want) break;
      const p = shape(b, isFav ? P.FAVELA_K : P.PREDIO_K, isFav ? 5 : 8);
      const rx = Math.round(b.cx * 10) / 10, rz = Math.round(b.cz * 10) / 10;
      if (p.length < 3 || !fits(rx, rz, p)) continue;
      const r = radius(p), gap = isFav ? P.FAVELA_GAP : P.PREDIO_GAP;
      if (r < (isFav ? 1.4 : 2.2) || r > (isFav ? 6 : 14)) continue;
      if (near(b.cx, b.cz, r + 14 + Math.max(P.PREDIO_GAP, P.FAVELA_GAP) + 2).some((c) => Math.hypot(c.x - b.cx, c.z - b.cz) < c.r + r + (c.k === 1 && isFav ? P.FAVELA_GAP : Math.max(gap, P.FAVELA_GAP)))) continue;
      // altura da ruína: prédio = 55% do real (12–30 m) · favela = 2–4 andares de 2,8 m
      const h = isFav ? Math.max(2, Math.min(4, Math.round(b.levels) || 2 + Math.floor(hash(b.id + 7) * 3))) * 2.8 : Math.max(12, Math.min(30, b.hReal * 0.55));
      take({ k: isFav ? 1 : 0, b: name, x: Math.round(b.cx * 10) / 10, z: Math.round(b.cz * 10) / 10, p, h: Math.round(h * 10) / 10, s: b.id % 100000, r, road: b.road < P.ROAD_NEAR });
      n++;
    }
    stats.push([name, list.length, n, isFav]);
  }
  const tris = chosen.reduce((s, c) => s + (c.k === 1 ? P.TRI_FAVELA : P.TRI_PREDIO), 0);
  if (tris <= P.TRI_BUDGET) break;
  pct = { p: pct.p * 0.9, f: pct.f * 0.9 };
}
const tris = chosen.reduce((s, c) => s + (c.k === 1 ? P.TRI_FAVELA : P.TRI_PREDIO), 0);
const names = [...new Set(chosen.map((c) => c.b))];
const outFile = `${ROOT}public/zona-sul/ruins.json`;
fs.writeFileSync(outFile, JSON.stringify({ v: 1, bairros: names, ruins: chosen.map((c) => [c.k, names.indexOf(c.b), c.x, c.z, c.h, c.s, c.p.flat()]) }));
console.log(`ruínas: ${chosen.length} (prédios ${chosen.filter((c) => c.k === 0).length}, ${chosen.filter((c) => c.k === 0 && c.road).length} na avenida · favela ${chosen.filter((c) => c.k === 1).length}) · ~${tris} triângulos (orçamento ${P.TRI_BUDGET}) · ${(fs.statSync(outFile).size / 1024).toFixed(0)} KB`);
console.log(stats.sort((a, b) => b[2] - a[2]).map(([n, all, got, f]) => `${f ? '🏚' : '🏢'} ${n}: ${got}/${all}`).join(' · '));
