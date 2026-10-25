import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Pedro, 25/10 ("go all"; ideia do mod "Better Terrain"): detalhe no chão por ruído no shader, ligável na tecla L,
   começa DESLIGADO (ele compara no jogo). O GLSL foi compilado e linkado num WebGL real (Chrome headless +
   SwiftShader, three do projeto, trecho extraído do arquivo) — e o mesmo teste acusa um erro proposital. */
const src = fs.readFileSync('src/components/world/map-floor.tsx', 'utf8');

describe('detalhe do chão', () => {
  it('ruído em 2 escalas no shader, força num uniform (sem recompilar), chave própria de cache', () => {
    expect(src).toMatch(/const DETAIL_GLSL = `/);
    expect(src).toMatch(/dNoise\(vDetailW\.xz \* 1\.1\)/);
    expect(src).toMatch(/dNoise\(vDetailW\.xz \* 0\.25 \+ 17\.0\)/);
    expect(src).toMatch(/mat\.customProgramCacheKey = \(\) => 'terrain-detail-v1';/);
    expect(src).not.toMatch(/float patch\b/); // "patch" é palavra reservada em GLSL ES 3
  });
  it('começa desligado; tecla L alterna e lembra', () => {
    const k = fs.readFileSync('src/components/world/terrain-detail.ts', 'utf8');
    expect(k).toMatch(/localStorage\.getItem\(KEY\) === '1'/); // só liga se o jogador ligou antes
    expect(fs.readFileSync('src/routes/index.tsx', 'utf8')).toMatch(/if \(e\.code === 'KeyL'\)/);
  });
});
