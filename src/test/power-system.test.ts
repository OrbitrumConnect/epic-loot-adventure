import { describe, it, expect } from 'vitest';
import {
  orbitCount, orbitDamage, boomerangPositions, dist2, ORBIT_RADIUS,
} from '@/game/systems/powerSystem';

describe('powerSystem (bumerangues orbitais)', () => {
  it('nº de lâminas: 0 sem stack, 3 na 1ª escolha, cresce depois', () => {
    expect(orbitCount(0)).toBe(0);
    expect(orbitCount(1)).toBe(3);
    expect(orbitCount(3)).toBe(5);
  });

  it('dano cresce com os stacks', () => {
    expect(orbitDamage(1)).toBe(14);
    expect(orbitDamage(2)).toBe(24);
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
});
