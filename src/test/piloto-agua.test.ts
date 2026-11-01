import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { autoFollowDir } from '@/components/zona-sul/zs-move';

describe('autoFollowDir — piloto segue o alvo na água', () => {
  it('alvo longe: direção normalizada, has true', () => {
    const r = autoFollowDir(10, 0, 0, 0);
    expect(r.has).toBe(true);
    expect(r.x).toBeCloseTo(1, 5);
    expect(r.z).toBeCloseTo(0, 5);
  });
  it('alvo na diagonal: vetor unitário', () => {
    const r = autoFollowDir(3, 4, 0, 0);
    expect(Math.hypot(r.x, r.z)).toBeCloseTo(1, 5);
  });
  it('alvo coincidente/colado: has false, fica parado', () => {
    expect(autoFollowDir(0.1, 0, 0, 0).has).toBe(false);
    expect(autoFollowDir(0, 0, 0, 0)).toEqual({ x: 0, z: 0, has: false });
  });
});

describe('o branch de água do herói segue o piloto (fiação)', () => {
  it('zona-sul-world usa autoFollowDir e o nado usa aWantMove/awx/awz', () => {
    const src = readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(src).toContain('autoFollowDir(movement.current.x, movement.current.z, p.x, p.z)');
    expect(src).toMatch(/target = !aWantMove \?/);
    expect(src).toContain('sv.x += (awx * target - sv.x) * kk');
  });
});
