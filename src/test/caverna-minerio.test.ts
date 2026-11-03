import fs from 'node:fs';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_ENEMIES, CAVE_ORE, caveEnemySpots, caveInside, caveLayer, caveOreSpots, cavePoolY, caveStandAt, caveTunnelEnemySpots, setCaveTerrain } from '@/components/zona-sul/zs-cave';
import { createCaveCreatures, createCaveOreNodes } from '@/components/zona-sul/zs-world-profile';
import { HARVEST_NODES } from '@/game/data/harvest-nodes';
import { useGameStore } from '@/game/state/game-store';
import { layers, resetLayers } from '@/game/systems/layerSystem';
import { addItem, getItemCount } from '@/game/systems/inventorySystem';
import { isUnlocked, UNLOCK_LEVEL } from '@/game/systems/unlockSystem';

/* Pedro 02/11: "minério dentro da cave — exato e um pouco mais, e inimigo na cave" (e a Zona Sul não tinha veio de ferro:
   skate/carro/navio custam ferro) · "descer o nível do navio pra 35". */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});

describe('minério de ferro na caverna', () => {
  // 02/11 noite: 18 → 23 (fundo do abismo do Pico da Tijuca + salão do Alto da Boa Vista)
  it('23 veios, todos no chão SECO de um salão, com corpo em pé do lado, na camada da caverna; espalhados', () => {
    const spots = caveOreSpots();
    expect(CAVE_ORE).toHaveLength(23);
    expect(spots).toHaveLength(23);                        // nenhum caiu fora (todos acharam chão)
    for (const s of spots) {
      expect(caveStandAt(s.x, s.z), s.id).toBeCloseTo(s.y, 3);
      expect(cavePoolY(s.x, s.z), s.id).toBeNull();
      expect(caveInside(s.x, s.y, s.z), s.id).toBe(true);
      expect(caveLayer(s.x, s.y, s.z), s.id).toBe(1);
    }
    for (let i = 0; i < spots.length; i++) for (let j = i + 1; j < spots.length; j++) {
      expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z), `${spots[i]!.id}×${spots[j]!.id}`).toBeGreaterThan(5);
    }
  });
  it('vira nó de coleta comum (veio do jogo): 276 de ferro por volta → carro (180) em ~1 volta', () => {
    const nodes = createCaveOreNodes();
    expect(nodes).toHaveLength(23);
    for (const n of nodes) {
      expect(n.kind).toBe('iron_vein');
      expect(n.layer).toBe(1);
      expect(n.y).toBeLessThan(zsHeightAt(t, n.position.x, n.position.z) - 3); // debaixo do chão do mapa (o abismo fica alto, no maciço)
      expect(n.quantity).toBe(HARVEST_NODES.iron_vein.capacity);
    }
    expect(nodes.reduce((a, n) => a + n.maxQuantity, 0)).toBe(276);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(23);
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('...createCaveOreNodes()];');
    expect(zs).toContain('<Suspense fallback={null}><HarvestNodes c={cFarm} layer={1} /></Suspense>');
  });

  describe('colher só na MESMA camada', () => {
    const vein = () => createCaveOreNodes()[0]!;
    beforeEach(() => {
      resetLayers();
      const st = useGameStore.getState(), n = vein();
      let inv = addItem({ ...st.player.inventory, slots: st.player.inventory.slots.map(() => ({ itemId: null, quantity: 0 })) }, 'pickaxe', 1);
      const pick = inv.slots.findIndex((s) => s.itemId === 'pickaxe');
      inv = { ...inv, equipment: { ...inv.equipment, primary: inv.slots[pick]!.itemId } };
      useGameStore.setState({ harvestNodes: [n], player: { ...st.player, dead: false, level: 30, position: { x: n.position.x + 1, z: n.position.z }, inventory: inv } });
    });
    afterEach(() => resetLayers());
    it('herói no morro EM CIMA do veio (camada 0): E não pega nada', () => {
      layers.player = 0;
      useGameStore.getState().collectNearest();
      expect(getItemCount(useGameStore.getState().player.inventory, 'iron_ore')).toBe(0);
      useGameStore.getState().harvestAt(vein().id);
      expect(getItemCount(useGameStore.getState().player.inventory, 'iron_ore')).toBe(0);
    });
    it('herói na caverna (camada 1): E tira ferro do veio; o piloto enxerga o veio', () => {
      layers.player = 1;
      useGameStore.getState().collectNearest();
      expect(getItemCount(useGameStore.getState().player.inventory, 'iron_ore')).toBeGreaterThan(0);
      expect((useGameStore.getState().buildAutoSnapshot().harvestNodes ?? []).map((n) => n.id)).toEqual([vein().id]);
      layers.player = 0;
      expect(useGameStore.getState().buildAutoSnapshot().harvestNodes ?? []).toHaveLength(0);
    });
  });
});

describe('mais inimigos na caverna + navio no 35', () => {
  // 02/11 noite: 21 → 27 (abismo do Pico da Tijuca + salão do Alto da Boa Vista, no FIM da lista)
  it('13 → 27 inimigos (os 13 de antes com os MESMOS ids), todos em pé no chão da caverna', () => {
    expect(CAVE_ENEMIES).toHaveLength(27);
    const spots = caveEnemySpots();
    expect(spots.slice(0, 13).map((s) => s.id)).toEqual(CAVE_ENEMIES.slice(0, 13).map(([room], i) => `wild_cave_${room}_${i}`));
    for (const s of spots) {
      const fl = caveStandAt(s.x, s.z);
      expect(fl, s.id).not.toBeNull();
      expect(caveLayer(s.x, fl!, s.z), s.id).toBe(1);
    }
    // 03/11: + os dos TÚNEIS (caverna-inimigos-tuneis), no fim — os 27 dos salões seguem iguais
    expect(createCaveCreatures().filter((c) => c.id.startsWith('wild_cave_') && !c.id.startsWith('wild_cave_tn_'))).toHaveLength(27);
    expect(createCaveCreatures().filter((c) => c.id.startsWith('wild_cave_tn_'))).toHaveLength(caveTunnelEnemySpots().length);
  });
  it('navio de guerra libera no nível 35', () => {
    expect(UNLOCK_LEVEL['war_ship']).toBe(35);
    expect(isUnlocked('war_ship', 35)).toBe(true);
    expect(isUnlocked('war_ship', 34)).toBe(false);
  });
});
