import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Meshy exporta com metal 0,40 + rugosidade ~0,35 (aspecto de plástico molhado). Árvores,
   acampamento, pedra e poste ficaram FOSCOS no próprio arquivo (22/10) — só a descrição do
   material mudou; malha e imagens idênticas. */
const MATTE = ['trees/tree-gnarled', 'trees/tree-split', 'props/raider-camp', 'rocks/mining-rock', 'props/light-post'];

describe('modelos que devem ser foscos', () => {
  for (const f of MATTE) {
    it(f, () => {
      const b = fs.readFileSync(`public/models/${f}.glb`);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      for (const m of json.materials) {
        expect(m.pbrMetallicRoughness.metallicFactor).toBe(0);
        // omitido = 1 (padrão do glTF); o gltf-transform não escreve o valor padrão (árvores, 24/10)
        expect(m.pbrMetallicRoughness.roughnessFactor ?? 1).toBe(1);
        expect(m.pbrMetallicRoughness.metallicRoughnessTexture).toBeUndefined();
      }
    });
  }
});
