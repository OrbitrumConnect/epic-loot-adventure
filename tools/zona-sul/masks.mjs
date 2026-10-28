// Máscaras da Zona Sul num grid (W×H, toPx = lat/lon → pixel): MAR (pela linha da costa do OSM), ÁGUA interna
// (Lagoa/rios, com as ilhas internas de fora) e MATA (floresta/parque/reserva). Usado pela vista e pelo mundo.
import fs from 'node:fs';

const osm = () => JSON.parse(fs.readFileSync('tools/zona-sul/raw/osm.json', 'utf8')).elements;

function fillRing(mask, ring, W, H, toPx, value = 1) {
  const pts = ring.map((g) => toPx(g.lat, g.lon));
  if (pts.length < 3) return;
  for (let j = 0; j < H; j++) {
    const y = j + 0.5, xs = [];
    for (let k = 0, l = pts.length - 1; k < pts.length; l = k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[l];
      if ((y1 > y) !== (y2 > y)) xs.push(x1 + (y - y1) / (y2 - y1) * (x2 - x1));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) for (let i = Math.max(0, Math.ceil(xs[k] - 0.5)); i < Math.min(W, xs[k + 1] - 0.5); i++) mask[j * W + i] = value;
  }
}
/** Emenda trechos (membros de relação vêm em pedaços) em ANÉIS fechados; pedaço que não fecha é descartado
 *  (preencher anel aberto risca uma linha reta no mapa — era a "linha" de São Conrado). */
export function joinRings(parts) {
  const key = (g) => `${g.lat},${g.lon}`;
  const open = parts.filter((p) => p.length >= 2).map((p) => p.slice());
  const rings = [];
  while (open.length) {
    let cur = open.pop();
    let grew = true;
    while (key(cur[0]) !== key(cur[cur.length - 1]) && grew) {
      grew = false;
      for (let k = 0; k < open.length; k++) {
        const p = open[k], end = key(cur[cur.length - 1]);
        if (key(p[0]) === end) { cur = cur.concat(p.slice(1)); }
        else if (key(p[p.length - 1]) === end) { cur = cur.concat(p.slice(0, -1).reverse()); }
        else continue;
        open.splice(k, 1); grew = true; break;
      }
    }
    if (key(cur[0]) === key(cur[cur.length - 1]) && cur.length >= 4) rings.push(cur);
  }
  return rings;
}
const ringsOf = (el, role) => el.type === 'way'
  ? (role === 'outer' ? joinRings([el.geometry]) : [])
  : joinRings((el.members ?? []).filter((m) => m.role === role && m.geometry).map((m) => m.geometry));

export function buildMasks(W, H, toPx) {
  const els = osm();
  const water = new Uint8Array(W * H), forest = new Uint8Array(W * H), sea = new Uint8Array(W * H);
  for (const el of els) {
    const t = el.tags ?? {};
    if (t.natural === 'water') { for (const r of ringsOf(el, 'outer')) fillRing(water, r, W, H, toPx, 1); for (const r of ringsOf(el, 'inner')) fillRing(water, r, W, H, toPx, 0); }
    if (t.landuse === 'forest' || t.natural === 'wood' || t.leisure === 'nature_reserve' || t.leisure === 'park') for (const r of ringsOf(el, 'outer')) fillRing(forest, r, W, H, toPx, 1);
  }
  // MAR: costa = barreira que divide o grid em REGIÕES. No OSM o mar fica à DIREITA do sentido da costa: cada trecho
  // vota "mar" num ponto à direita e "terra" num ponto à esquerda; cada região vira o que tiver mais votos. (Uma
  // semente só falhava: nas pedras do Arpoador a costa faz curva fechada e o ponto "do mar" caía em terra → tudo mar.)
  const wall = new Uint8Array(W * H), votes = [];
  for (const el of els) {
    if (el.tags?.natural !== 'coastline') continue;
    const pts = el.geometry.map((g) => toPx(g.lat, g.lon));
    for (let k = 0; k + 1 < pts.length; k++) {
      const [x1, y1] = pts[k], [x2, y2] = pts[k + 1], len = Math.hypot(x2 - x1, y2 - y1) || 1;
      for (let s = 0; s <= len * 2; s++) {
        const x = Math.round(x1 + (x2 - x1) * s / (len * 2)), y = Math.round(y1 + (y2 - y1) * s / (len * 2));
        if (x >= 0 && y >= 0 && x < W && y < H) wall[y * W + x] = 1;
      }
      // tela com y pra baixo: direita do sentido (dx, dy) = (−dy, dx)
      const nx = -(y2 - y1) / len, ny = (x2 - x1) / len, cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
      for (const d of [1.5, 3]) { votes.push([Math.round(cx + nx * d), Math.round(cy + ny * d), 1]); votes.push([Math.round(cx - nx * d), Math.round(cy - ny * d), -1]); }
    }
  }
  const region = new Int32Array(W * H).fill(-1);
  let nReg = 0;
  for (let p0 = 0; p0 < W * H; p0++) {
    if (wall[p0] || region[p0] >= 0) continue;
    const st = [p0]; region[p0] = nReg;
    while (st.length) {
      const p = st.pop(), i = p % W, j = (p - i) / W;
      for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
        if (a < 0 || b < 0 || a >= W || b >= H) continue;
        const q = b * W + a;
        if (!wall[q] && region[q] < 0) { region[q] = nReg; st.push(q); }
      }
    }
    nReg++;
  }
  const score = new Float64Array(nReg);
  for (const [x, y, v] of votes) if (x >= 0 && y >= 0 && x < W && y < H && region[y * W + x] >= 0) score[region[y * W + x]] += v;
  for (let p = 0; p < W * H; p++) sea[p] = !wall[p] && region[p] >= 0 && score[region[p]] > 0 ? 1 : 0;
  // a própria linha da costa: vira o que a MAIORIA dos vizinhos é (senão um traço de costa em terra virava "mar")
  for (let p = 0; p < W * H; p++) {
    if (!wall[p]) continue;
    const i = p % W, j = (p - i) / W; let s = 0, n = 0;
    for (let b = -2; b <= 2; b++) for (let a = -2; a <= 2; a++) {
      const x = i + a, y = j + b; if (x < 0 || y < 0 || x >= W || y >= H || wall[y * W + x]) continue;
      n++; s += sea[y * W + x];
    }
    sea[p] = n > 0 && s * 2 > n ? 1 : 0;
  }
  return { sea, water, forest };
}
