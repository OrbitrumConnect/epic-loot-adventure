import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Pedro, 25/10: bichos pequenos demais. `height` mede a malha do arquivo; o exibido (com a pele) foi medido:
   cervo 2,74 m c/ galhada · búfalo 1,99 × 3,38 m · leoa 1,05 × 1,72 m · jacaré 0,42 × 2,99 m · ganso 1,40 m ·
   faisão 1,46 m. Todos com autoGround (assentam pelo corpo animado perto do jogador). */
const src = fs.readFileSync('src/components/world/beast.tsx', 'utf8');
const row = (id: string) => new RegExp(`  ${id}: \{ url: '[^']+', height: ([0-9.]+),[^}]*autoGround: true \}`).exec(src);

describe('bichos em tamanho grande/real', () => {
  for (const [id, h] of [['deer', 3.54], ['bear', 3.39], ['wolf_alpha', 1.85], ['boar', 2.63], ['goose', 2.17], ['pheasant', 2.31]] as const) {
    it(`${id}: height ${h} + autoGround`, () => {
      const m = row(id);
      expect(m, id).not.toBeNull();
      expect(Number(m![1])).toBe(h);
    });
  }
  it('aves grandes: barra de vida acima da cabeça', () => {
    expect(src).toMatch(/goose: \{ labelHeight: 1\.9, ringRadius: 0\.9 \}/);
    expect(src).toMatch(/pheasant: \{ labelHeight: 1\.95, ringRadius: 0\.9 \}/);
  });
});
