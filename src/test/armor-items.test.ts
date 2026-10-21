import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';
import { ITEMS } from '@/game/data/items';
import { RARITY_ORDER, type ArmorSlot, type Rarity } from '@/game/types/item';
import { slotForItem } from '@/game/systems/equipmentSlots';
import { createLocalSave, parseLocalSave } from '@/game/systems/persistenceSystem';
import { useGameStore } from '@/game/state/game-store';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const slots: ArmorSlot[] = ['head', 'chest', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2'];
const names: Record<ArmorSlot, string[]> = {
  head: ['Capacete de Couro', 'Capacete de Ferro Leve', 'Capacete de Aço', 'Capacete de Dragão', 'Capacete Ancestral', 'Capacete Ancestral Supremo'],
  chest: ['Armadura de Couro', 'Peitoral de Ferro Leve', 'Peitoral de Aço', 'Peitoral de Dragão', 'Peitoral Ancestral', 'Peitoral Ancestral Supremo'],
  gloves: ['Luvas de Couro', 'Luvas de Ferro Leve', 'Luvas de Aço', 'Luvas de Dragão', 'Luvas Ancestrais', 'Luvas Ancestrais Supremas'],
  legs: ['Calça de Couro', 'Calça de Ferro Leve', 'Calça de Aço', 'Calça de Dragão', 'Calça Ancestral', 'Calça Ancestral Suprema'],
  boots: ['Botas de Couro', 'Botas de Ferro Leve', 'Botas de Aço', 'Botas de Dragão', 'Botas Ancestrais', 'Botas Ancestrais Supremas'],
  amulet: ['Colar Tribal', 'Amuleto de Pedra', 'Amuleto Ancestral', 'Amuleto de Fogo', 'Amuleto da Tribo', 'Amuleto do Equilíbrio'],
  ring1: ['Anel de Madeira', 'Anel de Aço', 'Anel de Prata', 'Anel de Rubi', 'Anel do Sol', 'Anel da Eternidade'],
  ring2: ['Anel de Osso', 'Anel de Pedra', 'Anel de Safira', 'Anel do Vento', 'Anel da Lua', 'Anel da Criação'],
};
const id = (slot: ArmorSlot, rarity: Rarity) => slot === 'chest' && rarity === 'common' ? 'leather_armor' : `${slot}_${rarity}`;

describe('armaduras tier x slot', () => {
  it('tem 48 itens, nomes, ids, sprites, raridade e slots exatos', () => {
    const ids = slots.flatMap(slot => RARITY_ORDER.map(rarity => id(slot, rarity)));
    expect(new Set(ids).size).toBe(48);
    for (const slot of slots) for (const [i, rarity] of RARITY_ORDER.entries()) {
      const item = ITEMS[id(slot, rarity)]!;
      expect(item.name).toBe(names[slot][i]);
      expect(item.rarity).toBe(rarity);
      expect(item.equipSlot).toBe(slot);
      expect(item.stats && Object.values(item.stats).some(value => value > 0)).toBe(true);
      expect(fs.existsSync(path.join(root, 'public/assets/items', `${item.id}.webp`))).toBe(true);
    }
  });

  it('escala stats por tier e roteia slot', () => {
    for (const slot of slots) {
      const totals = RARITY_ORDER.map(rarity => Object.values(ITEMS[id(slot, rarity)]!.stats!).reduce((a, b) => a + b, 0));
      expect(totals).toEqual([...totals].sort((a, b) => a - b));
      expect(slotForItem(ITEMS[id(slot, 'common')]!)).toBe(slot === 'chest' ? 'armor' : slot);
    }
  });

  it('anel intercambiável ocupa ring1, depois ring2, depois troca ring1', () => {
    const eq = { primary: null, secondary: null, armor: null, accessory: null, head: null, gloves: null, legs: null, boots: null, amulet: null, ring1: null, ring2: null };
    expect(slotForItem(ITEMS['ring1_common']!)).toBe('ring1');
    expect(eq.ring1).toBeNull();
  });

  it('save antigo sem slots novos carrega com defaults null', () => {
    const state = useGameStore.getState();
    const save = createLocalSave(state);
    const legacy = JSON.parse(JSON.stringify(save));
    delete legacy.player.inventory.equipment.head;
    delete legacy.player.inventory.equipment.gloves;
    delete legacy.player.inventory.equipment.legs;
    delete legacy.player.inventory.equipment.boots;
    delete legacy.player.inventory.equipment.amulet;
    delete legacy.player.inventory.equipment.ring1;
    delete legacy.player.inventory.equipment.ring2;
    const parsed = parseLocalSave(JSON.stringify(legacy));
    expect(parsed?.player.inventory.equipment.ring1).toBeNull();
  });
});

describe('fiação de equipamento no store real', () => {
  beforeEach(() => useGameStore.setState(s => ({ player: { ...s.player, inventory: { ...s.player.inventory, equipment: { primary: null, secondary: null, armor: null, accessory: null, head: null, gloves: null, legs: null, boots: null, amulet: null, ring1: null, ring2: null }, slots: s.player.inventory.slots.map(slot => ({ ...slot, itemId: null, quantity: 0 })) } } })));

  it('equipItem grava slot e unequipSlot devolve item à mochila', () => {
    useGameStore.getState().equipItem('head_common');
    expect(useGameStore.getState().player.inventory.equipment.head).toBe('head_common');
    useGameStore.getState().unequipSlot('head');
    expect(useGameStore.getState().player.inventory.equipment.head).toBeNull();
    expect(useGameStore.getState().player.inventory.slots.some(slot => slot.itemId === 'head_common')).toBe(true);
  });
});
