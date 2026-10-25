import { describe, expect, it } from 'vitest';
import { createLookTracker } from '@/components/world/touch-look';

/* Pedro, 25/10 (celular): "aperto mirar e a mira não move, eu movo". O giro exigia 1 dedo só na tela;
   com o polegar no joystick (2º toque) era ignorado. Agora segue o dedo que começou na tela de jogo. */
const t = (identifier: number, x = 0, y = 0) => ({ identifier, clientX: x, clientY: y });
const list = (...ts: ReturnType<typeof t>[]) => Object.assign([...ts], { length: ts.length });

describe('mira no celular: joystick + girar ao mesmo tempo', () => {
  it('com o polegar no joystick, o dedo da direita gira a câmera', () => {
    const look = createLookTracker();
    // joystick é outro elemento (não chega aqui); o dedo da direita toca a tela de jogo
    expect(look.start(list(t(7, 300, 200)))).toMatchObject({ identifier: 7 });
    expect(look.move(list(t(7, 320, 190)))).toMatchObject({ clientX: 320 });
  });

  it('mexer/soltar OUTRO dedo não rouba nem solta o giro', () => {
    const look = createLookTracker();
    look.start(list(t(7)));
    expect(look.start(list(t(9)))).toBeNull();        // 2º dedo na tela: ignorado
    expect(look.move(list(t(9, 50, 50)))).toBeNull();  // movimento dele não gira
    expect(look.end(list(t(9)))).toBe(false);          // soltar ele não solta o giro
    expect(look.move(list(t(7, 10, 10)))).not.toBeNull();
    expect(look.end(list(t(7)))).toBe(true);           // soltou o dedo que girava → livre
    expect(look.start(list(t(9)))).toMatchObject({ identifier: 9 });
  });
});
