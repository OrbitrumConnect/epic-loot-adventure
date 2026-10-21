import { describe, expect, it } from 'vitest';

import { addItem, canAddItem, createInventory, getItemCount } from '@/game/systems/inventorySystem';

// Usa 'trap' (maxStack 5, item leve) pra testar a regra ATÔMICA de pilha sem depender do
// teto de bala/poção (que agora é enorme — o peso da bolsa é o limite real desses).
describe('capacidade de pilhas do inventário (atômico)', () => {
  it('não aceita uma recompensa que só cabe parcialmente numa pilha', () => {
    const inventory = createInventory([{ itemId: 'trap', quantity: 3 }]); // cabe +2 na pilha (max 5)
    for (let index = 1; index < inventory.slots.length; index += 1) {
      inventory.slots[index] = { itemId: 'wood', quantity: 1 }; // sem slot livre pra 2ª pilha
    }
    expect(canAddItem(inventory, 'trap', 4)).toBe(false);          // só cabe 2, não 4
    expect(getItemCount(addItem(inventory, 'trap', 4), 'trap')).toBe(5); // enche a pilha
  });

  it('aceita a recompensa inteira quando há espaço para a segunda pilha', () => {
    const inventory = createInventory([{ itemId: 'trap', quantity: 3 }]);
    expect(canAddItem(inventory, 'trap', 4)).toBe(true);           // há slots vazios
    expect(getItemCount(addItem(inventory, 'trap', 4), 'trap')).toBe(7);
  });
});
