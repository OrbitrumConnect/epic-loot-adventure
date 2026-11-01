import { create } from 'zustand';

/**
 * O que o herói da Zona Sul está fazendo AGORA, pra casa do jogo decidir teclas de duplo sentido sem carregar o mundo
 * 3D (este arquivo é minúsculo). Ex.: C = mergulhar (na água) / descer o carro (dirigindo) — senão é o Raio do jogo.
 */
export const zsCtx = { inWater: false, driving: false };
/** CELULAR (31/10): o momento que muda os botões do arco (dirigindo / perto do carro / nadando). O herói escreve só
 *  quando MUDA — a tela não re-renderiza por quadro. */
export const useZsTouch = create<{ driving: boolean; nearCar: boolean; inWater: boolean }>(() => ({ driving: false, nearCar: false, inWater: false }));
/** CAVERNA (30/10): o herói escreve todo quadro. `dark` 0..1 = quão fundo (escurece o mundo, liga a lanterna);
 *  `near` = perto de uma boca ou dentro (a caverna desenha); `deep` = tão fundo que a superfície nem desenha. */
export const zsCave = { inCave: false, dark: 0, near: false, deep: false,
  /** a mais de 20 m de uma boca: o MAR some na hora (o plano da água em y = 0 cortava o túnel abaixo do nível do mar) */
  seaOff: false };
/** Ataque da casa do jogo (`hitNearest`) — o clique esquerdo do mundo chama. */
export const zsAttack: { fn: (() => void) | null } = { fn: null };
