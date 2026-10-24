import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Desempenho (Pedro, 24/10: "tirar uns 500k pra ver"). As 16 árvores-marco somavam 2,1 MILHÕES de triângulos
   (ancestral 108k × 6, rachada 147k × 10). Simplificado SÓ tronco/raiz — as FOLHAS (cor laranja na textura)
   ficaram intactas (medido em pixels: copa igual, silhueta dentro de 1–3%). −502 mil triângulos. */
const TREES: [string, number, number][] = [
  // arquivo, teto de triângulos, mínimo (garante que a copa não foi junto)
  ['tree-gnarled', 60_000, 50_000],
  ['tree-split', 135_000, 120_000],
];

describe('árvores leves', () => {
  for (const [n, max, min] of TREES) {
    it(`${n}: entre ${min} e ${max} triângulos, float, com cor + relevo`, () => {
      const b = fs.readFileSync(`public/models/trees/${n}.glb`);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      let tris = 0;
      for (const m of j.meshes) for (const p of m.primitives) {
        tris += j.accessors[p.indices].count / 3;
        expect(j.accessors[p.attributes.POSITION].componentType).toBe(5126);
        expect(p.attributes.NORMAL).toBeDefined();
        expect(p.attributes.TEXCOORD_0).toBeDefined();
      }
      expect(tris).toBeLessThan(max);
      expect(tris).toBeGreaterThan(min);
      const mat = j.materials[0];
      expect(mat.pbrMetallicRoughness.baseColorTexture).toBeDefined();
      expect(mat.normalTexture).toBeDefined();
    });
  }
});
