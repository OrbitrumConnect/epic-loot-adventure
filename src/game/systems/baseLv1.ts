/**
 * Layout PADRÃO do Nível 1 e progresso de construção por recurso (modelo selado:
 * o jogador farma e ENTREGA recurso; a base se ergue sozinha até virar o Lv1
 * padrão — sem colocar muro na mão). Reusa as peças/grade do sistema do Caio.
 *
 * Lv1 = muros no perímetro do claim + 1 porta ao sul. A cama já nasce no claim.
 */
import type { GridCell, PlayerBaseState } from '../types/playerbase';
import { squareCells, cellKey } from './playerBaseSystem';

export type Lv1Piece = { kind: 'wall' | 'door' | 'tower'; cell: GridCell; tier: 1 };

/** Peças do Lv1 padrão: TORRES nos 4 cantos + 1 porta ao sul + muros no resto do
 *  perímetro. As torres são obrigatórias pro estágio `towers` → `clash` abrir. */
export function baseLv1Layout(origin: GridCell, size: number): Lv1Piece[] {
  const maxGx = origin.gx + size - 1;
  const maxGz = origin.gz + size - 1;
  const border = squareCells(origin, size).filter(c =>
    c.gx === origin.gx || c.gx === maxGx || c.gz === origin.gz || c.gz === maxGz);

  const isCorner = (c: GridCell) =>
    (c.gx === origin.gx || c.gx === maxGx) && (c.gz === origin.gz || c.gz === maxGz);

  // Porta: célula da borda sul (menor gz) mais perto do centro em gx (nunca canto).
  const south = border.filter(c => c.gz === origin.gz && !isCorner(c));
  const midGx = origin.gx + Math.floor(size / 2);
  let doorCell: GridCell = south[0] ?? border[0]!;
  let best = Infinity;
  for (const c of south) { const d = Math.abs(c.gx - midGx); if (d < best) { best = d; doorCell = c; } }

  return border.map(c => ({
    kind: (isCorner(c) ? 'tower' : (c.gx === doorCell.gx && c.gz === doorCell.gz ? 'door' : 'wall')) as 'wall' | 'door' | 'tower',
    cell: c,
    tier: 1 as const,
  }));
}

/** Progresso do Lv1: peças do layout já presentes na base / total. */
export function baseLv1Progress(base: PlayerBaseState): { built: number; total: number; pct: number } {
  const layout = baseLv1Layout(base.origin, base.size);
  const have = new Set(base.pieces.map(p => cellKey(p.cell)));
  const built = layout.filter(l => have.has(cellKey(l.cell))).length;
  const total = layout.length;
  return { built, total, pct: total ? Math.round((built / total) * 100) : 100 };
}
