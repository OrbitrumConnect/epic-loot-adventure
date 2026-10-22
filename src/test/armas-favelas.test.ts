import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EDITOR_ASSETS } from '@/components/editor/editor-store';

/* Armas GLB (pistola/fuzil) e favelas do Editor (22/10): vieram do Meshy/Blender com 26–46 MB e até
   499 mil triângulos. No jogo: leves e com vértices SEM compactar (lição dos animais gigantes). */
const LIMITS: [string, number, number][] = [
  ['weapons/rifle', 1_000_000, 10_000],
  ['weapons/pistol', 1_000_000, 10_000],
  ['map/favela-a', 3_000_000, 60_000],
  ['map/favela-b', 3_000_000, 60_000],
];

describe('armas e favelas GLB', () => {
  for (const [name, maxBytes, maxTris] of LIMITS) {
    it(`${name}: leve, malha enxuta, vértices sem compactar`, () => {
      const b = fs.readFileSync(`public/models/${name}.glb`);
      expect(b.length).toBeLessThan(maxBytes);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      let tris = 0;
      for (const m of json.meshes) for (const p of m.primitives) {
        tris += json.accessors[p.indices].count / 3;
        expect(json.accessors[p.attributes.POSITION].componentType).toBe(5126);
      }
      expect(tris).toBeLessThan(maxTris);
    });
  }

  it('todo modelo da biblioteca do Editor ADM existe em disco (nada quebrado na lista)', () => {
    for (const a of EDITOR_ASSETS) {
      if (!a.assetUrl.startsWith('/models/')) continue;
      expect(fs.existsSync(`public${a.assetUrl}`), a.assetUrl).toBe(true);
    }
  });
});
