/**
 * Qual dedo GIRA a câmera no celular: o primeiro que começou NA TELA DE JOGO, seguido pelo identificador.
 * Antes o giro exigia 1 dedo só na tela inteira → com o polegar no joystick (2º toque) a câmera/mira não
 * mexia (Pedro, 25/10: "aperto mirar e a mira não move, eu movo"). Agora joystick + girar ao mesmo tempo.
 */
type TouchLike = { identifier: number; clientX: number; clientY: number };
type ListLike = { length: number; [i: number]: TouchLike };

export function createLookTracker() {
  let id: number | null = null;
  const find = (list: ListLike): TouchLike | null => {
    for (let i = 0; i < list.length; i++) if (list[i]!.identifier === id) return list[i]!;
    return null;
  };
  return {
    /** touchstart no canvas: adota o dedo novo se ninguém estiver girando. */
    start(changed: ListLike): TouchLike | null {
      if (id !== null || changed.length === 0) return null;
      id = changed[0]!.identifier;
      return changed[0]!;
    },
    /** touchmove: o toque do dedo que gira (ou null se quem mexeu foi outro dedo). */
    move(changed: ListLike): TouchLike | null { return id === null ? null : find(changed); },
    /** touchend/cancel: true se foi o dedo que girava (aí libera). */
    end(changed: ListLike): boolean {
      if (id === null || !find(changed)) return false;
      id = null;
      return true;
    },
  };
}
