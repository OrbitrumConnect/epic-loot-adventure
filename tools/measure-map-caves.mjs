// CAVERNAS/TÚNEIS do mapa GLB (28/10, Pedro: "não consigo entrar nas caves, ando por cima"). Só LÊ — não muda o jogo.
// Por célula de 0,5 m: raio vertical com TODOS os acertos; onde há chão com ESPAÇO LIVRE ≥ ALTURA_LIVRE m até a
// próxima superfície de cima (teto de rocha), é piso de caverna. Saída: totais, grupos (onde ficam) e imagem.
// Uso: node tools/measure-map-caves.mjs [saida.png]
// Grava também src/components/world/map-caves.ts (caixa de cada caverna + folga): onde o jogo trata parede de caverna.
import fs from 'node:fs';
import sharp from 'sharp';
import * as THREE from 'three';
import { loadMapGround } from './map-glb.mjs';

const CELL = 0.5, FREE = 1.9; // herói ~1,8 m
const [outPng] = process.argv.slice(2);
const { box, mesh } = loadMapGround();
const ray = new THREE.Raycaster();
const down = new THREE.Vector3(0, -1, 0), o = new THREE.Vector3();
const x0 = Math.floor(box.min.x), z0 = Math.floor(box.min.z);
const W = Math.ceil((box.max.x - x0) / CELL), H = Math.ceil((box.max.z - z0) / CELL);
const cave = new Uint8Array(W * H), floorY = new Float32Array(W * H), ceilY = new Float32Array(W * H);
let cells = 0;
for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
  o.set(x0 + (i + 0.5) * CELL, box.max.y + 5, z0 + (j + 0.5) * CELL); ray.set(o, down);
  const ys = ray.intersectObject(mesh, false).map((h) => h.point.y);
  // pares (teto em cima, chão embaixo) com espaço livre — pega o mais baixo (piso do túnel)
  for (let k = ys.length - 1; k > 0; k--) {
    const fl = ys[k], up = ys[k - 1];
    if (up - fl >= FREE && fl > -2.35) { cave[j * W + i] = 1; floorY[j * W + i] = fl; ceilY[j * W + i] = up; cells++; break; }
  }
}
// grupos (4-vizinhos)
const seen = new Uint8Array(W * H), groups = [];
for (let p = 0; p < W * H; p++) {
  if (!cave[p] || seen[p]) continue;
  const st = [p]; seen[p] = 1; let n = 0, sx = 0, sz = 0, fmin = Infinity, fmax = -Infinity, cmin = Infinity;
  let bx0 = Infinity, bx1 = -Infinity, bz0 = Infinity, bz1 = -Infinity;
  while (st.length) {
    const q = st.pop(), i = q % W, j = (q - i) / W; n++; sx += x0 + (i + .5) * CELL; sz += z0 + (j + .5) * CELL;
    bx0 = Math.min(bx0, x0 + i * CELL); bx1 = Math.max(bx1, x0 + (i + 1) * CELL);
    bz0 = Math.min(bz0, z0 + j * CELL); bz1 = Math.max(bz1, z0 + (j + 1) * CELL);
    fmin = Math.min(fmin, floorY[q]); fmax = Math.max(fmax, floorY[q]); cmin = Math.min(cmin, ceilY[q] - floorY[q]);
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= W || b >= H) continue; const r = b * W + a;
      if (cave[r] && !seen[r]) { seen[r] = 1; st.push(r); }
    }
  }
  if (n * CELL * CELL >= 4) groups.push({ m2: Math.round(n * CELL * CELL), x: +(sx / n).toFixed(1), z: +(sz / n).toFixed(1), piso: [+fmin.toFixed(1), +fmax.toFixed(1)], alturaLivreMin: +cmin.toFixed(1), box: [bx0, bz0, bx1, bz1] });
}
groups.sort((a, b) => b.m2 - a.m2);
const PAD = 6; // folga em volta do piso: pega a boca e as paredes
fs.writeFileSync('src/components/world/map-caves.ts', `// GERADO por tools/measure-map-caves.mjs — não editar à mão; rode a ferramenta de novo se o mapa GLB mudar.
// Caixa [x0, z0, x1, z1] de cada caverna/túnel da malha do mapa (+${PAD} m de folga): onde parede de caverna é PAREDE.
export const MAP_CAVES: [number, number, number, number][] = ${JSON.stringify(groups.map((g) => [g.box[0] - PAD, g.box[1] - PAD, g.box[2] + PAD, g.box[3] + PAD].map((v) => +v.toFixed(1))))};
`);
console.log(JSON.stringify({ pisoDeCaverna_m2: Math.round(cells * CELL * CELL), grupos: groups.slice(0, 15) }, null, 1));
if (outPng) {
  const img = Buffer.alloc(W * H * 3);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const p = ((H - 1 - j) * W + i) * 3, x = x0 + (i + .5) * CELL, z = z0 + (j + .5) * CELL;
    const c = cave[j * W + i] ? [255, 60, 30] : (Math.abs(Math.abs(x) - 90) < 0.3 && Math.abs(z) <= 90) || (Math.abs(Math.abs(z) - 90) < 0.3 && Math.abs(x) <= 90) ? [255, 255, 255] : [40, 60, 40];
    img[p] = c[0]; img[p + 1] = c[1]; img[p + 2] = c[2];
  }
  await sharp(img, { raw: { width: W, height: H, channels: 3 } }).png().toFile(outPng);
}
