// ÁREA ANDÁVEL fora do quadrado de ±90 m (Pedro 28/10: "liberar a parede invisível, andar lá fora sobre a malha").
// Gera src/components/world/map-walk-area.ts (linhas em trechos) + uma imagem de conferência (opcional).
// Rodar de novo se o mapa GLB mudar:  node tools/bake-walk-area.mjs [conferencia.png]
//
// Regra por célula de 0,5 m (mede o MESMO chão que o jogo pisa — tools/map-glb.mjs):
//  - tem chão do GLB e ele está ACIMA da água (−2,35 m): fora = vazio, saia da beira (−11 m) ou faixa de MAR pintada;
//  - folga de MARGEM m de qualquer célula sem chão (nunca pisa na beirada e cai);
//  - ligada ao meio do mapa (sem bolsão solto);
//  - dentro de ±90 m o jogo continua liberando TUDO como antes (zero regressão) — aqui só conta o lado de fora.
import fs from 'node:fs';
import sharp from 'sharp';
import { loadMapGround } from './map-glb.mjs';

const CELL = 0.5, WATER_Y = -2.35, MARGIN = 3, INNER = 90;
const [outPng] = process.argv.slice(2);
const { box, heightAt } = loadMapGround();

const x0 = Math.floor(box.min.x) - 1, z0 = Math.floor(box.min.z) - 1;
const W = Math.ceil((box.max.x + 1 - x0) / CELL), H = Math.ceil((box.max.z + 1 - z0) / CELL);
const cx = (i) => x0 + (i + 0.5) * CELL, cz = (j) => z0 + (j + 0.5) * CELL;
const inner = (i, j) => Math.abs(cx(i)) <= INNER && Math.abs(cz(j)) <= INNER;

// 1) chão acima da água
const ground = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  const h = heightAt(cx(i), cz(j));
  if (h !== null && h > WATER_Y) ground[j * W + i] = 1;
}
// 2) folga: célula fica só se NÃO há buraco dentro do raio MARGEM (fora do quadrado interno)
const R = Math.ceil(MARGIN / CELL), offs = [];
for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) if (di * di + dj * dj <= R * R) offs.push([di, dj]);
const safe = new Uint8Array(W * H);
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  if (inner(i, j)) { safe[j * W + i] = 1; continue; }
  if (!ground[j * W + i]) continue;
  let ok = 1;
  for (const [di, dj] of offs) {
    const a = i + di, b = j + dj;
    if (a < 0 || b < 0 || a >= W || b >= H || (!ground[b * W + a] && !inner(a, b))) { ok = 0; break; }
  }
  safe[j * W + i] = ok;
}
// 3) ligada ao meio (inundação a partir do quadrado interno)
const walk = new Uint8Array(W * H), stack = [];
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) if (inner(i, j)) { walk[j * W + i] = 1; stack.push(j * W + i); }
while (stack.length) {
  const p = stack.pop(), i = p % W, j = (p - i) / W;
  for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
    if (a < 0 || b < 0 || a >= W || b >= H) continue;
    const q = b * W + a;
    if (!walk[q] && safe[q]) { walk[q] = 1; stack.push(q); }
  }
}
// 4) linhas em trechos [início, fim) — só o LADO DE FORA importa, mas grava a linha inteira (simples de ler)
const rows = [];
let outside = 0;
for (let j = 0; j < H; j++) {
  const runs = [];
  for (let i = 0; i < W; i++) if (walk[j * W + i] && !inner(i, j)) outside++;
  for (let i = 0; i < W; i++) {
    if (!walk[j * W + i]) continue;
    const s = i;
    while (i < W && walk[j * W + i]) i++;
    runs.push(s, i);
  }
  rows.push(runs);
}
fs.writeFileSync('src/components/world/map-walk-area.ts', `// GERADO por tools/bake-walk-area.mjs — não editar à mão; rode a ferramenta de novo se o mapa GLB mudar.
// Onde dá pra ANDAR fora do quadrado de ±${INNER} m: chão do GLB acima da água (${WATER_Y} m), ${MARGIN} m de folga da beirada,
// ligado ao meio. Célula de ${CELL} m; coluna = x0 + i·${CELL}, linha = z0 + j·${CELL}; cada linha = trechos [início, fim).
export const MAP_WALK = { cell: ${CELL}, x0: ${x0}, z0: ${z0}, w: ${W}, h: ${H}, inner: ${INNER} };
export const MAP_WALK_ROWS: number[][] = ${JSON.stringify(rows)};
`);
const m2 = (n) => Math.round(n * CELL * CELL);
console.log(JSON.stringify({ grade: `${W}x${H} (${CELL} m)`, ladoDeFora_m2: m2(outside), quadradoAtual_m2: (2 * INNER) ** 2,
  ganho: `+${Math.round(100 * m2(outside) / (2 * INNER) ** 2)}%` }));

if (outPng) { // conferência: verde = já andava; azul-claro = NOVO; cinza = chão sem acesso; rosa = vazio/mar
  const img = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = ((H - 1 - j) * W + i) * 3, k = j * W + i;
    const c = inner(i, j) ? [60, 140, 60] : walk[k] ? [80, 200, 255] : ground[k] ? [120, 120, 120] : [200, 50, 170];
    img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2];
  }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(outPng);
}
