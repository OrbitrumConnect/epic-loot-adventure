// ZONA SUL — "assa" o terreno do jogo a partir dos dados abertos (relevo + OSM). Gera:
//  - public/zona-sul/terrain.png  (RGB: R/G = altura em cm + deslocamento, B = superfície) — 1 px = CELL m no jogo
//  - src/components/zona-sul/zona-sul-meta.ts (tamanho, célula, marcos e ponto de partida em coordenadas do jogo)
// Uso: node tools/zona-sul/bake.mjs [conferencia.png]
//
// Ajustes sobre o dado bruto (todos medidos/explicados no diário):
//  1) PICOS estreitos que o satélite (30 m) arredondou (Corcovado −10%, Irmãos −31%) → cume esculpido até a altitude
//     do OSM (só onde ficou baixo, numa região pequena);
//  2) BAIXADA "enrugada" (o satélite mede telhado de prédio) → abertura morfológica + suavização abaixo de ~50 m;
//  3) MAR pela linha da costa do OSM (o relevo dá 1–3 m na água rasa) com fundo descendo com a distância;
//     LAGOA (água do OSM) com fundo próprio; PRAIA = declive suave até a água.
import fs from 'node:fs';
import sharp from 'sharp';
import { APRON_PX, BBOX, ISLAND_BEACH, PEAK_BOOST, RELIEF, ROCK_LANDMARKS, SCALE } from './zona-sul-config.mjs';
import { loadDem } from './dem.mjs';
import { buildMasks, joinRings } from './masks.mjs';
import { buildRoads, MAX_GRADE, rasterRoadMask } from './roads.mjs';

export const CELL = 4;            // m no jogo por pixel (o dado real tem ~10 m de jogo por amostra: 4 m sobra)
export const H_OFFSET = 30;       // altura gravada = (h + H_OFFSET) em cm (h ≥ −30 m)
export const SURF = { land: 0, sea: 1, lagoon: 2, beach: 3, forest: 4, out: 5, road: 6 }; // out = (reservado); road = debaixo da rua

const [checkPng] = process.argv.slice(2);
const M_LAT = 110574, M_LON = 111320 * Math.cos((BBOX.s + BBOX.n) / 2 * Math.PI / 180);
const PXM = CELL * SCALE; // m reais por pixel
const W = Math.round((BBOX.e - BBOX.w) * M_LON / PXM), H = Math.round((BBOX.n - BBOX.s) * M_LAT / PXM);
const latOf = (j) => BBOX.n - (j + 0.5) * PXM / M_LAT, lonOf = (i) => BBOX.w + (i + 0.5) * PXM / M_LON;
const toPx = (lat, lon) => [(lon - BBOX.w) * M_LON / PXM, (BBOX.n - lat) * M_LAT / PXM];
const idx = (i, j) => Math.max(0, Math.min(H - 1, j)) * W + Math.max(0, Math.min(W - 1, i));
/** pixel → coordenada do jogo (x leste, z SUL; origem no centro da área) */
const gameX = (px) => (px - W / 2) * CELL, gameZ = (py) => (py - H / 2) * CELL;

const { at } = await loadDem();
const e = new Float32Array(W * H); // altitude REAL (m)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) e[j * W + i] = at(latOf(j), lonOf(i));
const { sea, water, forest } = buildMasks(W, H, toPx);
const osm = JSON.parse(fs.readFileSync('tools/zona-sul/raw/osm.json', 'utf8')).elements;

// (2) baixada: abertura (mínimo depois máximo, raio R) tira calombo de prédio; depois média; mistura só abaixo de ~50 m
const R = 3;
const filt = (src, op) => { const out = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let v = op === 'min' ? Infinity : -Infinity; for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) { const s = src[idx(i + a, j + b)]; v = op === 'min' ? Math.min(v, s) : Math.max(v, s); } out[j * W + i] = v; } return out; };
const opened = filt(filt(e, 'min'), 'max');
const smooth = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0, n = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { s += opened[idx(i + a, j + b)]; n++; } smooth[j * W + i] = s / n; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let p = 0; p < W * H; p++) { const w = 1 - sstep(35, 60, e[p]); e[p] = e[p] * (1 - w) + smooth[p] * w; }

// (1) PICOS (Pedro no alto do Cristo: "ficou pontudo, no fim tem uma pontinha"). Duas etapas, nesta ordem:
//   a) CÚPULA: em cada pico com nome, média 3×3 repetida (só abaixa) num raio de 3 px em volta do topo — tira a agulha
//      (medido: cortar só o pixel deixava ~5 m de ponta);
//   b) ALTURA: onde o relevo (30 m, arredondado) ficou abaixo da altitude do OSM, soma um perfil de TOPO LARGO E CHATO
//      (super-gaussiana, raio ≥ 90 m reais) até a altitude oficial — volta a altura sem recriar a ponta.
const topOf = (el) => {
  const [px, py] = toPx(el.lat, el.lon), r = Math.ceil(120 / PXM);
  let best = -Infinity, bi = 0, bj = 0;
  for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const i = Math.round(px) + a, j = Math.round(py) + b; if (i < 0 || j < 0 || i >= W || j >= H) continue; if (e[j * W + i] > best) { best = e[j * W + i]; bi = i; bj = j; } }
  return { best, bi, bj };
};
const peaks = osm.filter((el) => el.type === 'node' && el.tags?.natural === 'peak' && el.tags.ele && parseFloat(el.tags.ele) > 100);
for (const el of peaks) {
  if (!el.tags.name || !(parseFloat(el.tags.ele) >= 250)) continue;
  const { best: top0, bi, bj } = topOf(el);
  if (!Number.isFinite(top0)) continue; // pico fora da grade (dado de recorte maior): ignora — antes virava 'infinito' no canto
  for (let it = 0; it < 5; it++) {
    const cp = new Map();
    for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) {
      if (a * a + b * b > 16) continue;
      let s = 0; for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) s += e[idx(bi + a + x, bj + b + y)];
      cp.set(idx(bi + a, bj + b), s / 9);
    }
    for (const [p, v] of cp) e[p] = Math.min(e[p], v);
  }
}
let sculpted = 0;
for (const el of peaks) {
  const ele = parseFloat(el.tags.ele) * (PEAK_BOOST[el.tags.name] ?? 1); // Cristo um pouco mais alto (Pedro)
  const { best, bi, bj } = topOf(el);
  if (!Number.isFinite(best)) continue;
  const deficit = ele - best; if (deficit < 8) continue;
  const sigma = Math.max(120, Math.min(220, deficit * 0.9)) / PXM, rr = Math.ceil(sigma * 2.2);
  for (let b = -rr; b <= rr; b++) for (let a = -rr; a <= rr; a++) {
    const i = bi + a, j = bj + b; if (i < 0 || j < 0 || i >= W || j >= H) continue;
    const q = (a * a + b * b) / (sigma * sigma);
    e[j * W + i] += deficit * Math.exp(-0.5 * q * q);
  }
  sculpted++;
}

// distância (px) até a água (mar/lagoa) e até a terra — duas passadas (chamfer)
function distTo(target) {
  const d = new Float32Array(W * H).fill(1e9);
  for (let p = 0; p < W * H; p++) if (target(p)) d[p] = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const p = j * W + i; if (i > 0) d[p] = Math.min(d[p], d[p - 1] + 1); if (j > 0) d[p] = Math.min(d[p], d[p - W] + 1); if (i > 0 && j > 0) d[p] = Math.min(d[p], d[p - W - 1] + 1.414); if (i < W - 1 && j > 0) d[p] = Math.min(d[p], d[p - W + 1] + 1.414); }
  for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const p = j * W + i; if (i < W - 1) d[p] = Math.min(d[p], d[p + 1] + 1); if (j < H - 1) d[p] = Math.min(d[p], d[p + W] + 1); if (i < W - 1 && j < H - 1) d[p] = Math.min(d[p], d[p + W + 1] + 1.414); if (i > 0 && j < H - 1) d[p] = Math.min(d[p], d[p + W - 1] + 1.414); }
  return d;
}
const isWater = (p) => sea[p] || water[p];
const dWater = distTo(isWater), dLand = distTo((p) => !isWater(p)), dSea = distTo((p) => sea[p]);
/** Preenche um polígono (pontos já em pixel). */
function fillPoly(mask, pts) {
  for (let j = 0; j < H; j++) {
    const y = j + 0.5, xs = [];
    for (let k = 0, l = pts.length - 1; k < pts.length; l = k++) { const [x1, y1] = pts[k], [x2, y2] = pts[l]; if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i < Math.min(W, xs[k + 1] - 0.5); i++) mask[j * W + i] = 1;
  }
}

// altura do JOGO (m) + superfície
const beachTag = new Uint8Array(W * H);
for (const el of osm) if (el.tags?.natural === 'beach') { // só PRAIA (natural=sand marcava areia no meio da baixada)
  const rings = joinRings(el.type === 'way' ? [el.geometry] : (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry));
  for (const ring of rings) { const pts = ring.map((g) => toPx(g.lat, g.lon)); for (let j = 0; j < H; j++) { const y = j + 0.5, xs = []; for (let k = 0, l = pts.length - 1; k < pts.length; l = k++) { const [x1, y1] = pts[k], [x2, y2] = pts[l]; if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1)); } xs.sort((a, b) => a - b); for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i < Math.min(W, xs[k + 1] - 0.5); i++) beachTag[j * W + i] = 1; } }
}
const hg = new Float32Array(W * H), surf = new Uint8Array(W * H);
const dLag = distTo((p) => water[p] === 1);
// só a LAGOA Rodrigo de Freitas (pelo nome): a regra da margem baixa não pode pegar laguinho/represa no morro nem o canal
// do Jardim de Alah que corta a praia (medido: mexia morro em até 6,6 m e 92 px de praia)
const lagoaMask = new Uint8Array(W * H);
{ const el = osm.find((e) => e.tags?.name === 'Lagoa Rodrigo de Freitas');
  if (el) for (const ring of joinRings(el.type === 'way' ? [el.geometry] : (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry))) fillPoly(lagoaMask, ring.map((g) => toPx(g.lat, g.lon))); }
const dLagoa = distTo((p) => lagoaMask[p] === 1);
for (let p = 0; p < W * H; p++) {
  const dm = dLand[p] * CELL; // m (jogo) água adentro
  // fundo desce 12 cm/m (era 6): nada a ~7 m da areia (Pedro: "fiquei lento na água" — 40 m adentro ainda dava pé)
  if (sea[p]) { hg[p] = -Math.min(12, 0.35 + dm * 0.12); surf[p] = SURF.sea; continue; }
  if (water[p]) { hg[p] = -Math.min(3, 0.3 + dm * 0.1); surf[p] = SURF.lagoon; continue; }
  let h = e[p] / SCALE * RELIEF;
  const dw = dWater[p] * CELL; // m (jogo) até a água
  // praia: terra baixa perto da água desce suave até 0,15 m acima da água (costão alto fica como está)
  if (h < 4 && dw < 30) h = 0.15 + (Math.max(0.15, h) - 0.15) * sstep(0, 30, dw);
  // margem da LAGOA: desce suave até a água (Pedro: "a borda da Lagoa perto do Cristo está alta, zoada" — era paredão
  // serrilhado do satélite; a margem real é plana, a orla da Epitácio Pessoa). Morro de verdade (> 15 m) fica.
  // 2º (Pedro: "a elevação em volta da Lagoa voltou; a margem não pode ficar alta, a montanha sim"): TODA a beirinha
  // (até 8 m da água) baixa, e o morro sobe ATRÁS dela (transição até 30 m). Fora dessa faixa nada muda.
  const dl = dLag[p] * CELL, dlg = dLagoa[p] * CELL;
  if (dlg < 20 && !beachTag[p]) h = 0.3 + (Math.max(0.3, h) - 0.3) * sstep(8, 20, dlg); // morro volta a subir já aos 20 m (mexe pouco no pé dele)
  else if (h < 15 && dl < 26) h = 0.3 + (Math.max(0.3, h) - 0.3) * sstep(4, 26, dl); // laguinho/canal: regra antiga (baixada)
  hg[p] = Math.max(0.15, h);
  // areia: praia do OSM ou beira do MAR (a beira da Lagoa/laguinho não vira praia — ficava "areia" no meio da baixada)
  surf[p] = beachTag[p] || (h < 1.2 && dSea[p] * CELL < 14) ? SURF.beach : forest[p] ? SURF.forest : SURF.land; // forest = só dica de mata mais fechada
}
// MARCOS de pedra pequenos demais na escala (Pedra do Arpoador): vira uma pedra visível (cúpula dentro do contorno)
for (const r of ROCK_LANDMARKS) {
  const el = osm.find((e) => e.tags?.name === r.name);
  if (!el) { console.log('marco não achado:', r.name); continue; }
  const mask = new Uint8Array(W * H);
  for (const ring of joinRings(el.type === 'way' ? [el.geometry] : (el.members ?? []).filter((m) => m.role === 'outer' && m.geometry).map((m) => m.geometry))) fillPoly(mask, ring.map((g) => toPx(g.lat, g.lon)));
  const din = distTo((p) => !mask[p]);
  let maxIn = 0; for (let p = 0; p < W * H; p++) if (mask[p]) maxIn = Math.max(maxIn, din[p]);
  for (let p = 0; p < W * H; p++) if (mask[p]) { hg[p] = Math.max(hg[p], 0.15) + r.height * (0.35 + 0.65 * sstep(0, Math.max(1, maxIn), din[p])); surf[p] = SURF.land; }
}

// RUAS (avenidas reais do OSM): nivelamento leve com travas (≤ MAX_GRADE m; praia/água intocadas; costão íngreme não)
const RD = buildRoads({ osm, toPx, W, H, CELL, hg, surf, SURF, gameX, gameZ, minX: gameX(0), maxX: gameX(W), minZ: gameZ(0), maxZ: gameZ(H) });
fs.mkdirSync('public/zona-sul', { recursive: true });
console.log(JSON.stringify({ ruas: RD.roads.length, km_jogo: +RD.km.toFixed(2), nivelados_px: RD.graded, maiorMudanca_m: +RD.maxDelta.toFixed(2), trava_m: MAX_GRADE }));

// ESTENDER ATÉ A ÁGUA (Pedro: "você deve apenas estender até a água; o resto não remover"): o mapa ganha uma faixa NOVA
// de APRON_PX em volta. Terra que chegava na borda continua pra fora DESCENDO (pedra/encosta) até uma praia no pé e o
// mar; mar na borda continua mar. Nada dentro do mapa muda. Coordenadas do jogo iguais (faixa simétrica).
const A = APRON_PX, W2 = W + 2 * A, H2 = H + 2 * A;
const HG = new Float32Array(W2 * H2), SF = new Uint8Array(W2 * H2);
let apronLand = 0;
for (let j2 = 0; j2 < H2; j2++) for (let i2 = 0; i2 < W2; i2++) {
  const q = j2 * W2 + i2, i = i2 - A, j = j2 - A;
  if (i >= 0 && j >= 0 && i < W && j < H) { HG[q] = hg[j * W + i]; SF[q] = surf[j * W + i]; continue; }
  const ci = Math.max(0, Math.min(W - 1, i)), cj = Math.max(0, Math.min(H - 1, j));
  const dm = Math.hypot(i - ci, j - cj) * CELL, h0 = hg[cj * W + ci], s0 = surf[cj * W + ci];
  if (h0 <= 0.05 || s0 === SURF.sea || s0 === SURF.lagoon) { HG[q] = Math.max(-12, Math.min(h0, -(0.4 + dm * 0.08))); SF[q] = SURF.sea; continue; }
  const Dd = Math.max(24, Math.min(A * CELL - 14, h0 * 0.8)); // morro alto desce mais longe (no máx. o que cabe na faixa)
  if (dm < Dd) {
    HG[q] = 0.15 + (h0 - 0.15) * (1 - sstep(0, Dd, dm));
    SF[q] = dm > Dd - ISLAND_BEACH ? SURF.beach : s0 === SURF.forest ? SURF.forest : s0 === SURF.beach ? SURF.beach : SURF.land;
    apronLand++;
  } else { HG[q] = -Math.min(12, 0.4 + (dm - Dd) * 0.08); SF[q] = SURF.sea; }
}
const idx2 = (i, j) => Math.max(0, Math.min(H2 - 1, j)) * W2 + Math.max(0, Math.min(W2 - 1, i));
const gx2 = (px2) => (px2 - W2 / 2) * CELL, gz2 = (py2) => (py2 - H2 / 2) * CELL;

// grava: R/G = altura em cm (+ deslocamento), B = superfície
const img = Buffer.alloc(W2 * H2 * 3);
let hmin = Infinity, hmax = -Infinity;
for (let p = 0; p < W2 * H2; p++) {
  const v = Math.max(0, Math.min(65535, Math.round((HG[p] + H_OFFSET) * 100)));
  img[p * 3] = v >> 8; img[p * 3 + 1] = v & 255; img[p * 3 + 2] = SF[p];
  hmin = Math.min(hmin, HG[p]); hmax = Math.max(hmax, HG[p]);
}
fs.mkdirSync('public/zona-sul', { recursive: true });
await sharp(img, { raw: { width: W2, height: H2, channels: 3 } }).png({ compressionLevel: 9 }).toFile('public/zona-sul/terrain.png');

// RUAS como TEXTURA do chão: grade de 1 m cobrindo o mapa inteiro (com a faixa)
const ROAD_RES = 1, RM = rasterRoadMask(RD.roads, { minX: -W2 * CELL / 2, minZ: -H2 * CELL / 2, sizeX: W2 * CELL, sizeZ: H2 * CELL, res: ROAD_RES });
await sharp(RM.buf, { raw: { width: RM.MW, height: RM.MH, channels: 3 } }).png({ compressionLevel: 9 }).toFile('public/zona-sul/roads-mask.png');
console.log(JSON.stringify({ mapaDasRuas: `${RM.MW}x${RM.MH} (${ROAD_RES} m)`, kb: Math.round(fs.statSync('public/zona-sul/roads-mask.png').size / 1024) }));

// marcos (picos com nome ≥ 300 m) e ponto de partida — coordenadas do jogo (iguais com ou sem a faixa)
const peak = (name) => osm.find((e) => e.type === 'node' && e.tags?.name === name);
const landmarks = osm.filter((e) => e.type === 'node' && e.tags?.natural === 'peak' && e.tags.name && parseFloat(e.tags.ele) >= 300)
  .map((e) => { const [px, py] = toPx(e.lat, e.lon); return { name: e.tags.name, x: +gameX(px).toFixed(1), z: +gameZ(py).toFixed(1), ele: parseFloat(e.tags.ele) }; });
// partida: o ponto de PRAIA mais perto da praia do Arpoador (a coordenada sozinha caía no meio do bairro)
const SPAWN = { lat: -22.98860, lon: -43.19300, name: 'Praia do Arpoador' };
const [tx0, ty0] = toPx(SPAWN.lat, SPAWN.lon);
let sx = tx0 + A, sy = ty0 + A, sbd = Infinity;
for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) { if (SF[j * W2 + i] !== SURF.beach) continue; const d = (i + 0.5 - tx0 - A) ** 2 + (j + 0.5 - ty0 - A) ** 2; if (d < sbd) { sbd = d; sx = i + 0.5; sy = j + 0.5; } }
const spawn = { x: +gx2(sx).toFixed(1), z: +gz2(sy).toFixed(1) };
fs.mkdirSync('src/components/zona-sul', { recursive: true });
fs.writeFileSync('src/components/zona-sul/zona-sul-meta.ts', `// GERADO por tools/zona-sul/bake.mjs — não editar à mão (rode a ferramenta de novo).
// Zona Sul do RJ em escala 1:${SCALE} (altura ×${RELIEF} da proporção). Dados: relevo AWS Terrain Tiles (SRTM etc.) e
// © OpenStreetMap contributors (ODbL). Coordenadas do jogo: x = leste, z = SUL, origem no centro da área.
export const ZS_TERRAIN = { url: '/zona-sul/terrain.png', w: ${W2}, h: ${H2}, cell: ${CELL}, offset: ${H_OFFSET}, scale: ${SCALE} } as const;
export const ZS_SURF = ${JSON.stringify(SURF)} as const;
/** Ruas como textura do chão: R = cobertura, G = posição atravessada na pista. Retângulo em coordenadas do jogo. */
export const ZS_ROAD_MASK = { url: '/zona-sul/roads-mask.png', x0: ${-W2 * CELL / 2}, z0: ${-H2 * CELL / 2}, w: ${W2 * CELL}, h: ${H2 * CELL} } as const;
export const ZS_SPAWN = ${JSON.stringify({ ...spawn, name: SPAWN.name })};
export const ZS_LANDMARKS: { name: string; x: number; z: number; ele: number }[] = ${JSON.stringify(landmarks)};
`);

// ACESSO aos topos (medição): a partir da partida, andando (subida ≤ 45° por célula) ou nadando — que picos se alcança?
const reach = new Uint8Array(W2 * H2), st = [idx2(Math.floor(sx), Math.floor(sy))];
reach[st[0]] = 1;
while (st.length) {
  const p = st.pop(), i = p % W2, j = (p - i) / W2;
  for (const [a, b, run] of [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [-1, 1, 1.414], [1, -1, 1.414], [-1, -1, 1.414]]) {
    const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= W2 || y >= H2) continue;
    const q = y * W2 + x; if (reach[q]) continue;
    if (HG[q] - HG[p] > run * CELL && HG[q] > 0) continue;
    reach[q] = 1; st.push(q);
  }
}
const access = landmarks.filter((l) => l.ele >= 300).map((l) => {
  const ci = Math.round(l.x / CELL + W2 / 2 - 0.5), cj = Math.round(l.z / CELL + H2 / 2 - 0.5);
  let top = -Infinity, ti = ci, tj = cj; for (let b = -6; b <= 6; b++) for (let a = -6; a <= 6; a++) { const v = HG[idx2(ci + a, cj + b)]; if (v > top) { top = v; ti = ci + a; tj = cj + b; } }
  let bestR = -Infinity; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) if (reach[idx2(ti + a, tj + b)]) bestR = Math.max(bestR, HG[idx2(ti + a, tj + b)]);
  return `${l.name} ${top.toFixed(0)} m: ${bestR > -Infinity ? 'alcança' : 'NÃO alcança'}`;
});
const cnt = (v) => SF.filter((s) => s === v).length;
console.log(JSON.stringify({ grade: `${W2}x${H2} (${CELL} m; ${W}x${H} + faixa ${A})`, jogo_km: [+(W2 * CELL / 1000).toFixed(2), +(H2 * CELL / 1000).toFixed(2)], altura_m: [+hmin.toFixed(1), +hmax.toFixed(1)],
  picosEsculpidos: sculpted, mar: `${(100 * cnt(1) / HG.length).toFixed(0)}%`, lagoa: `${(100 * cnt(2) / HG.length).toFixed(1)}%`, praia: `${(100 * cnt(3) / HG.length).toFixed(1)}%`,
  png_kb: Math.round(fs.statSync('public/zona-sul/terrain.png').size / 1024), partida: spawn, marcos: landmarks.length, faixaNovaEmTerra_px: apronLand }));
console.log('acesso a pé:', access.join(' · '));
if (peak('Corcovado')) { const c = peak('Corcovado'); const [px, py] = toPx(c.lat, c.lon); console.log('Corcovado no jogo:', gameX(px).toFixed(0), gameZ(py).toFixed(0)); }

if (checkPng) { // conferência: sombreado + superfície
  const out = Buffer.alloc(W2 * H2 * 3);
  const col = [[120, 140, 80], [40, 90, 140], [60, 120, 165], [215, 200, 150], [60, 110, 55], [95, 95, 110], [70, 70, 68]];
  for (let j = 0; j < H2; j++) for (let i = 0; i < W2; i++) {
    const p = j * W2 + i, dx = (HG[idx2(i + 1, j)] - HG[idx2(i - 1, j)]) / (2 * CELL), dz = (HG[idx2(i, j + 1)] - HG[idx2(i, j - 1)]) / (2 * CELL);
    const shade = Math.max(0.3, Math.min(1.2, 0.85 - (dx - dz) * 1.2)), slope = Math.atan(Math.hypot(dx, dz)) * 57.3;
    const c = SF[p] <= 2 ? col[SF[p]] : slope > 40 ? [150, 145, 135] : col[SF[p]];
    out[p * 3] = Math.min(255, c[0] * shade); out[p * 3 + 1] = Math.min(255, c[1] * shade); out[p * 3 + 2] = Math.min(255, c[2] * shade);
  }
  await sharp(out, { raw: { width: W2, height: H2, channels: 3 } }).png().toFile(checkPng);
}
