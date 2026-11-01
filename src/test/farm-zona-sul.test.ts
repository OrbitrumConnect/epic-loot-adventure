import { describe, expect, it } from 'vitest';
import { createZsHarvestNodes, ZS_FARM_EXTRA_CLEAR } from '@/game/systems/zsHarvestSystem';
import { SURF, ZS_CLEAR_R, ZS_SAFE, type ZsQuery } from '@/game/systems/zsSpawnSystem';

/** 1ª leva (a de sempre): os primeiros 48/24/36 de cada tipo; o resto é a 2ª leva (01/11, mais farm) */
const BASE: Record<string, number> = { tree: 48, pebble: 24, rock: 36 };
const ordinal = (id: string) => Number(id.split('_').pop());

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
      const base = ordinal(node.id) < BASE[node.kind]!;
      expect(q.height(node.position.x, node.position.z)).toBeGreaterThan(0.5);
      expect(q.surf(node.position.x, node.position.z)).not.toBe(SURF.beach);
      // 1ª leva longe do nascedouro (140 m); a 2ª chega mais perto (70 m — fora da zona segura de 45)
      expect(Math.hypot(node.position.x - ZS_SAFE.x, node.position.z - ZS_SAFE.z)).toBeGreaterThanOrEqual(base ? ZS_CLEAR_R : ZS_FARM_EXTRA_CLEAR);
      // árvore da 1ª leva só na mata; a da 2ª também no VERDE (terra); pedra nunca na mata
      if (node.kind === 'tree') expect(base ? [SURF.forest] : [SURF.forest, SURF.land]).toContain(q.surf(node.position.x, node.position.z));
      else expect(q.surf(node.position.x, node.position.z)).not.toBe(SURF.forest);
    }
    expect(nodes.filter((n) => n.kind === 'tree' && ordinal(n.id) >= BASE['tree']! && q.surf(n.position.x, n.position.z) === SURF.land).length).toBeGreaterThan(0);
  });
});
