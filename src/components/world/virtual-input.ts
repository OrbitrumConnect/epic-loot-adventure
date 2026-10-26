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

/**
 * OLHAR virtual (Pedro 26/10: "o ATACAR grande pode ser um joystick de câmera: arrastar olha pros lados/cima, o
 * toque atira"). O botão soma aqui o quanto o dedo arrastou (px) e a câmera (game-world) consome 1× por quadro com a
 * MESMA sensibilidade do arrasto na tela. Singleton de módulo, sem React.
 */
export const virtualLook = { dx: 0, dy: 0 };
export function addVirtualLook(dx: number, dy: number): void {
  virtualLook.dx += dx;
  virtualLook.dy += dy;
}
/** Devolve o arrasto acumulado e zera (chamado pela câmera a cada quadro). */
export function takeVirtualLook(): { dx: number; dy: number } {
  const out = { dx: virtualLook.dx, dy: virtualLook.dy };
  virtualLook.dx = 0;
  virtualLook.dy = 0;
  return out;
}

/** Controles de TOQUE na tela? (o `MobileControls` liga ao montar). Câmera de ombro do celular põe o herói à ESQUERDA
 *  (Pedro 26/10: "o herói fica atrás dos botões, do lado direito — melhor do outro lado"). PC: igual. */
export const touchLayout = { on: false };
export function setTouchLayout(on: boolean): void { touchLayout.on = on; }
