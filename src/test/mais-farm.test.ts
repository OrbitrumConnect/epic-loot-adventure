import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsQuery } from '@/components/zona-sul/zs-world-profile';
import { createZsHarvestNodes } from '@/game/systems/zsHarvestSystem';
import { near, SURF, ZS_SAFE } from '@/game/systems/zsSpawnSystem';
import { harvestTreeGeometry } from '@/components/world/harvest-tree-geometry';

/* MAIS FARM (Pedro 01/11: "ainda vejo pouco material de farm — falta árvore e pedra"; "na área verde perto da praia,
   perto da Lagoa, mas não dentro da água ou na estrada"). Medido antes: 108 no mapa inteiro, 0 a menos de 140 m do
   nascedouro. Conferido no MAPA DE VERDADE. */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});

describe('mais farm na Zona Sul', () => {
  it('258 recursos (136 árvores, 50 pedrinhas, 72 pedras); mais de 20 árvores e 15 pedras a até 300 m do nascedouro; nada na água/pista', () => {
    const q = zsQuery(t), nodes = createZsHarvestNodes(q);
    const n = (k: string) => nodes.filter((x) => x.kind === k).length;
    expect([n('tree'), n('pebble'), n('rock')]).toEqual([136, 50, 72]);
    const d = (x: { position: { x: number; z: number } }) => Math.hypot(x.position.x - ZS_SAFE.x, x.position.z - ZS_SAFE.z);
    expect(nodes.filter((x) => x.kind === 'tree' && d(x) < 300).length).toBeGreaterThan(20);
    expect(nodes.filter((x) => x.kind !== 'tree' && d(x) < 300).length).toBeGreaterThan(15);
    for (const x of nodes) {
      expect(d(x)).toBeGreaterThan(45); // nunca na zona segura
      const s = q.surf(x.position.x, x.position.z);
      expect([SURF.land, SURF.forest]).toContain(s);
      expect(near(q, x.position.x, x.position.z, SURF.road, 5.9) || near(q, x.position.x, x.position.z, SURF.lagoon, 5.9) || near(q, x.position.x, x.position.z, SURF.sea, 5.9)).toBe(false);
    }
    // árvore no VERDE perto da praia/Lagoa (não só na mata)
    expect(nodes.filter((x) => x.kind === 'tree' && q.surf(x.position.x, x.position.z) === SURF.land && (near(q, x.position.x, x.position.z, SURF.beach, 70) || near(q, x.position.x, x.position.z, SURF.lagoon, 70))).length).toBeGreaterThan(15);
  });

  it('árvore de LONGE leve (~2 mil triângulos, mesma copa) e só além de 120 m; a de perto é a de sempre', () => {
    const c = { trunk: '#6b4a2a', 'ground-light': '#c9b98a', leaf: '#2f5d2a', 'leaf-light': '#3b6b31' } as never;
    const near0 = harvestTreeGeometry(c), far = harvestTreeGeometry(c, true);
    expect(near0.getAttribute('position').count / 3).toBe(8868); // a de sempre (medido: idêntica vértice a vértice)
    expect(far.getAttribute('position').count / 3).toBeLessThan(2200);
    near0.computeBoundingBox(); far.computeBoundingBox();
    expect(far.boundingBox!.max.y).toBeCloseTo(near0.boundingBox!.max.y, 0);
    const src = fs.readFileSync('src/components/world/harvest-nodes.tsx', 'utf8');
    expect(src).toMatch(/export const harvestLod = \{ d: 120 \};/);
    expect(src).toMatch(/if \(dist > lodD\) \{/);
  });
});
