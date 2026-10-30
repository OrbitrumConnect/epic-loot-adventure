import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shipGround, SHIP, SHIP_STEP, type ShipCollider } from '@/components/zona-sul/zs-ship';

/* Pedro 29/10: "o navio fica entre Ipanema e Leblon, meio na água… é acessível, colisão". Navio sem giro (pra conta
   ficar clara): convés a 1,5 m numa grade 4×4 de 1 m; prancha da areia (z = −6, y = 0,4) até o bordo (z = −2, y = 1,5). */
const c: ShipCollider = {
  cx: 0, cz: 0, cos: 1, sin: 0, u0: -2, v0: -2, nu: 4, nv: 4, cell: 1, deck: new Float32Array(16).fill(1.5),
  plank: { ax: 0, az: -2, ay: 1.5, bx: 0, bz: -6, by: 0.4, halfW: 1.1 },
};

describe('navio — convés é chão, casco é parede, prancha é rampa', () => {
  it('em pé no convés: anda no convés (mesmo com o mar embaixo)', () => {
    expect(shipGround(c, 0.5, 0.5, 1.5)).toEqual({ y: 1.5 });
  });
  it('vindo nadando (pés na água): o casco é PAREDE', () => {
    expect(shipGround(c, 0.5, 0.5, -0.1)).toEqual({ wall: true });
  });
  it('prancha: a altura sobe da areia até o bordo; fora da largura dela não vale', () => {
    const meio = shipGround(c, 0, -4, 0.9) as { y: number };
    expect(meio.y).toBeCloseTo(0.95, 2);
    expect(shipGround(c, 0, -5.9, 0.4)).toMatchObject({ y: expect.any(Number) });
    expect(shipGround(c, 3, -4, 0.9)).toBeNull(); // do lado da prancha: chão normal
  });
  it('fora do navio: chão normal (null); sem navio carregado: null', () => {
    expect(shipGround(c, 10, 10, 0)).toBeNull();
    expect(shipGround(null, 0, 0, 0)).toBeNull();
  });
  it('degrau que dá pra subir andando = o mesmo do Vale (0,75 m); navio entre Ipanema e Leblon; na cena', () => {
    expect(SHIP_STEP).toBe(0.75);
    expect(SHIP.x).toBeLessThan(-400); expect(SHIP.x).toBeGreaterThan(-480); // em frente ao canal do Jardim de Alah
    expect(fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8')).toContain('<ZsShip t={t} />');
  });
});
