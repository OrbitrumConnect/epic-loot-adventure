import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Desempenho (Pedro, 23/10): os bichos soltos somavam 1,69 MILHÃO de triângulos (jacaré 31 mil × 18).
   Simplificados com erro ≤ 0,4% (tamanho muda < 1,3%; esqueleto, animações e texturas iguais) → ~0,75 mi.
   Ganso/faisão fora (penas transparentes encolhiam). Vértices em FLOAT (lição dos animais gigantes). */
const LIMITS: [string, number][] = [
  ['alligator', 12_000], ['deer', 7_000], ['rabbit', 4_000], ['zombie', 12_000], ['lioness', 7_000], ['buffalo', 7_000],
];

describe('bichos leves', () => {
  for (const [n, max] of LIMITS) {
    it(`${n}: < ${max} triângulos, float, com esqueleto e animação`, () => {
      const b = fs.readFileSync(`public/models/animals/${n}.glb`);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      let tris = 0;
      let skinned = 0; // chifre/galhada são peças RÍGIDAS (já no original); o corpo tem pele
      for (const m of j.meshes) for (const p of m.primitives) {
        tris += j.accessors[p.indices].count / 3;
        expect(j.accessors[p.attributes.POSITION].componentType).toBe(5126);
        if (p.attributes.JOINTS_0 !== undefined) skinned++;
      }
      expect(skinned).toBeGreaterThan(0);
      expect(tris).toBeLessThan(max);
      expect(j.skins?.length ?? 0).toBeGreaterThan(0);
      expect(j.animations?.length ?? 0).toBeGreaterThan(0);
    });
  }
});
