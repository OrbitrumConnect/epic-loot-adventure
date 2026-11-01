import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createZsHarvestNodes, ZS_NODE_CLEAR } from '@/game/systems/zsHarvestSystem';
import { SURF, type ZsQuery } from '@/game/systems/zsSpawnSystem';

/* Pedro 01/11: árvore/pedra de coleta "em cima da estrada" e "dentro da Lagoa" → folga de pista e de água. Medido no mapa:
   4 pedras estavam a < 4 m de uma pista (o centro fora da pista, mas a pedra é larga). */
describe('recursos de coleta longe da pista e da água', () => {
  // pistas a cada 60 m (4 m de largura), Lagoa a leste (x > 260), mata a oeste (x < -100), terra no resto
  const surf = (x: number, z: number): number => {
    if (x > 260) return SURF.lagoon;
    if (Math.abs(((z % 60) + 60) % 60 - 30) < 2) return SURF.road;
    return x < -100 ? SURF.forest : SURF.land;
  };
  const q: ZsQuery = { bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 }, surf, height: () => 10, slope: () => 0 };
  it(`nenhum nó a menos de ~${ZS_NODE_CLEAR} m de pista ou água; continua determinístico e com as quantidades`, () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    // a folha da árvore de farm na Zona Sul vai 50% pro verde da mata (Pedro 01/11); só a folha
    expect(zs).toMatch(/leaf: zsFarmLeaf\(c\.leaf, ZS_MATA_LEAF\), 'leaf-light': zsFarmLeaf\(c\['leaf-light'\], ZS_MATA_LEAF_LIGHT\)/);
    const nodes = createZsHarvestNodes(q);
    expect(createZsHarvestNodes(q)).toEqual(nodes);
    expect(nodes.filter((n) => n.kind === 'tree').length).toBe(48);
    expect(nodes.filter((n) => n.kind === 'rock').length).toBe(36);
    for (const n of nodes) {
      for (let a = 0; a < 32; a++) for (const r of [1, 2, 3, 4, 4.5]) {
        const ang = (a / 32) * Math.PI * 2, s = surf(n.position.x + Math.sin(ang) * r, n.position.z + Math.cos(ang) * r);
        expect(s === SURF.road || s === SURF.lagoon || s === SURF.sea, `${n.id} perto de pista/água`).toBe(false);
      }
    }
  });
});
