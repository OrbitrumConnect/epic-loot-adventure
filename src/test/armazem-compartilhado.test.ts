import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { combineStorage, hordeStorageLoss, splitSpend } from '@/game/systems/baseStorageSystem';
import { createInventory, getItemCount, removeItem } from '@/game/systems/inventorySystem';

/* Pedro, 23/10: armazém da cidade (Clash) = armazém da BASE. Construções da base no mapa pagam com
   armazém (primeiro) + bolsa. Munição fica na bolsa. Base caída na horda: −25% do armazém. */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));
const res = (wood: number, stone: number) => ({ wood, stone, food: 50, essence: 3 });

describe('caixa do armazém compartilhado', () => {
  it('bolsa virtual soma bolsa + armazém (sem limite de peso)', () => {
    const bag = createInventory([{ itemId: 'stone', quantity: 10 }, { itemId: 'ammo', quantity: 99 }]);
    const c = combineStorage({ ...bag, maxWeight: 1 }, res(300, 4000));
    expect(getItemCount(c, 'stone')).toBe(4010);
    expect(getItemCount(c, 'wood')).toBe(300);
    expect(getItemCount(c, 'ammo')).toBe(99); // munição NÃO vem do armazém
  });

  it('gasto sai do ARMAZÉM primeiro; o que faltar sai da bolsa; outros itens só da bolsa', () => {
    const bag = createInventory([{ itemId: 'stone', quantity: 50 }, { itemId: 'iron_ore', quantity: 5 }]);
    const storage = res(0, 30);
    const before = combineStorage(bag, storage);
    const after = removeItem(removeItem(before, 'stone', 40), 'iron_ore', 2);
    const paid = splitSpend(bag, storage, before, after);
    expect(paid.resources.stone).toBe(0);                    // 30 do armazém
    expect(getItemCount(paid.inventory, 'stone')).toBe(40);   // +10 da bolsa (50 → 40)
    expect(getItemCount(paid.inventory, 'iron_ore')).toBe(3); // ferro só da bolsa
  });

  it('base caída na horda: armazém perde 25%', () => {
    expect(hordeStorageLoss(res(400, 4000))).toEqual({ wood: 300, stone: 3000, food: 37, essence: 2 });
  });
});

describe('casa de pedra paga com o armazém (o caso do Pedro: 4 mil de pedra na cidade, 0 na bolsa)', () => {
  it('evolui com 0 na bolsa e o armazém cobre; armazém desconta', () => {
    useGameStore.setState(s => ({
      wave: { ...s.wave, wave: 7 },
      player: { ...s.player, level: 41, inventory: createInventory([{ itemId: 'wood', quantity: 4 }]) },
      base: { ...s.base, resources: res(300, 4000), lastTickAt: Date.now() },
      baseEvolved: false,
    }));
    useGameStore.getState().evolveBaseToStone();
    const st = useGameStore.getState();
    expect(st.baseEvolved).toBe(true);
    expect(st.base.resources.stone).toBe(3600);  // 4000 − 400
    expect(st.base.resources.wood).toBeGreaterThanOrEqual(100); // 300 − 200 (+ produção, se houver)
    expect(getItemCount(st.player.inventory, 'wood')).toBe(4); // bolsa intacta (armazém pagou)
  });

  it('sem material em nenhum dos dois: não evolui e a mensagem soma armazém + bolsa', () => {
    useGameStore.setState(s => ({
      wave: { ...s.wave, wave: 7 },
      player: { ...s.player, level: 41, inventory: createInventory([]) },
      base: { ...s.base, resources: res(10, 20), lastTickAt: Date.now() },
      baseEvolved: false,
    }));
    useGameStore.getState().evolveBaseToStone();
    const st = useGameStore.getState();
    expect(st.baseEvolved).toBe(false);
    expect(st.ui.message).toMatch(/armazém \+ bolsa/);
  });
});

describe('entrega da construção (martelo) também usa o armazém', () => {
  it('bolsa vazia + armazém cheio → ergue peças e desconta do armazém', async () => {
    const { baseLv1Progress } = await import('@/game/systems/baseLv1');
    // mesma base de teste do `base-lv1.test` (só a cama/núcleo)
    const base = {
      id: 'base_test', owner: { kind: 'player', id: 'p', name: 'T' }, worldPosition: { x: 0, z: 0 },
      origin: { gx: 0, gz: 0 }, size: 8, stage: 'bed', enclosed: false, claimedAt: 0, lastDamagedAt: null,
      pieces: [{ id: 'core', kind: 'core', cell: { gx: 3, gz: 3 }, rotation: 0, hp: 100, maxHp: 100, tier: 1 }],
    } as never;
    useGameStore.setState(s => ({
      playerBase: base,
      player: { ...s.player, inventory: createInventory([]) },
      base: { ...s.base, resources: res(5000, 5000), lastTickAt: Date.now() },
    }));
    useGameStore.getState().deliverToBase();
    const st = useGameStore.getState();
    expect(baseLv1Progress(st.playerBase!).pct).toBeGreaterThan(0);
    expect(st.base.resources.wood).toBeLessThan(5000);
  });
});
