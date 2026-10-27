// Encaixe da paisagem de fundo na BORDA REAL da ilha GLB (27/10). Gera:
//  - public/assets/map-edge/plateau-mask.png → máscara vista de cima do PLATÔ da ilha (chão do GLB acima de −5 m);
//  - src/components/world/map-edge-contour.ts → por direção (720), onde o platô acaba e a altura dele ali.
// Rodar de novo se o mapa GLB mudar: node tools/bake-map-edge.mjs
//
// Por que máscara (medido 27/10): a borda do GLB é recortada em 2D — a "saia" do bloco às vezes cai e deixa
// prateleira a −11 m, às vezes desce em rampa por 6 m; qualquer regra só por direção erra ENTRE as direções
// (anel por cima do chão ou fresta). Com a máscara o anel NÃO desenha onde há platô (pixel a pixel) e cobre o resto
// (saia + vazio). A altura do anel na emenda = altura do platô ali → sem degrau.
import fs from 'node:fs';
import sharp from 'sharp';
import { loadMapGround } from './map-glb.mjs';

const SEG = 720, FOOT_Y = -5, CELL = 0.5;
const { box, heightAt } = loadMapGround();
const along = (a, r) => heightAt(Math.cos(a) * r, Math.sin(a) * r);
const ang = (s) => s / SEG * Math.PI * 2;
const plateau = (h) => h !== null && h > FOOT_Y;

// 1) Máscara do platô (linha j = z0 + j·CELL, coluna i = x0 + i·CELL; sem flip).
const x0 = Math.floor(box.min.x) - 1, z0 = Math.floor(box.min.z) - 1;
const MW = Math.ceil((box.max.x + 1 - x0) / CELL), MH = Math.ceil((box.max.z + 1 - z0) / CELL);
const mask = Buffer.alloc(MW * MH);
for (let j = 0; j < MH; j++) for (let i = 0; i < MW; i++) {
  if (plateau(heightAt(x0 + (i + 0.5) * CELL, z0 + (j + 0.5) * CELL))) mask[j * MW + i] = 255;
}
fs.mkdirSync('public/assets/map-edge', { recursive: true });
await sharp(mask, { raw: { width: MW, height: MH, channels: 1 } }).png({ compressionLevel: 9 }).toFile('public/assets/map-edge/plateau-mask.png');

// 2) Por direção: borda do platô (último ponto acima de −5 m vindo de fora, a 5 cm) e a altura dele.
function plateauEdge(a) {
  let r = 262;
  while (r > 40 && !plateau(along(a, r))) r -= 0.5;
  let lo = r, hi = r + 0.5;
  while (hi - lo > 0.05) { const m = (lo + hi) / 2; if (plateau(along(a, m))) lo = m; else hi = m; }
  return { r: lo, y: along(a, lo) };
}
const edges = Array.from({ length: SEG }, (_, s) => plateauEdge(ang(s)));
const halfs = Array.from({ length: SEG }, (_, s) => plateauEdge(ang(s + 0.5)));
// Altura da emenda: a MENOR entre a direção e os dois meios vizinhos (−6 cm). Entre duas direções o anel é a média
// delas → nunca fica ACIMA da beirada (um "lábio" solto deixaria ver o vazio por baixo); no máximo um degrau pra baixo.
const yEdge = edges.map((e, s) => Math.min(e.y, halfs[s].y, halfs[(s + SEG - 1) % SEG].y) - 0.06);
// Começo do anel: 2 m pra DENTRO da borda mais curta entre as vizinhas (a máscara esconde essa parte).
const rStart = edges.map((_, s) => Math.min(...[-2, -1, 0, 1, 2].map((d) => edges[(s + d + SEG) % SEG].r)) - 2);
const rEdge = edges.map((e) => e.r);

// Conferência ENTRE as direções: (a) o anel começa antes da borda (sem fresta pro vazio);
// (b) degrau na emenda = altura do anel ali × altura do platô na borda dele.
let cracks = 0; const steps = [];
for (let s = 0; s < SEG; s++) {
  const n = (s + 1) % SEG, q = halfs[s];
  if ((rStart[s] + rStart[n]) / 2 > q.r) cracks++;
  steps.push(q.y - (yEdge[s] + yEdge[n]) / 2); // > 0 = anel abaixo da beirada (degrau pra baixo); < 0 = lábio
}
const lips = steps.filter((v) => v < -0.01).length;
const r2 = (v) => +v.toFixed(2);
fs.writeFileSync('src/components/world/map-edge-contour.ts', `// GERADO por tools/bake-map-edge.mjs (borda REAL da ilha GLB) — não editar à mão; rode a ferramenta de novo.
// Índice i = direção i/${SEG} da volta (ângulo atan2(z, x)).
//  - START: onde o anel começa (2 m DENTRO do platô — a máscara esconde essa parte);
//  - EDGE: onde o platô acaba (o anel fica visível dali pra fora); Y: altura do platô na borda (o anel emenda nela).
export const MAP_EDGE_SEG = ${SEG};
export const MAP_EDGE_START = [${rStart.map(r2).join(', ')}];
export const MAP_EDGE_R = [${rEdge.map(r2).join(', ')}];
export const MAP_EDGE_Y = [${yEdge.map(r2).join(', ')}];
/** Máscara do platô vista de cima (branco = chão da ilha acima de ${FOOT_Y} m): coluna = x, linha = z, sem flip. */
export const MAP_PLATEAU_MASK = { url: '/assets/map-edge/plateau-mask.png', x0: ${x0}, z0: ${z0}, w: ${MW * CELL}, h: ${MH * CELL} };
`);
const hist = (arr, cuts) => cuts.map((c, i) => `${i ? cuts[i - 1] : 0}–${c} m: ${arr.filter((v) => v >= (i ? cuts[i - 1] : 0) && v < c).length}`).join(' | ');
console.log(JSON.stringify({
  direcoes: SEG, mascara: `${MW}x${MH} (${CELL} m)`,
  raioBorda: [Math.min(...rEdge).toFixed(1), Math.max(...rEdge).toFixed(1)],
  alturaEmenda: [Math.min(...yEdge).toFixed(2), Math.max(...yEdge).toFixed(2)],
  frestasProVazio: cracks, labiosAcimaDaBeirada: lips,
}));
console.log('degrau na emenda (entre direções):', hist(steps, [0.1, 0.25, 0.5, 1, 2, 99]));
