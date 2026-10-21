/**
 * Input virtual compartilhado (mobile). O joystick da tela escreve um vetor analógico aqui e o
 * laço de movimento do herói (game-world.tsx) SOMA esse vetor ao WASD — sem tocar na lógica de
 * teclado (zero regressão no desktop). `x`: direita+ (= tecla D), `z`: baixo+ (= tecla S), ambos
 * em -1..1. Fora de uso fica em 0,0. É um singleton de módulo (não passa por React) pra o toque
 * não disparar re-render por quadro.
 */
export const virtualMove = { x: 0, z: 0 };

export function setVirtualMove(x: number, z: number): void {
  virtualMove.x = x;
  virtualMove.z = z;
}

export function clearVirtualMove(): void {
  virtualMove.x = 0;
  virtualMove.z = 0;
}
