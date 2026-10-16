import { describe, expect, it } from 'vitest';

import { addItem, canAddItem, createInventory, getItemCount } from '@/game/systems/inventorySystem';

describe('capacidade de pilhas do inventário', () => {
  it('não aceita uma recompensa que só cabe parcialmente na pilha de munição', () => {
    const inventory = createInventory([{ itemId: 'ammo', quantity: 250 }]);
    for (let index = 1; index < inventory.slots.length; index += 1) {
      inventory.slots[index] = { itemId: 'wood', quantity: 1 };
    }

    expect(canAddItem(inventory, 'ammo', 80)).toBe(false);
    expect(getItemCount(addItem(inventory, 'ammo', 80), 'ammo')).toBe(300);
  });

  it('aceita a recompensa inteira quando há espaço para a segunda pilha', () => {
    const inventory = createInventory([{ itemId: 'ammo', quantity: 250 }]);

    expect(canAddItem(inventory, 'ammo', 80)).toBe(true);
    expect(getItemCount(addItem(inventory, 'ammo', 80), 'ammo')).toBe(330);
  });
});
