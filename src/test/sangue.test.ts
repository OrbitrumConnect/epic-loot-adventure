import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Pedro, 25/10 (mod "3D Blood VFX" do Project Zomboid como referência): sangue que voa no sentido do golpe e
   pinga no chão. Já existia a explosão de gotas, mas no relevo ANTIGO (nasciam/caíam fora do chão real). */
const src = fs.readFileSync('src/components/world/combat-feedback.tsx', 'utf8');

describe('sangue no golpe', () => {
  it('gotas no chão REAL do mapa (1× por golpe, não por gota/quadro)', () => {
    expect(src).toMatch(/const ground = glbSurfaceY\(ev\.position\.x, ev\.position\.z, terrainHeight/);
    expect(src).toMatch(/const ground = arr\[o \+ 9\]!;/); // no quadro: lê o chão guardado
    expect(src).not.toMatch(/const ground = terrainHeight\(arr\[o\]!/);
  });
  it('jato pra longe de quem bateu', () => {
    expect(src).toMatch(/arr\[o \+ 3\] = Math\.cos\(a\) \* sp \* 0\.55 \+ dx \* sp \* 0\.9;/);
  });
  it('manchas no chão: 1 objeto reaproveitado (40), somem em 8 s; fogo não sangra', () => {
    expect(src).toMatch(/const DECAL_POOL = 40;/);
    expect(src).toMatch(/const DECAL_LIFE = 8;/);
    expect(src).toMatch(/if \(!ev\.fire\) \{/);
    expect(src).toMatch(/<instancedMesh ref=\{decalMesh\} args=\{\[decalGeo, decalMat, DECAL_POOL\]\}/);
  });
});
