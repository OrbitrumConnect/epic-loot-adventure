/**
 * O que o herói da Zona Sul está fazendo AGORA, pra casa do jogo decidir teclas de duplo sentido sem carregar o mundo
 * 3D (este arquivo é minúsculo). Ex.: C = mergulhar (na água) / descer o carro (dirigindo) — senão é o Raio do jogo.
 */
export const zsCtx = { inWater: false, driving: false };
/** Ataque da casa do jogo (`hitNearest`) — o clique esquerdo do mundo chama. */
export const zsAttack: { fn: (() => void) | null } = { fn: null };
