import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BaseState, PlacedBuilding } from '@/game/types';
import { HALL_PLOT_INDEX } from '@/game/data/buildings';
import { carriedResources, createInitialBase, getUpgradeBlockReason, getUpgradeCost, payFromCarried, withCarried } from '@/game/systems/baseSystem';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';
import { useGameStore } from '@/game/state/game-store';

/* Pedro, 04/11: "meu amigo diz que na cidade dele não consegue upar e tem recurso! … tem madeira e pedra, mas a cidade não
   consegue criar" — a cidade pagava SÓ com o estoque dela; o que ele juntou jogando estava na MOCHILA (só entrava pelo
   "Depositar" do Salão). Agora: estoque da cidade primeiro, a mochila completa — o mesmo do navio/carro/casa. */
const T0 = 1_000_000;
const b = (id: string, defId: PlacedBuilding['defId'], level: number, plotIndex: number): PlacedBuilding => ({ id, defId, level, plotIndex, construction: null, queue: [] });
function base(res: Partial<BaseState['resources']>, hall = 3): BaseState {
  const s = createInitialBase(T0);
  return { ...s, resources: { wood: 0, stone: 0, food: 0, essence: 0, ...res }, buildings: [b('b1', 'tribe_hall', hall, HALL_PLOT_INDEX), b('f1', 'forge', 1, 0)], seq: 100 };
}

describe('cidade paga com estoque + mochila', () => {
  it('a mochila só completa o que FALTA (nunca mais que o custo)', () => {
    const cost = getUpgradeCost('forge', 2); // madeira e pedra
    const inv = createInventory([{ itemId: 'wood', quantity: 5000 }, { itemId: 'stone', quantity: 5000 }]);
    const r = payFromCarried(base({ wood: 40, stone: 0 }), inv, cost);
    expect(r.state.resources.wood).toBe(Math.max(40, cost.wood));
    expect(r.state.resources.stone).toBe(cost.stone);
    expect(getItemCount(r.inventory, 'wood')).toBe(5000 - Math.max(0, cost.wood - 40));
    expect(getItemCount(r.inventory, 'stone')).toBe(5000 - cost.stone);
    // estoque já basta: nada sai da mochila
    const r2 = payFromCarried(base({ wood: 1e6, stone: 1e6 }), inv, cost);
    expect(r2.moved).toEqual({ wood: 0, stone: 0, food: 0, essence: 0 });
    expect(r2.inventory).toBe(inv);
  });

  it('a tela vê estoque + mochila: o "Faltam" some quando a mochila cobre', () => {
    const inv = createInventory([{ itemId: 'wood', quantity: 5000 }, { itemId: 'stone', quantity: 5000 }]);
    const s = base({ wood: 0, stone: 0 });
    expect(getUpgradeBlockReason(s, 'f1')).toMatch(/^Faltam/);
    expect(getUpgradeBlockReason(withCarried(s, inv), 'f1')).toBeNull();
    expect(carriedResources(inv)).toEqual({ wood: 5000, stone: 5000, food: 0, essence: 0 });
  });

  it('na loja do jogo: melhora a forja com a mochila; recusada (Salão baixo) não tira nada da mochila', () => {
    const inv = createInventory([{ itemId: 'wood', quantity: 5000 }, { itemId: 'stone', quantity: 5000 }]);
    useGameStore.setState((st) => ({ base: base({ wood: 0, stone: 0 }), player: { ...st.player, inventory: inv } }));
    useGameStore.getState().upgradeBuilding('f1');
    const st = useGameStore.getState(), cost = getUpgradeCost('forge', 2);
    expect(st.base.buildings.find((x) => x.id === 'f1')!.construction?.targetLevel).toBe(2);
    expect(getItemCount(st.player.inventory, 'wood')).toBe(5000 - cost.wood);
    expect(getItemCount(st.player.inventory, 'stone')).toBe(5000 - cost.stone);
    // Salão nível 1 → forja não pode passar do 1: recusa e a mochila fica intacta
    useGameStore.setState((s2) => ({ base: base({ wood: 0, stone: 0 }, 1), player: { ...s2.player, inventory: inv } }));
    useGameStore.getState().upgradeBuilding('f1');
    expect(useGameStore.getState().player.inventory).toBe(inv);
    expect(useGameStore.getState().ui.message).toMatch(/Requer/);
  });

  it('ligado na tela (painéis com estoque + mochila; o topo segue o estoque da cidade)', () => {
    const v = fs.readFileSync('src/components/city-view.tsx', 'utf8');
    expect(v).toMatch(/const vbase = useMemo\(\(\) => withCarried\(base, carryInv\), \[base, carryInv\]\);/);
    expect(v).toMatch(/<BuildingPanel base=\{vbase\}/);
    expect(v).toMatch(/<BuildMenu base=\{vbase\}/);
  });
});
