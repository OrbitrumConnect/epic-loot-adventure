import { describe, it, expect } from 'vitest';
import {
  orbitCount, orbitDamage, boomerangPositions, dist2, ORBIT_RADIUS,
  tornadoCount, tornadoDamage, tornadoPositions, TORNADO_RADIUS,
} from '@/game/systems/powerSystem';

describe('powerSystem (bumerangues orbitais)', () => {
  it('nº de lâminas: 0 sem stack, 3 na 1ª escolha, cresce depois', () => {
    expect(orbitCount(0)).toBe(0);
    expect(orbitCount(1)).toBe(3);
    expect(orbitCount(3)).toBe(5);
  });

  it('dano é baixo e cresce com os stacks', () => {
    expect(orbitDamage(1)).toBe(7);
    expect(orbitDamage(2)).toBe(12);
    expect(orbitDamage(1)).toBeLessThan(orbitDamage(3));
  });

  it('as lâminas ficam no raio da órbita ao redor do centro', () => {
    const center = { x: 10, z: -5 };
    const pos = boomerangPositions(center, 3, 0);
    expect(pos).toHaveLength(3);
    for (const p of pos) {
      const r = Math.sqrt(dist2(center, p));
      expect(r).toBeCloseTo(ORBIT_RADIUS);
    }
  });

  it('as lâminas se distribuem (ângulos distintos)', () => {
    const pos = boomerangPositions({ x: 0, z: 0 }, 4, 0);
    const xs = new Set(pos.map((p) => Math.round(p.x * 1000)));
    expect(xs.size).toBeGreaterThan(1);
  });

  it('tornados: 0 sem stack, 1 na 1ª escolha, +1/stack; dano médio', () => {
    expect(tornadoCount(0)).toBe(0);
    expect(tornadoCount(1)).toBe(1);
    expect(tornadoCount(3)).toBe(3);
    expect(tornadoDamage(1)).toBe(10);
    expect(tornadoDamage(2)).toBe(18);
  });

  it('tornados patrulham no anel EXTERNO (maior que o do bumerangue)', () => {
    expect(TORNADO_RADIUS).toBeGreaterThan(ORBIT_RADIUS);
    const center = { x: 0, z: 0 };
    const pos = tornadoPositions(center, 2, 0);
    expect(pos).toHaveLength(2);
    for (const p of pos) expect(Math.sqrt(dist2(center, p))).toBeCloseTo(TORNADO_RADIUS);
  });
});
