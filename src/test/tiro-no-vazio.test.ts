import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';

/* Mira em 3ª pessoa "igual CS" (Pedro, 22/10): pontinho vazio com arma de longe = tiro no vazio —
   gasta 1 bala, respeita a cadência, não acerta ninguém. Corpo a corpo devolve false. */
const initial = useGameStore.getState();
const hold = (itemId: string, ammo = 10) => useGameStore.setState(s => ({
  ui: { ...s.ui, selectedHotbar: 0 },
  player: { ...s.player, dead: false, lastAttackAt: 0,
    inventory: createInventory([{ itemId, quantity: 1 }, { itemId: 'ammo', quantity: ammo }]) },
}));

describe('tiro no vazio (fireMiss)', () => {
  afterEach(() => useGameStore.setState(initial, true));

  it('fuzil: gasta 1 bala e a 2ª no mesmo instante é engolida pela cadência', () => {
    hold('rifle');
    const hp = useGameStore.getState().creatures.map(c => c.hp);
    expect(useGameStore.getState().fireMiss({ x: 10, z: 10 })).toBe(true);
    expect(getItemCount(useGameStore.getState().player.inventory, 'ammo')).toBe(9);
    expect(useGameStore.getState().fireMiss({ x: 10, z: 10 })).toBe(true);
    expect(getItemCount(useGameStore.getState().player.inventory, 'ammo')).toBe(9);
    expect(useGameStore.getState().creatures.map(c => c.hp)).toEqual(hp); // ninguém tomou dano
  });

  it('sem bala: não atira (avisa); espada: false (usa o ataque de sempre)', () => {
    hold('rifle', 0);
    expect(useGameStore.getState().fireMiss({ x: 1, z: 1 })).toBe(true);
    expect(useGameStore.getState().ui.message).toMatch(/Sem munição/);
    hold('eclipse_blade');
    expect(useGameStore.getState().fireMiss({ x: 1, z: 1 })).toBe(false);
  });
});
