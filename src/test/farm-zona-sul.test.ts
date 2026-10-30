import { describe, expect, it } from 'vitest';
import { createZsHarvestNodes } from '@/game/systems/zsHarvestSystem';
import { SURF, ZS_CLEAR_R, ZS_SAFE, type ZsQuery } from '@/game/systems/zsSpawnSystem';

const q: ZsQuery = {
  bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
  surf: (x, z) => (x < -100 ? SURF.forest : SURF.land),
  height: (x, z) => (z === 999999 ? 0 : 10),
  slope: () => 0,
};

describe('farm Zona Sul', () => {
  it('gera nós determinísticos em chão seco, fora da praia e clareira', () => {
    const nodes = createZsHarvestNodes(q);
    expect(nodes.length).toBeGreaterThan(0);
    expect(createZsHarvestNodes(q)).toEqual(nodes);
    for (const node of nodes) {
      expect(q.height(node.position.x, node.position.z)).toBeGreaterThan(0.5);
      expect(q.surf(node.position.x, node.position.z)).not.toBe(SURF.beach);
      expect(Math.hypot(node.position.x - ZS_SAFE.x, node.position.z - ZS_SAFE.z)).toBeGreaterThanOrEqual(ZS_CLEAR_R);
      if (node.kind === 'tree') expect(q.surf(node.position.x, node.position.z)).toBe(SURF.forest);
      else expect(q.surf(node.position.x, node.position.z)).not.toBe(SURF.forest);
    }
  });
});
