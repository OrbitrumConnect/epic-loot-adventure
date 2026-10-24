import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BASE_BOOMERANG_SIZE, BASE_TORNADO_SIZE } from '@/components/world/power-orbit';

/* Pedro, 24/10: "o bumerangue e o furacão da base ainda usam os low poly; o herói usa os GLB corretos".
   A base usa os MESMOS GLB do herói (fx-models), MAIORES, furacão com a mesma opacidade 0,5. */
const src = (f: string) => readFileSync(`src/components/world/${f}`, 'utf8');

describe('poderes da base com os GLB do herói', () => {
  it('bumerangue e furacão da base renderizam os GLB (low-poly só de reserva no Suspense)', () => {
    const base = src('power-orbit.tsx');
    expect(base).toMatch(/<BoomerangModel size=\{BASE_BOOMERANG_SIZE\} \/>/);
    expect(base).toMatch(/<HurricaneModel opacity=\{0\.5\} size=\{BASE_TORNADO_SIZE\} \/>/);
    expect(base.match(/<Suspense fallback=/g)).toHaveLength(2);
  });

  it('maiores que os do herói (0,9 m / 3,6 m)', () => {
    expect(BASE_BOOMERANG_SIZE).toBeGreaterThan(0.9);
    expect(BASE_TORNADO_SIZE).toBeGreaterThan(3.6);
    // herói continua no tamanho padrão
    const hero = src('hero-powers.tsx');
    expect(hero).toMatch(/<BoomerangModel \/>/);
    expect(hero).toMatch(/<HurricaneModel opacity=\{0\.5\} \/>/);
  });
});
