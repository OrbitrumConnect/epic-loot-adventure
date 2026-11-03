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
import { APRON_PX, BBOX_V1, CANAL_ALAH, EXPAND_TO, ISLAND_BEACH, ISLAND_BOOST, LAGOA_MAX_DEPTH, LAGOA_SLOPE, NORTH_DESCENT, NORTH_PX, PEAK_BOOST, RELIEF, ROCK_LANDMARKS, SCALE } from './zona-sul-config.mjs';
import { loadDem } from './dem.mjs';
import { buildMasks, joinRings } from './masks.mjs';
import { buildRoads, MAX_GRADE, rasterRoadMask } from './roads.mjs';

export const CELL = 4;            // m no jogo por pixel (o dado real tem ~10 m de jogo por amostra: 4 m sobra)
export const H_OFFSET = 30;       // altura gravada = (h + H_OFFSET) em cm (h ≥ −30 m)
export const SURF = { land: 0, sea: 1, lagoon: 2, beach: 3, forest: 4, out: 5, road: 6 }; // out = (reservado); road = debaixo da rua

const [checkPng] = process.argv.slice(2);
// EXPANSÃO (02/11 — Gávea + Cagarras) ALINHADA à grade de 28/10: a escala de longitude fica presa à latitude média do
// recorte antigo e a grade cresce KX px pra oeste e KY px pro sul → o pixel antigo (i, j) é o (i + KX, j) de agora, com a
// MESMA lat/lon, e a coordenada do jogo dele não muda (origem = centro do recorte antigo).
const M_LAT = 110574, M_LON = 111320 * Math.cos((BBOX_V1.s + BBOX_V1.n) / 2 * Math.PI / 180);
const PXM = CELL * SCALE; // m reais por pixel
const W_OLD = Math.round((BBOX_V1.e - BBOX_V1.w) * M_LON / PXM), H_OLD = Math.round((BBOX_V1.n - BBOX_V1.s) * M_LAT / PXM);
const KX = Math.max(0, Math.ceil((BBOX_V1.w - EXPAND_TO.w) * M_LON / PXM)), KY = Math.max(0, Math.ceil((BBOX_V1.s - EXPAND_TO.s) * M_LAT / PXM));
// 02/11 noite: + KN linhas ao NORTE (só a descida longa do maciço da Tijuca até a praia — não é terreno do satélite)
const KN = NORTH_PX;
const BBOX = { n: BBOX_V1.n + KN * PXM / M_LAT, e: BBOX_V1.e, w: BBOX_V1.w - KX * PXM / M_LON, s: BBOX_V1.s - KY * PXM / M_LAT };
const W = W_OLD + KX, H = KN + H_OLD + KY;
const latOf = (j) => BBOX.n - (j + 0.5) * PXM / M_LAT, lonOf = (i) => BBOX.w + (i + 0.5) * PXM / M_LON;
const toPx = (lat, lon) => [(lon - BBOX.w) * M_LON / PXM, (BBOX.n - lat) * M_LAT / PXM];
const idx = (i, j) => Math.max(0, Math.min(H - 1, j)) * W + Math.max(0, Math.min(W - 1, i));
/** pixel (grade nova) → coordenada do jogo (x leste, z SUL; origem no centro do recorte ANTIGO) */
const OX = KX + W_OLD / 2, OZ = KN + H_OLD / 2;
const gameX = (px) => (px - OX) * CELL, gameZ = (py) => (py - OZ) * CELL;
/** O que é terreno de verdade: tudo abaixo das KN linhas do norte — o recorte antigo, a faixa sul e (desde 02/11 noite) a
 *  faixa oeste INTEIRA (maciço da Tijuca). As KN linhas do norte = a descida que vai pro mar. */
const inside = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) inside[j * W + i] = j >= KN ? 1 : 0;
const insideAt = (px, py) => { const i = Math.floor(px), j = Math.floor(py); return i >= 0 && j >= 0 && i < W && j < H && inside[j * W + i] === 1; };

// 02/11 (Pedro, item 3: "consertar o furo antigo da Urca/Pão de Açúcar"): o conserto do lixo do satélite vale no mapa
// TODO (antes: `keep: BBOX_V1` deixava o recorte de 28/10 com os furos). Só o valor impossível (< −1000 m) muda.
const { at } = await loadDem();
const e = new Float32Array(W * H); // altitude REAL (m)
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) e[j * W + i] = at(latOf(j), lonOf(i));
// As KN linhas do norte (02/11 noite) NÃO são terreno: aqui elas repetem a linha da borda (= o que a grade fazia ao
// chegar no limite) — assim nenhuma conta de vizinhança (baixada, praia, costa) muda dentro do mapa. As máscaras saem da
// MESMA grade de antes (sem as linhas novas): a costa do OSM acaba na borda antiga e, com linhas a mais, a terra e o mar
// se ligavam por cima e o mapa inteiro virava mar.
for (let j = 0; j < KN; j++) for (let i = 0; i < W; i++) e[j * W + i] = e[KN * W + i];
const { sea, water, forest } = (() => {
  const m = buildMasks(W, H - KN, (lat, lon) => { const [x, y] = toPx(lat, lon); return [x, y - KN]; });
  const pad = (a) => { const o = new Uint8Array(W * H); o.set(a, KN * W); for (let j = 0; j < KN; j++) o.copyWithin(j * W, KN * W, KN * W + W); return o; };
  return { sea: pad(m.sea), water: pad(m.water), forest: pad(m.forest) };
})();
const osm = JSON.parse(fs.readFileSync('tools/zona-sul/raw/osm.json', 'utf8')).elements;

// (2) baixada: abertura (mínimo depois máximo, raio R) tira calombo de prédio; depois média; mistura só abaixo de ~50 m
const R = 3;
// 02/11 noite: o filtro enxerga a borda norte do mapa de VERDADE como antes (índice preso nela) — senão a 2ª etapa lia
// resultados intermediários das KN linhas novas e mudava as 5 primeiras linhas do mapa (até 2 m)
const idxB = (i, j) => idx(i, Math.max(KN, j));
const filt = (src, op) => { const out = new Float32Array(W * H); for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let v = op === 'min' ? Infinity : -Infinity; for (let b = -R; b <= R; b++) for (let a = -R; a <= R; a++) { const s = src[idxB(i + a, j + b)]; v = op === 'min' ? Math.min(v, s) : Math.max(v, s); } out[j * W + i] = v; } return out; };
const opened = filt(filt(e, 'min'), 'max');
const smooth = new Float32Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { let s = 0, n = 0; for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) { s += opened[idxB(i + a, j + b)]; n++; } smooth[j * W + i] = s / n; }
const sstep = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
for (let p = 0; p < W * H; p++) { const w = 1 - sstep(35, 60, e[p]); e[p] = e[p] * (1 - w) + smooth[p] * w; }

// (1) PICOS (Pedro no alto do Cristo: "ficou pontudo, no fim tem uma pontinha"). Duas etapas, nesta ordem:
//   a) CÚPULA: em cada pico com nome, média 3×3 repetida (só abaixa) num raio de 3 px em volta do topo — tira a agulha
//      (medido: cortar só o pixel deixava ~5 m de ponta);
//   b) ALTURA: onde o relevo (30 m, arredondado) ficou abaixo da altitude do OSM, soma um perfil de TOPO LARGO E CHATO
//      (super-gaussiana, raio ≥ 90 m reais) até a altitude oficial — volta a altura sem recriar a ponta.
// 02/11 noite: os picos só enxergam o mapa de VERDADE (as KN linhas do norte = fora da grade, como antes; índice preso
// na linha da borda — igual ao idx de antes)
const idxIn = (i, j) => idx(i, Math.max(KN, j));
const topOf = (el) => {
  const [px, py] = toPx(el.lat, el.lon), r = Math.ceil(120 / PXM);
  let best = -Infinity, bi = 0, bj = 0;
  for (let b = -r; b <= r; b++) for (let a = -r; a <= r; a++) { const i = Math.round(px) + a, j = Math.round(py) + b; if (i < 0 || j < KN || i >= W || j >= H) continue; if (e[j * W + i] > best) { best = e[j * W + i]; bi = i; bj = j; } }
  return { best, bi, bj };
};
// (só os picos de DENTRO: o maciço da Tijuca, fora da expansão, não é esculpido — a cúpula vazaria pra dentro da borda)
const peaks = osm.filter((el) => el.type === 'node' && el.tags?.natural === 'peak' && el.tags.ele && parseFloat(el.tags.ele) > 100 && insideAt(...toPx(el.lat, el.lon)));
for (const el of peaks) {
  if (!el.tags.name || !(parseFloat(el.tags.ele) >= 250)) continue;
  const { best: top0, bi, bj } = topOf(el);
  if (!Number.isFinite(top0)) continue; // pico fora da grade (dado de recorte maior): ignora — antes virava 'infinito' no canto
  for (let it = 0; it < 5; it++) {
    const cp = new Map();
    for (let b = -4; b <= 4; b++) for (let a = -4; a <= 4; a++) {
      if (a * a + b * b > 16) continue;
      let s = 0; for (let y = -1; y <= 1; y++) for (let x = -1; x <= 1; x++) s += e[idxIn(bi + a + x, bj + b + y)];
      cp.set(idxIn(bi + a, bj + b), s / 9);
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
    const i = bi + a, j = bj + b; if (i < 0 || j < KN || i >= W || j >= H) continue;
    const q = (a * a + b * b) / (sigma * sigma);
    e[j * W + i] += deficit * Math.exp(-0.5 * q * q);
  }
  sculpted++;
}
// as KN linhas do norte voltam a repetir a borda (já esculpida) — as contas seguintes enxergam o mesmo que antes
for (let j = 0; j < KN; j++) for (let i = 0; i < W; i++) e[j * W + i] = e[KN * W + i];

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
  if (water[p]) { hg[p] = -(lagoaMask[p] ? Math.min(LAGOA_MAX_DEPTH, 0.3 + dm * LAGOA_SLOPE) : Math.min(3, 0.3 + dm * 0.1)); surf[p] = SURF.lagoon; continue; } // Lagoa toda navegável (01/11)
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
  // MAR ADENTRO (Pedro 28/10: "a pedra do Arpoador deve ir mais pra dentro do mar"): alonga a pedra na direção em que
  // ela já aponta — da terra em volta (fora da pedra) pro centro dela — afinando na ponta; só sobre o mar
  if (r.extendSea) {
    let cx = 0, cy = 0, n = 0;
    for (let p = 0; p < W * H; p++) if (mask[p]) { cx += p % W; cy += Math.floor(p / W); n++; }
    cx /= n; cy /= n;
    let lx = 0, ly = 0, ln = 0; const R0 = Math.ceil(60 / CELL);
    for (let j = Math.max(0, Math.floor(cy) - R0); j < Math.min(H, cy + R0); j++) for (let i = Math.max(0, Math.floor(cx) - R0); i < Math.min(W, cx + R0); i++) {
      const p = j * W + i; if (!mask[p] && !sea[p] && !water[p] && Math.hypot(i - cx, j - cy) <= R0) { lx += i; ly += j; ln++; }
    }
    const dx = cx - lx / ln, dy = cy - ly / ln, dl = Math.hypot(dx, dy) || 1, ux = dx / dl, uy = dy / dl;
    const steps = Math.round(r.extendSea / CELL), orig = mask.slice();
    let added = 0;
    for (let p = 0; p < W * H; p++) if (orig[p]) for (let k = 1; k <= steps; k++) {
      // afina: na ponta só o miolo da pedra continua (distância ao eixo da pedra encolhe com k)
      const i = p % W, j = Math.floor(p / W), off = Math.abs((i - cx) * -uy + (j - cy) * ux);
      if (off > Math.max(1, (1 - k / (steps + 1)) * 4)) continue;
      const ii = Math.round(i + ux * k), jj = Math.round(j + uy * k); if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const q = jj * W + ii; if (!mask[q] && sea[q]) { mask[q] = 1; added++; }
    }
    console.log(JSON.stringify({ pedra: r.name, centro_jogo: [+gameX(cx).toFixed(0), +gameZ(cy).toFixed(0)], direcao: [+ux.toFixed(2), +uy.toFixed(2)], px_mar_adentro: added }));
  }
  const din = distTo((p) => !mask[p]);
  let maxIn = 0; for (let p = 0; p < W * H; p++) if (mask[p]) maxIn = Math.max(maxIn, din[p]);
  for (let p = 0; p < W * H; p++) if (mask[p]) { hg[p] = Math.max(hg[p], 0.15) + r.height * (0.35 + 0.65 * sstep(0, Math.max(1, maxIn), din[p])); surf[p] = SURF.land; }
}

// ILHAS CAGARRAS mais altas (02/11, ISLAND_BOOST): só a TERRA dentro do contorno de cada ilha do arquipélago sobe
{
  let px = 0, top = 0;
  for (const el of osm) {
    if (el.type !== 'way' || !el.geometry || !ISLAND_BOOST.names.includes(el.tags?.name)) continue;
    const mask = new Uint8Array(W * H);
    for (const ring of joinRings([el.geometry])) fillPoly(mask, ring.map((g) => toPx(g.lat, g.lon)));
    for (let p = 0; p < W * H; p++) if (mask[p] && inside[p] && !sea[p] && hg[p] > 0.15) { hg[p] = 0.15 + (hg[p] - 0.15) * ISLAND_BOOST.k; px++; top = Math.max(top, hg[p]); }
  }
  console.log(JSON.stringify({ ilhasRealcadas_px: px, ilhaMaisAlta_m: +top.toFixed(1) }));
}

// FAIXA QUE DESCE PRO MAR (a das bordas do mapa, abaixo; e, desde 02/11, o bloco de FORA da expansão — o maciço da
// Tijuca): a partir do pixel de dentro mais perto (altura h0, superfície s0) a `dm` m dele. Terra desce até uma praia no
// pé e o mar; água continua água. Uma conta só pros dois.
const A = APRON_PX;
/** `long` 0..1 (02/11 noite): a DESCIDA LONGA da borda norte do maciço da Tijuca (altura × k, até max m) — sem paredão */
function apronAt(h0, s0, dm, long = 0) {
  if (h0 <= 0.05 || s0 === SURF.sea || s0 === SURF.lagoon) return [Math.max(-12, Math.min(h0, -(0.4 + dm * 0.08))), SURF.sea];
  const D0 = Math.max(24, Math.min(A * CELL - 14, h0 * 0.8)); // morro alto desce mais longe (no máx. o que cabe na faixa)
  const Dd = D0 + (Math.max(D0, Math.min(NORTH_DESCENT.max, h0 * NORTH_DESCENT.k)) - D0) * long;
  if (dm < Dd) return [0.15 + (h0 - 0.15) * (1 - sstep(0, Dd, dm)), dm > Dd - ISLAND_BEACH ? SURF.beach : s0 === SURF.forest ? SURF.forest : s0 === SURF.beach ? SURF.beach : SURF.land];
  return [-Math.min(12, 0.4 + (dm - Dd) * 0.08), SURF.sea];
}
{ // bloco de fora: pixel de dentro mais perto (propagação em 2 passadas com a distância de verdade)
  const src = new Int32Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) if (inside[p]) src[p] = p;
  const d2 = (p, s) => { const i = p % W, j = (p - i) / W, si = s % W, sj = (s - si) / W; return (i - si) ** 2 + (j - sj) ** 2; };
  const relax = (p, q) => { const s = src[q]; if (s >= 0 && (src[p] < 0 || d2(p, s) < d2(p, src[p]))) src[p] = s; };
  for (let rep = 0; rep < 2; rep++) {
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) { const p = j * W + i; if (inside[p]) continue; if (i > 0) relax(p, p - 1); if (j > 0) { relax(p, p - W); if (i > 0) relax(p, p - W - 1); if (i < W - 1) relax(p, p - W + 1); } }
    for (let j = H - 1; j >= 0; j--) for (let i = W - 1; i >= 0; i--) { const p = j * W + i; if (inside[p]) continue; if (i < W - 1) relax(p, p + 1); if (j < H - 1) { relax(p, p + W); if (i < W - 1) relax(p, p + W + 1); if (i > 0) relax(p, p + W - 1); } }
  }
  let outPx = 0;
  for (let p = 0; p < W * H; p++) {
    if (inside[p] || src[p] < 0) continue;
    // descida longa no lado oeste (maciço), a de sempre no resto da borda norte — com transição de blendPx colunas
    const long = 1 - sstep(KX, KX + NORTH_DESCENT.blendPx, p % W);
    const [h, s] = apronAt(hg[src[p]], surf[src[p]], Math.sqrt(d2(p, src[p])) * CELL, long);
    hg[p] = h; surf[p] = s; outPx++;
  }
  console.log(JSON.stringify({ expansao: { KX, KY, grade: `${W}x${H}`, foraDaExpansao_px: outPx } }));
}

// RUAS (avenidas reais do OSM): nivelamento leve com travas (≤ MAX_GRADE m; praia/água intocadas; costão íngreme não)
// 02/11 noite: na MESMA grade de antes (sem as KN linhas do norte, que são só a descida pro mar) — com elas, a rua que
// cruza a borda norte "via" a descida lá em cima e nivelava diferente a 1ª linha do mapa (+3 a +13 cm, 373 px)
const RD = (() => {
  const off = KN * W, gz = (py) => gameZ(py + KN);
  return buildRoads({ osm, toPx: (lat, lon) => { const [x, y] = toPx(lat, lon); return [x, y - KN]; }, W, H: H - KN, CELL, hg: hg.subarray(off), surf: surf.subarray(off), SURF,
    gameX, gameZ: gz, minX: gameX(0), maxX: gameX(W), minZ: gz(0), maxZ: gz(H - KN), fx: (x) => x / CELL + OX - 0.5, fz: (z) => z / CELL + OZ - KN - 0.5 });
})();
fs.mkdirSync('public/zona-sul', { recursive: true });
console.log(JSON.stringify({ ruas: RD.roads.length, km_jogo: +RD.km.toFixed(2), nivelados_px: RD.graded, maiorMudanca_m: +RD.maxDelta.toFixed(2), trava_m: MAX_GRADE }));

// CANAL DO JARDIM DE ALAH NAVEGÁVEL (01/11, ver CANAL_ALAH): depois das ruas (o nivelamento delas não mexe no canal).
// Só abaixa: altura = mín(chão, perfil do canal). O que virou água vira LAGOA (água de dentro — o tubarão é só do mar).
/** distância (m do jogo) de (x, z) ao eixo do canal, descontada a largura extra do trecho (boca em funil) */
const canalDist = (x, z) => {
  let best = Infinity; const P = CANAL_ALAH.path;
  for (let k = 0; k + 1 < P.length; k++) {
    const [ax, az, ea = 0] = P[k], [bx, bz, eb = 0] = P[k + 1], vx = bx - ax, vz = bz - az, l2 = vx * vx + vz * vz || 1;
    const u = Math.max(0, Math.min(1, ((x - ax) * vx + (z - az) * vz) / l2));
    best = Math.min(best, Math.hypot(x - ax - vx * u, z - az - vz * u) - (ea + (eb - ea) * u));
  }
  return best;
};
const canalProfile = (d) => -CANAL_ALAH.bottom + Math.max(0, d - CANAL_ALAH.flat) * CANAL_ALAH.slope;
const CANAL_REACH = CANAL_ALAH.flat + CANAL_ALAH.bottom / CANAL_ALAH.slope + 6; // além disto o perfil já passou de +4 m
let canalPx = 0;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const d = canalDist(gameX(i + 0.5), gameZ(j + 0.5)); if (d > CANAL_REACH) continue;
  const p = j * W + i, c = canalProfile(d); if (c >= hg[p]) continue;
  hg[p] = c; canalPx++;
  if (c < 0 && surf[p] !== SURF.sea && surf[p] !== SURF.lagoon) surf[p] = SURF.lagoon;
}
console.log(JSON.stringify({ canalJardimDeAlah_px: canalPx }));

// ESTENDER ATÉ A ÁGUA (Pedro: "você deve apenas estender até a água; o resto não remover"): o mapa ganha uma faixa NOVA
// de APRON_PX em volta. Terra que chegava na borda continua pra fora DESCENDO (pedra/encosta) até uma praia no pé e o
// mar; mar na borda continua mar. Nada dentro do mapa muda. Coordenadas do jogo iguais (faixa simétrica).
const W2 = W + 2 * A, H2 = H + 2 * A;
const HG = new Float32Array(W2 * H2), SF = new Uint8Array(W2 * H2);
let apronLand = 0;
for (let j2 = 0; j2 < H2; j2++) for (let i2 = 0; i2 < W2; i2++) {
  const q = j2 * W2 + i2, i = i2 - A, j = j2 - A;
  if (i >= 0 && j >= 0 && i < W && j < H) { HG[q] = hg[j * W + i]; SF[q] = surf[j * W + i]; continue; }
  const ci = Math.max(0, Math.min(W - 1, i)), cj = Math.max(0, Math.min(H - 1, j));
  const [h, s] = apronAt(hg[cj * W + ci], surf[cj * W + ci], Math.hypot(i - ci, j - cj) * CELL);
  HG[q] = h; SF[q] = s; if (s !== SURF.sea) apronLand++;
}
const idx2 = (i, j) => Math.max(0, Math.min(H2 - 1, j)) * W2 + Math.max(0, Math.min(W2 - 1, i));
/** pixel (grade com a faixa) → jogo; e o centro do 1º pixel / a borda (meta e máscara das ruas) */
const gx2 = (px2) => (px2 - A - OX) * CELL, gz2 = (py2) => (py2 - A - OZ) * CELL;

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
const ROAD_RES = 1, RM = rasterRoadMask(RD.roads, { minX: gx2(0), minZ: gz2(0), sizeX: W2 * CELL, sizeZ: H2 * CELL, res: ROAD_RES });
// CANAL (01/11): a rua some onde o chão virou água (senão a terra da pista aparece no fundo do canal). Só na faixa do canal.
{
  const hgAt = (x, z) => { // bilinear entre os centros das células (igual zsHeightAt no jogo)
    const fx = Math.max(0, Math.min(W2 - 1.001, x / CELL + A + OX - 0.5)), fz = Math.max(0, Math.min(H2 - 1.001, z / CELL + A + OZ - 0.5));
    const i = Math.floor(fx), j = Math.floor(fz), ax = fx - i, az = fz - j, p = j * W2 + i;
    return (HG[p] * (1 - ax) + HG[p + 1] * ax) * (1 - az) + (HG[p + W2] * (1 - ax) + HG[p + W2 + 1] * ax) * az;
  };
  let cleared = 0;
  for (let v = 0; v < RM.MH; v++) for (let u = 0; u < RM.MW; u++) {
    const q = v * RM.MW + u; if (RM.buf[q * 3] === 0) continue;
    const x = gx2(0) + (u + 0.5) * ROAD_RES, z = gz2(0) + (v + 0.5) * ROAD_RES;
    if (canalDist(x, z) > CANAL_REACH || hgAt(x, z) >= 0.5) continue; // 0,5: a pista para um palmo antes da beira d'água
    RM.buf[q * 3] = 0; RM.buf[q * 3 + 1] = 128; cleared++;
  }
  console.log(JSON.stringify({ canal_rua_tirada_m2: cleared }));
}
await sharp(RM.buf, { raw: { width: RM.MW, height: RM.MH, channels: 3 } }).png({ compressionLevel: 9 }).toFile('public/zona-sul/roads-mask.png');
console.log(JSON.stringify({ mapaDasRuas: `${RM.MW}x${RM.MH} (${ROAD_RES} m)`, kb: Math.round(fs.statSync('public/zona-sul/roads-mask.png').size / 1024) }));

// marcos (picos com nome ≥ 300 m) e ponto de partida — coordenadas do jogo (iguais com ou sem a faixa)
const peak = (name) => osm.find((e) => e.type === 'node' && e.tags?.name === name);
const landmarks = osm.filter((e) => e.type === 'node' && e.tags?.natural === 'peak' && e.tags.name && parseFloat(e.tags.ele) >= 300 && insideAt(...toPx(e.lat, e.lon)))
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
// © OpenStreetMap contributors (ODbL). Coordenadas do jogo: x = leste, z = SUL, origem no centro do recorte de 28/10.
/** x0/z0 = centro do 1º pixel em coordenadas do jogo (02/11: a grade cresceu pra oeste/sul — a origem segue no centro
 *  do recorte de 28/10, então o mapa não é mais centrado no (0, 0)). */
export const ZS_TERRAIN = { url: '/zona-sul/terrain.png', w: ${W2}, h: ${H2}, cell: ${CELL}, offset: ${H_OFFSET}, scale: ${SCALE}, x0: ${gx2(0.5)}, z0: ${gz2(0.5)} } as const;
export const ZS_SURF = ${JSON.stringify(SURF)} as const;
/** Ruas como textura do chão: R = cobertura, G = posição atravessada na pista. Retângulo em coordenadas do jogo. */
export const ZS_ROAD_MASK = { url: '/zona-sul/roads-mask.png', x0: ${gx2(0)}, z0: ${gz2(0)}, w: ${W2 * CELL}, h: ${H2 * CELL} } as const;
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
  const ci = Math.round(l.x / CELL + A + OX - 0.5), cj = Math.round(l.z / CELL + A + OZ - 0.5);
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
