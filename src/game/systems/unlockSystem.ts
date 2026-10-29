/**
 * LIBERAÇÃO POR NÍVEL (Pedro 29/10: "os itens liberam com nível — o carrinho é nível 25, a prancha nível 5, o fuzil só
 * libera no 35; vou pôr outras coisas também"). Fonte ÚNICA: pra travar algo novo é só pôr aqui.
 *  - Item travado NÃO some: fica na mochila (cadeado e "Nv N" na hotbar/ficha) e só não vai pra mão/equipa.
 *  - Nível é PREPARO (regra selada "nível não é porta" vale pro PERIGO do mapa): aqui é recompensa de progressão.
 */
export const UNLOCK_LEVEL: Readonly<Record<string, number>> = {
  surfboard: 5,
  /** asa-delta (planejada, Pedro 29/10) — trava já vale quando entrar */
  hang_glider: 8,
  /** skate voador (planejado, Pedro 29/10) */
  hover_skate: 15,
  /** carro voador da Zona Sul (não é item de mochila: é o veículo do mapa) */
  flying_car: 25,
  rifle: 35,
};

/** Nível que libera `id` (1 = livre). */
export function unlockLevel(id: string | null | undefined): number {
  return (id && UNLOCK_LEVEL[id]) || 1;
}

export function isUnlocked(id: string | null | undefined, level: number): boolean {
  return level >= unlockLevel(id);
}

export function lockedMessage(name: string, id: string): string {
  return `🔒 ${name} libera no nível ${unlockLevel(id)}.`;
}
