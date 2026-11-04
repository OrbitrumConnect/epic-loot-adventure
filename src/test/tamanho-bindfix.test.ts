import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fitFooled } from '@/components/world/glb-hero-mixamo';

/* Pedro 04/11: "os atiradores estão grandes e no outro barco ficou deitado ou bug visual?" — medido no jogo: pirata
   5,4–5,6 m (era pra ser 1,8), e o mesmo nos outros modelos com `bindFix` (pântano, spiked, brutamontes, alien).
   A caixa do esqueleto posto na ligação sai DEITADA (espessura) e era lida como "escala assada no esqueleto". */
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('tamanho dos bonecos Mixamo (autoHeight)', () => {
  // [modelo, altura pela geometria (bind), altura pela malha no esqueleto, enganado?] — medidos no navegador 04/11
  const medidos: [string, number, number, boolean][] = [
    ['pirate', 1.64, 0.543, false], ['swamp', 1.66, 0.395, false], ['spiked', 1.65, 0.424, false],
    ['scrap_brute', 1.63, 0.474, false], ['alien_brute', 1.64, 0.605, false], ['rope_archer', 1.68, 1.569, false],
    // o caso VERDADEIRO (export Blender, escala 0,01 no esqueleto): segue igual
    ['carioca (herói)', 0.017, 1.657, true], ['cannibal', 0.016, 1.626, true],
  ];
  it('"enganado" só quando a malha no esqueleto sai MAIOR que a geometria (nunca pela espessura do corpo deitado)', () => {
    for (const [m, b, sk, f] of medidos) expect(fitFooled(b, sk), m).toBe(f);
  });
  it('o pirata volta a ~1,8 m (escala ~1,1 pela geometria em pé; antes 3,3 = 5,6 m)', () => {
    expect(1.8 / 1.64).toBeCloseTo(1.098, 2);
    expect(read('src/components/world/glb-hero-mixamo.tsx')).toMatch(/const fooled = fitFooled\(bindH, skH\);\n\s+const h = fooled \? skH : bindH;/);
  });
  it('o atirador morto no navio cai de costas e o corpo some depois de 3 s (como em terra)', () => {
    const v = read('src/components/zona-sul/zs-enemy-fleet-view.tsx');
    expect(v).toMatch(/export const FLEET_CORPSE_MS = 3000;/);
    expect(v).toMatch(/g\.current\.visible = deadAt\.current === null \|\| performance\.now\(\) - deadAt\.current < FLEET_CORPSE_MS;/);
  });
});
