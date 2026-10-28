/**
 * Onde dá pra ANDAR (Pedro 28/10: "liberar a parede invisível do mapa"). Antes: quadrado fixo de ±MAP_HALF (90 m),
 * no meio de uma ilha que vai até 115–190 m. Agora: o quadrado continua todo liberado (zero regressão) e, fora dele,
 * vale a área medida em tools/bake-walk-area.mjs → chão do GLB acima da água, 3 m de folga da beirada, ligada ao meio.
 * O chão em si já era a malha do GLB (`glbSurfaceY`): andar lá fora pisa na mesma malha que aparece na tela.
 */
import { MAP_WALK, MAP_WALK_ROWS } from './map-walk-area';

const { cell, x0, z0, w, h, inner } = MAP_WALK;
const grid = new Uint8Array(w * h);
MAP_WALK_ROWS.forEach((runs, j) => {
  for (let k = 0; k + 1 < runs.length; k += 2) grid.fill(1, j * w + runs[k]!, j * w + runs[k + 1]!);
});

/** Pode pisar em (x, z)? Dentro de ±90 m sempre (como antes); fora, só na área medida. */
export function isWalkable(x: number, z: number): boolean {
  if (Math.abs(x) <= inner && Math.abs(z) <= inner) return true;
  const i = Math.floor((x - x0) / cell), j = Math.floor((z - z0) / cell);
  if (i < 0 || j < 0 || i >= w || j >= h) return false;
  return grid[j * w + i] === 1;
}

/**
 * Passo de (ox, oz) para (nx, nz) respeitando a área: se o destino não dá, DESLIZA no eixo que dá (anda rente à
 * borda, sem travar); se nenhum dá, fica onde está. Se já está fora (ex.: empurrão, posição antiga salva), deixa
 * mover só se for em direção ao centro — nunca prende e nunca vai mais pra fora.
 */
export function walkStep(ox: number, oz: number, nx: number, nz: number): [number, number] {
  if (isWalkable(nx, nz)) return [nx, nz];
  if (!isWalkable(ox, oz)) return nx * nx + nz * nz < ox * ox + oz * oz ? [nx, nz] : [ox, oz];
  if (isWalkable(nx, oz)) return [nx, oz];
  if (isWalkable(ox, nz)) return [ox, nz];
  return [ox, oz];
}
