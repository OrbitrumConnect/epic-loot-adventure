import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isMapWaterPoint } from '@/components/world/world-kit';

describe('cobertura de água do mapa', () => {
  it('cobre rio e lago, mas não cobre o ponto seco fora deles', () => {
    expect(isMapWaterPoint(62, 71)).toBe(false);
    expect(isMapWaterPoint(40, 38)).toBe(true);
    expect(isMapWaterPoint(55, 55)).toBe(true);
  });

  it('mantém a função de recorte de água ligada à cena', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/game-world.tsx'), 'utf8');

    expect(source, 'A água do mapa perdeu o recorte por isMapWaterPoint na cena.').toMatch(/\bisMapWaterPoint\b/);
  });
});
