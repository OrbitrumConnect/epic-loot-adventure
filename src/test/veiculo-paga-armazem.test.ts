import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { storageCount } from '@/game/systems/baseStorageSystem';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';
import { WARSHIP } from '@/components/zona-sul/zs-warship';

/* Pedro 04/11: "meu armazém diz que tenho material mas não consigo buildar o barco — usa só do loot?" — o navio e o
   carro pagavam SÓ da bolsa. Agora pagam como a base (23/10): armazém primeiro, a bolsa completa; ferro só da bolsa
   (o armazém guarda madeira/pedra/comida/essência). */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));
const res = (wood: number, stone: number) => ({ wood, stone, food: 0, essence: 0 });
const setup = (bag: { itemId: string; quantity: number }[], wood: number, stone: number) =>
  useGameStore.setState((s) => ({ player: { ...s.player, inventory: createInventory(bag) }, base: { ...s.base, resources: res(wood, stone), lastTickAt: Date.now() } }));

describe('navio/carro pagam com o armazém (como a base)', () => {
  it('o caso do Pedro: madeira e pedra no ARMAZÉM, ferro na bolsa → constrói; o armazém desconta', () => {
    expect(WARSHIP.BUILD_COST).toEqual([{ id: 'wood', n: 600 }, { id: 'iron_ore', n: 240 }, { id: 'stone', n: 120 }]);
    setup([{ itemId: 'iron_ore', quantity: 300 }], 2000, 500);
    const r = useGameStore.getState().spendItems(WARSHIP.BUILD_COST);
    expect(r.ok).toBe(true);
    const st = useGameStore.getState();
    expect(st.base.resources.wood).toBeGreaterThanOrEqual(1400);   // 2000 − 600 (+ produção, se houver)
    expect(st.base.resources.wood).toBeLessThan(2000);
    expect(st.base.resources.stone).toBeLessThan(500);
    expect(getItemCount(st.player.inventory, 'iron_ore')).toBe(60); // ferro só da bolsa
  });
  it('armazém + bolsa somam: o armazém sai PRIMEIRO, a bolsa completa o resto', () => {
    setup([{ itemId: 'wood', quantity: 100 }, { itemId: 'stone', quantity: 200 }, { itemId: 'iron_ore', quantity: 240 }], 550, 0);
    expect(useGameStore.getState().spendItems(WARSHIP.BUILD_COST).ok).toBe(true);
    const st = useGameStore.getState();
    expect(Math.floor(st.base.resources.wood)).toBeLessThan(5);       // os 550 do armazém foram
    expect(getItemCount(st.player.inventory, 'wood')).toBe(50);        // + 50 da bolsa (100 → 50)
    expect(getItemCount(st.player.inventory, 'stone')).toBe(80);       // pedra toda da bolsa (armazém 0)
  });
  it('faltou (ferro não vem do armazém): não gasta NADA e diz o que falta', () => {
    setup([{ itemId: 'iron_ore', quantity: 100 }], 5000, 5000);
    const r = useGameStore.getState().spendItems(WARSHIP.BUILD_COST);
    expect(r.ok).toBe(false);
    expect(r.missing).toEqual([{ id: 'iron_ore', n: 140 }]);
    const st = useGameStore.getState();
    expect(st.base.resources.wood).toBeGreaterThanOrEqual(5000);
    expect(getItemCount(st.player.inventory, 'iron_ore')).toBe(100);
  });
  it('o card do veículo conta bolsa + armazém; ferro/ouro não têm armazém', () => {
    expect(storageCount(res(700, 30), 'wood')).toBe(700);
    expect(storageCount(res(700, 30), 'iron_ore')).toBe(0);
    const card = fs.readFileSync('src/components/hud/tool-crafting.tsx', 'utf8');
    expect(card).toMatch(/const count = \(id: string\) => getItemCount\(inventory, id\) \+ storageCount\(resources, id\);/);
    expect(card).toMatch(/const missing = cost\.filter\(\(c\) => count\(c\.id\) < c\.n\);/);
  });
});
