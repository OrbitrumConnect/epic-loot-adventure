import { describe, expect, it } from 'vitest';

import type { HarvestNodeState, InventoryState } from '@/game/types';
import { HARVEST_NODES, HARVEST_NODE_COUNT, HARVEST_NODE_TARGETS } from '@/game/data/harvest-nodes';
import { CAMPS, CAMP_PLACEMENTS, PLAYER_SPAWN, RUINS_POSITION, WORLD_HALF } from '@/game/data/camps';
import { RECIPES } from '@/game/data/recipes';
import { ITEMS } from '@/game/data/items';
import {
  HARVEST_SPAWN_CLEARING, createHarvestNodes, harvestNode, tickHarvestNodes,
} from '@/game/systems/harvestSystem';
import { addItem, createInventory, getItemCount } from '@/game/systems/inventorySystem';
import { canCraft, craft } from '@/game/systems/craftSystem';
import { useGameStore } from '@/game/state/game-store';

const T0 = 9_000_000;

function node(kind: HarvestNodeState['kind'], over: Partial<HarvestNodeState> = {}): HarvestNodeState {
  const def = HARVEST_NODES[kind];
  return {
    id: `t_${kind}`, kind, position: { x: 20, z: 20 }, quantity: def.capacity, maxQuantity: def.capacity,
    depleted: false, respawnAt: null, seed: 0.5, ...over,
  };
}

const bare = (): InventoryState => createInventory([]);

describe('colocação dos nós', () => {
  const nodes = createHarvestNodes();

  it('gera a quantidade escolhida, por tipo', () => {
    expect(nodes).toHaveLength(HARVEST_NODE_COUNT);
    expect(HARVEST_NODE_COUNT).toBeGreaterThanOrEqual(200);
    for (const kind of Object.keys(HARVEST_NODE_TARGETS) as (keyof typeof HARVEST_NODE_TARGETS)[]) {
      expect(nodes.filter(n => n.kind === kind)).toHaveLength(HARVEST_NODE_TARGETS[kind]);
    }
  });

  it('é determinístico e tem ids únicos', () => {
    expect(createHarvestNodes()).toEqual(nodes);
    expect(createHarvestNodes(1)).not.toEqual(nodes);
    expect(new Set(nodes.map(n => n.id)).size).toBe(nodes.length);
  });

  it('nunca na clareira do nascedouro, em acampamento, nas ruínas ou fora do mapa', () => {
    for (const n of nodes) {
      const { x, z } = n.position;
      expect(Math.hypot(x - PLAYER_SPAWN.x, z - PLAYER_SPAWN.z)).toBeGreaterThanOrEqual(HARVEST_SPAWN_CLEARING);
      expect(Math.hypot(x - RUINS_POSITION.x, z - RUINS_POSITION.z)).toBeGreaterThanOrEqual(8);
      for (const p of CAMP_PLACEMENTS) {
        const r = CAMPS[p.defId]!.radius;
        expect(Math.hypot(x - p.position.x, z - p.position.z)).toBeGreaterThanOrEqual(r);
      }
      expect(Math.abs(x)).toBeLessThanOrEqual(WORLD_HALF);
      expect(Math.abs(z)).toBeLessThanOrEqual(WORLD_HALF);
    }
  });

  it('ouro fica longe da base', () => {
    for (const n of nodes.filter(k => k.kind === 'gold_vein')) {
      expect(Math.hypot(n.position.x, n.position.z)).toBeGreaterThanOrEqual(25);
    }
  });
});

describe('colheita', () => {
  it('rocha exige picareta: sem ela recusa e diz qual falta', () => {
    const r = harvestNode(node('rock'), null, bare(), T0);
    expect(r.ok).toBe(false);
    expect(r.missingTool).toBe('pickaxe');
    expect(r.harvested).toBe(0);
    expect(r.node.quantity).toBe(HARVEST_NODES.rock.capacity);
    expect(r.message).toContain('Picareta');
  });

  it('veio de ouro e de ferro também exigem picareta', () => {
    expect(harvestNode(node('gold_vein'), null, bare(), T0).missingTool).toBe('pickaxe');
    expect(harvestNode(node('iron_vein'), null, bare(), T0).missingTool).toBe('pickaxe');
  });

  it('com a picareta equipada colhe o rendimento cheio e dá XP', () => {
    const r = harvestNode(node('iron_vein'), 'pickaxe', bare(), T0);
    expect(r.ok).toBe(true);
    expect(r.harvested).toBe(HARVEST_NODES.iron_vein.yieldPerHit);
    expect(r.xp).toBe(HARVEST_NODES.iron_vein.xp);
    expect(getItemCount(r.inventory, 'iron_ore')).toBe(r.harvested);
    expect(r.node.quantity).toBe(HARVEST_NODES.iron_vein.capacity - r.harvested);
  });

  it('carregar a ferramenta na mochila basta', () => {
    const inv = addItem(bare(), 'pickaxe', 1);
    expect(harvestNode(node('rock'), null, inv, T0).ok).toBe(true);
  });

  it('ferramenta de outro tipo não serve', () => {
    const inv = addItem(bare(), 'axe', 1);
    expect(harvestNode(node('rock'), 'axe', inv, T0).missingTool).toBe('pickaxe');
  });

  it('árvore na mão rende só handYield', () => {
    const r = harvestNode(node('tree'), null, bare(), T0);
    expect(r.ok).toBe(true);
    expect(r.harvested).toBe(HARVEST_NODES.tree.handYield);
    const withAxe = harvestNode(node('tree'), 'axe', bare(), T0);
    expect(withAxe.harvested).toBe(HARVEST_NODES.tree.yieldPerHit);
    expect(withAxe.harvested).toBeGreaterThan(r.harvested);
  });

  it('ferramenta de ferro rende mais que a básica', () => {
    const basic = harvestNode(node('tree'), 'axe', bare(), T0).harvested;
    const iron = harvestNode(node('tree'), 'iron_axe', bare(), T0).harvested;
    expect(iron).toBeGreaterThan(basic);
    // Melhor ferramenta da mochila vence mesmo sem estar equipada
    const inv = addItem(addItem(bare(), 'axe', 1), 'iron_axe', 1);
    expect(harvestNode(node('tree'), 'axe', inv, T0).harvested).toBe(iron);
  });

  it('pedregulho e cristal saem na mão', () => {
    const peb = harvestNode(node('pebble'), null, bare(), T0);
    expect(peb.ok).toBe(true);
    expect(peb.missingTool).toBeNull();
    expect(harvestNode(node('crystal'), null, bare(), T0).ok).toBe(true);
  });

  it('esgota, agenda respawn, e recusa nó esgotado', () => {
    const last = node('crystal', { quantity: 1, maxQuantity: 4 });
    const r = harvestNode(last, null, bare(), T0);
    expect(r.node.depleted).toBe(true);
    expect(r.node.quantity).toBe(0);
    expect(r.node.respawnAt).toBe(T0 + HARVEST_NODES.crystal.respawnMs);
    expect(r.message).toContain('esgotado');

    const again = harvestNode(r.node, null, bare(), T0 + 1);
    expect(again.ok).toBe(false);
    expect(again.harvested).toBe(0);
  });

  it('nunca colhe mais do que resta', () => {
    const r = harvestNode(node('rock', { quantity: 2 }), 'pickaxe', bare(), T0);
    expect(r.harvested).toBe(2);
    expect(r.node.depleted).toBe(true);
  });

  it('respawn repõe o nó só depois do prazo', () => {
    const depleted = node('tree', { quantity: 0, depleted: true, respawnAt: T0 + 1000 });
    const waiting = tickHarvestNodes([depleted], T0 + 999);
    expect(waiting[0]!.depleted).toBe(true);
    const back = tickHarvestNodes([depleted], T0 + 1000);
    expect(back[0]!.depleted).toBe(false);
    expect(back[0]!.quantity).toBe(depleted.maxQuantity);
    expect(back[0]!.respawnAt).toBeNull();
  });

  it('tick sem mudança devolve o mesmo array', () => {
    const list = [node('tree')];
    expect(tickHarvestNodes(list, T0)).toBe(list);
  });

  it('mochila cheia recusa e não gasta o nó', () => {
    const full: InventoryState = { ...bare(), maxWeight: 0.1 };
    const r = harvestNode(node('rock'), 'pickaxe', full, T0);
    expect(r.ok).toBe(false);
    expect(r.message).toContain('Mochila cheia');
    expect(r.node.quantity).toBe(HARVEST_NODES.rock.capacity);
  });
});

describe('receitas de ferramenta', () => {
  it('machado e picareta se fazem no campo com madeira e pedra', () => {
    for (const id of ['axe', 'pickaxe', 'iron_axe', 'iron_pickaxe']) {
      expect(RECIPES[id]!.station).toBe('none');
      expect(ITEMS[id]).toBeDefined();
    }
    const inv = createInventory([{ itemId: 'wood', quantity: 20 }, { itemId: 'stone', quantity: 20 }]);
    expect(canCraft(inv, 'axe')).toBe(true);
    const made = craft(inv, 'pickaxe')!;
    expect(getItemCount(made.inventory, 'pickaxe')).toBe(1);
    expect(canCraft(inv, 'iron_axe')).toBe(false); // falta ferro
  });

  it('gold_ore existe como item', () => {
    expect(ITEMS['gold_ore']?.category).toBe('resource');
  });
});

describe('harvestAt na loja', () => {
  it('colhe, dá XP e recusa longe demais', () => {
    const target = useGameStore.getState().harvestNodes.find(n => n.kind === 'tree')!;
    useGameStore.setState(s => ({
      player: { ...s.player, position: { x: target.position.x + 50, z: target.position.z } },
    }));
    useGameStore.getState().harvestAt(target.id);
    expect(useGameStore.getState().ui.message).toContain('longe');

    useGameStore.setState(s => ({
      player: { ...s.player, position: { ...target.position }, totalXp: 0, xp: 0 },
    }));
    const woodBefore = useGameStore.getState().getItemCount('wood');
    useGameStore.getState().harvestAt(target.id);
    expect(useGameStore.getState().getItemCount('wood')).toBeGreaterThan(woodBefore);
    expect(useGameStore.getState().player.totalXp).toBe(HARVEST_NODES.tree.xp);
  });

  it('tickWorld repõe nós esgotados', () => {
    const target = useGameStore.getState().harvestNodes[0]!;
    useGameStore.setState(s => ({
      harvestNodes: s.harvestNodes.map(n =>
        n.id === target.id ? { ...n, quantity: 0, depleted: true, respawnAt: Date.now() - 1 } : n),
    }));
    useGameStore.getState().tickWorld();
    const after = useGameStore.getState().harvestNodes.find(n => n.id === target.id)!;
    expect(after.depleted).toBe(false);
  });

  it('o snapshot do piloto traz os nós de colheita', () => {
    const snap = useGameStore.getState().buildAutoSnapshot();
    expect(snap.harvestNodes).toHaveLength(HARVEST_NODE_COUNT);
  });
});
