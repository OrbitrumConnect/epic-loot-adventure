import { describe, expect, it } from 'vitest';

import { addItem, canAddItem, createInventory, getItemCount, POTION_SLOT } from '@/game/systems/inventorySystem';

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

describe('slot reservado da poção (fixo)', () => {
  it('poção é coletável MESMO com a bolsa cheia de peso (vai pro slot fixo)', () => {
    const inv = createInventory();
    for (let i = 0; i < inv.slots.length; i++) {
      if (i !== POTION_SLOT) inv.slots[i] = { itemId: 'stone', quantity: 500 }; // estoura o peso
    }
    expect(canAddItem(inv, 'health_potion', 10)).toBe(true); // sem bloqueio de peso no slot fixo
    const after = addItem(inv, 'health_potion', 10);
    expect(after.slots[POTION_SLOT]!.itemId).toBe('health_potion');
    expect(after.slots[POTION_SLOT]!.quantity).toBe(10);
  });

  it('item comum NÃO ocupa o slot reservado da poção', () => {
    const inv = createInventory();
    const after = addItem(inv, 'wood', 5);
    expect(after.slots[POTION_SLOT]!.itemId).not.toBe('wood');
  });
});
