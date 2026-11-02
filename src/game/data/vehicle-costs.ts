/**
 * CUSTO DOS VEÍCULOS (Pedro 01/11: "custa recurso prancha, skate, asa-delta, carro e navio — sai da bolsa normal igual
 * à base, precisa ter pra buildar"; "skate, asa e prancha ficam no loot; carro e navio buildo, ficam no mundo com vida,
 * explodiu/afundou builda outro com recurso"; depois "recurso pode ser 2× mais, progredindo — os de nível mais alto 3×").
 * Fonte ÚNICA (receitas, construir carro/navio, testes). O NÍVEL que libera cada um continua o do unlockSystem
 * (prancha 5, asa 8, skate 15, carro 25, navio 45) — antes do nível a receita fica travada (não gasta à toa).
 * Base da tabela proposta (01/11) × 2 (prancha, asa) · × 2,5 (skate) · × 3 (carro, navio).
 */
export type Cost = readonly { id: string; n: number }[];

export const VEHICLE_COST = {
  surfboard: [{ id: 'wood', n: 40 }, { id: 'sinew', n: 4 }],
  hang_glider: [{ id: 'wood', n: 60 }, { id: 'wolf_pelt', n: 8 }, { id: 'sinew', n: 8 }],
  hover_skate: [{ id: 'iron_ore', n: 50 }, { id: 'stone', n: 25 }],
  flying_car: [{ id: 'iron_ore', n: 180 }, { id: 'wood', n: 120 }, { id: 'stone', n: 90 }],
  war_ship: [{ id: 'wood', n: 600 }, { id: 'iron_ore', n: 240 }, { id: 'stone', n: 120 }],
} as const satisfies Record<string, Cost>;

/** Nome curto em português dos materiais (mensagens "falta ..."). */
export const MATERIAL_NAME: Record<string, string> = {
  wood: 'madeira', stone: 'pedra', iron_ore: 'ferro', sinew: 'tendão', wolf_pelt: 'pele de lobo',
};
export function costText(cost: Cost): string {
  return cost.map((c) => `${c.n} ${MATERIAL_NAME[c.id] ?? c.id}`).join(' + ');
}
