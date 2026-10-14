import type { BaseType } from '../types/playerbase';

/** Escolha permanente no claim. Bônus não acumulam; legado sem tipo fica em ×1. */
export const BASE_TYPES: Record<BaseType, { name: string; description: string; hp: number; range: number; cost: number }> = {
  fortress: { name: 'Fortaleza', description: '+25% de HP em todas as peças.', hp: 1.25, range: 1, cost: 1 },
  watchpost: { name: 'Atalaia', description: '+20% de alcance nas torres.', hp: 1, range: 1.2, cost: 1 },
  workshop: { name: 'Oficina', description: '25% menos materiais por peça, arredondados para baixo (mínimo 1).', hp: 1, range: 1, cost: 0.75 },
};
export const DEFAULT_BASE_TYPE: BaseType = 'fortress';
