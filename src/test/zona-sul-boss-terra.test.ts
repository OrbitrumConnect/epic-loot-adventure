import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lineWalkable } from '@/components/world/map-walk';

describe('lineWalkable — terra contínua até o alvo', () => {
  it('rejeita quando há faixa de água no meio da reta', () => {
    // água entre x=4 e x=8 (predicate falso nessa faixa), resto terra
    const walk = (x: number) => x < 4 || x > 8;
    expect(lineWalkable(0, 0, 12, 0, walk)).toBe(false);
  });
  it('aceita quando a reta inteira é terra', () => {
    const walk = () => true;
    expect(lineWalkable(0, 0, 12, 0, walk)).toBe(true);
  });
  it('rejeita se o destino é água mesmo colado', () => {
    const walk = (x: number) => x < 10;
    expect(lineWalkable(0, 0, 12, 0, walk)).toBe(false);
  });
});

describe('spawnBoss usa lineWalkable (fiação)', () => {
  it('o filtro de linha de terra está no spawnBoss da store', () => {
    const src = readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(src).toContain("import { lineWalkable } from '@/components/world/map-walk'");
    expect(src).toMatch(/!classic && !lineWalkable\(p\.x, p\.z, cx, cz\)/);
    expect(src).toMatch(/!isClassicWorld\(\) && !found/);
  });
});
