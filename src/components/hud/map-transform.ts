/**
 * Transformada ÚNICA mundo -> mapa, usada por todo marcador, clique e hover.
 *
 * O mundo é um quadrado de -WORLD_HALF a +WORLD_HALF em x e z (metros).
 * O mapa desenha esse quadrado, centralizado e com `pad` px de margem, dentro de
 * uma área de w x h px. Convenção: x cresce para a direita, z cresce PARA BAIXO
 * (a mesma do mapa antigo: norte = -z = topo).
 *
 *   px = ox + (x + WORLD_HALF) * scale
 *   py = oy + (z + WORLD_HALF) * scale
 *   scale = side / (2 * WORLD_HALF)
 *   side  = min(w, h) - 2 * pad ;  ox = (w - side) / 2 ; oy = (h - side) / 2
 *
 * A inversa (fromView) é o mesmo cálculo ao contrário e devolve `null` fora do quadrado.
 */
export const WORLD_HALF = 45;

export type MapFrame = { w: number; h: number; ox: number; oy: number; side: number; scale: number };

export function makeFrame(w: number, h: number, pad: number): MapFrame {
  const side = Math.max(10, Math.min(w, h) - 2 * pad);
  return { w, h, ox: (w - side) / 2, oy: (h - side) / 2, side, scale: side / (2 * WORLD_HALF) };
}

export function toView(f: MapFrame, x: number, z: number): [number, number] {
  return [f.ox + (x + WORLD_HALF) * f.scale, f.oy + (z + WORLD_HALF) * f.scale];
}

export function fromView(f: MapFrame, px: number, py: number): { x: number; z: number } | null {
  const x = (px - f.ox) / f.scale - WORLD_HALF;
  const z = (py - f.oy) / f.scale - WORLD_HALF;
  if (x < -WORLD_HALF || x > WORLD_HALF || z < -WORLD_HALF || z > WORLD_HALF) return null;
  return { x, z };
}
