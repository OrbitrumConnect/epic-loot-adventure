import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Pedro, 25/10: bichos pequenos demais. `height` mede a malha do arquivo; o exibido (com a pele) foi medido:
   cervo 2,74 m c/ galhada · búfalo 1,99 × 3,38 m · leoa 1,05 × 1,72 m · jacaré 0,42 × 2,99 m · ganso 1,40 m ·
   faisão 1,46 m. Todos com autoGround (assentam pelo corpo animado perto do jogador). */
const src = fs.readFileSync('src/components/world/beast.tsx', 'utf8');
const row = (id: string) => new RegExp(`  ${id}: \{ url: '[^']+', height: ([0-9.]+),[^}]*autoGround: true \}`).exec(src);

describe('bichos em tamanho grande/real', () => {
  // 26/10 (Pedro): búfalo +1 m (3,39 → 5,09), leão ×1,4 (1,85 → 2,59), jacaré ×1,5 (3,95 → 5,93).
  for (const [id, h] of [['deer', 3.54], ['bear', 5.09], ['wolf_alpha', 2.59], ['boar', 5.93], ['goose', 2.17], ['pheasant', 2.31]] as const) {
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

/* 26/10: maiores → alcance da mordida e nome/anel acompanham (senão o herói ficava "dentro" do jacaré de 6,5 m). */
describe('bichos maiores 26/10: alcance e rótulo acompanham', () => {
  it('jacaré 3,6 m · búfalo 3,6 m · leão 3,2 m de alcance; nome acima da cabeça nova', () => {
    expect(src).toMatch(/labelHeight: 1\.9, ringRadius: 3\.3,[\s\S]{0,200}attackRange: 3\.6,/);  // jacaré
    expect(src).toMatch(/labelHeight: 3\.6, ringRadius: 2\.5,[\s\S]{0,120}attackRange: 3\.6,/);  // búfalo
    expect(src).toMatch(/labelHeight: 2\.4, ringRadius: 1\.4,[\s\S]{0,120}attackRange: 3\.2,/);  // leão
  });
});

/* 26/10 (Pedro: "uns ficam bem mais escuros"): bicho PINTADO (sem textura) ganha brilho próprio leve da própria cor. */
describe('luz dos bichos pintados', () => {
  it('18% da própria cor como brilho (≈ +60% à noite, ≈ +5% de dia no búfalo); texturizados iguais', async () => {
    const { TINT_GLOW } = await import('@/components/world/glb-creature');
    expect(TINT_GLOW).toBe(0.18);
    const gc = fs.readFileSync('src/components/world/glb-creature.tsx', 'utf8');
    expect(gc).toMatch(/if \(tint\) \{[\s\S]{0,1200}sm\.emissive\.set\(tint\); sm\.emissiveIntensity = TINT_GLOW;/);
  });
});
