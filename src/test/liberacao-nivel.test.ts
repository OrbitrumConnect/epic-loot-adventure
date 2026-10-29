import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';
import { isUnlocked, unlockLevel, UNLOCK_LEVEL } from '@/game/systems/unlockSystem';

/* Pedro 29/10: "os itens liberam com nível — carrinho 25, prancha 5, fuzil 35 (skate voador 15, asa-delta 8)". */
const initial = useGameStore.getState();
const holdAt = (level: number, itemId: string) => useGameStore.setState(s => ({
  ui: { ...s.ui, selectedHotbar: 1 },
  player: { ...s.player, level, dead: false, lastAttackAt: 0,
    inventory: createInventory([{ itemId: 'iron_sword', quantity: 1 }, { itemId, quantity: 1 }, { itemId: 'ammo', quantity: 10 }]) },
}));

describe('liberação por nível (unlockSystem)', () => {
  afterEach(() => useGameStore.setState(initial, true));

  it('tabela do Pedro: prancha 5, asa-delta 8, skate 15, carro 25, fuzil 35; o resto é livre', () => {
    expect(UNLOCK_LEVEL).toMatchObject({ surfboard: 5, hang_glider: 8, hover_skate: 15, flying_car: 25, rifle: 35 });
    expect(unlockLevel('iron_sword')).toBe(1);
    expect(isUnlocked('rifle', 34)).toBe(false);
    expect(isUnlocked('rifle', 35)).toBe(true);
    expect(isUnlocked(null, 1)).toBe(true);
  });

  it('nível 34: o fuzil NÃO vai pra mão nem atira (avisa) — e continua na mochila', () => {
    holdAt(34, 'rifle');
    useGameStore.setState(s => ({ ui: { ...s.ui, selectedHotbar: 0 } }));
    useGameStore.getState().useHotbarSlot(1);
    expect(useGameStore.getState().ui.selectedHotbar).toBe(0);
    expect(useGameStore.getState().ui.message).toMatch(/nível 35/);
    // save antigo já com o fuzil selecionado: o tiro não sai, nenhuma bala gasta
    useGameStore.setState(s => ({ ui: { ...s.ui, selectedHotbar: 1 } }));
    useGameStore.getState().fireMiss({ x: 5, z: 5 });
    expect(getItemCount(useGameStore.getState().player.inventory, 'ammo')).toBe(10);
    expect(getItemCount(useGameStore.getState().player.inventory, 'rifle')).toBe(1);
    useGameStore.getState().equipItem('rifle');
    expect(useGameStore.getState().player.inventory.equipment.primary).not.toBe('rifle');
  });

  it('nível 35: o fuzil vai pra mão e atira', () => {
    holdAt(35, 'rifle');
    useGameStore.setState(s => ({ ui: { ...s.ui, selectedHotbar: 0 } }));
    useGameStore.getState().useHotbarSlot(1);
    expect(useGameStore.getState().ui.selectedHotbar).toBe(1);
    useGameStore.getState().fireMiss({ x: 5, z: 5 });
    expect(getItemCount(useGameStore.getState().player.inventory, 'ammo')).toBe(9);
  });

  it('prancha: nível 4 não pega, nível 5 pega', () => {
    holdAt(4, 'surfboard');
    useGameStore.setState(s => ({ ui: { ...s.ui, selectedHotbar: 0 } }));
    useGameStore.getState().useHotbarSlot(1);
    expect(useGameStore.getState().ui.selectedHotbar).toBe(0);
    useGameStore.setState(s => ({ player: { ...s.player, level: 5 } }));
    useGameStore.getState().useHotbarSlot(1);
    expect(useGameStore.getState().ui.selectedHotbar).toBe(1);
  });

  it('o piloto nunca escolhe arma travada; o carro da Zona Sul pede o nível 25; hotbar/ficha mostram o cadeado', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/if \(!isUnlocked\(slot\.itemId, level\)\) return; \/\/ travada por nível: o piloto nem considera/);
    expect(fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8')).toMatch(/!isUnlocked\('flying_car', lvl\)/);
    expect(fs.readFileSync('src/routes/index.tsx', 'utf8')).toMatch(/slot-lock/);
    expect(fs.readFileSync('src/components/hud/character-sheet.tsx', 'utf8')).toMatch(/cs-lock/);
  });
});
