import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* 26/10 (celular fraco): a casa da base carregava pedra E metal sempre (só uma aparece). Agora só a do tier. */
describe('casa da base: só o GLB do tier em uso', () => {
  it('madeira = nenhum GLB; pedra = só pedra; metal = só metal (o useGLTF fica no componente do tier)', () => {
    const src = fs.readFileSync('src/components/world/base-house.tsx', 'utf8');
    expect(src).toMatch(/const url = metal \? METAL_HOUSE_URL : evolved \? STONE_HOUSE_URL : null;/);
    expect(src).toMatch(/return url \? <BaseHouseGlb url=\{url\} \{\.\.\.props\} \/> : <BaseHouseInner \{\.\.\.props\} tierScene=\{null\} \/>;/);
    expect(src.match(/useGLTF\(/g)!.length).toBe(1); // um só, dentro de BaseHouseGlb
    expect(src).not.toMatch(/useGLTF\('\/models\/house\/(stone|metal)-house\.glb'\)/);
  });
});
