import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Efeitos dos poderes (bumerangue, furacão, flecha): saem do Meshy com 20–75 MB e até 1,6 milhão de
   triângulos. No jogo têm que ficar LEVES (aparecem várias vezes na tela, inclusive no celular) e
   com vértices SEM compactar (a flecha reaproveita só a malha no pool de projéteis). */
const FILES = ['boomerang', 'hurricane', 'arrow'];

for (const name of FILES) {
  describe(`efeito ${name}.glb`, () => {
    const path = `public/models/fx/${name}.glb`;
    it('existe, é leve e tem malha enxuta', () => {
      expect(fs.existsSync(path)).toBe(true);
      const b = fs.readFileSync(path);
      expect(b.length).toBeLessThan(1_000_000);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      let tris = 0;
      for (const m of json.meshes) for (const p of m.primitives) tris += json.accessors[p.indices].count / 3;
      expect(tris).toBeLessThan(15_000);
      for (const m of json.meshes) for (const p of m.primitives) {
        expect(json.accessors[p.attributes.POSITION].componentType).toBe(5126); // float, sem compactar
      }
      expect((json.nodes as { scale?: unknown; matrix?: unknown }[]).every((n) => !n.scale && !n.matrix)).toBe(true);
    });
  });
}
