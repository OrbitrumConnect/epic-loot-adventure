import type { Item, ArmorSlot, Rarity } from '../types';
import { RARITY_MULT } from '../types/item';

export const ARMOR_STAT_TABLE: Record<ArmorSlot, Record<string, number>> = {
  head: { defense: 3, resistance: 2 }, chest: { defense: 6, health: 8 }, gloves: { defense: 2, damage: 2 },
  legs: { defense: 3, speed: 2 }, boots: { speed: 3, defense: 1 }, amulet: { health: 5, luck: 2, resistance: 2 },
  ring1: { damage: 2, luck: 2, speed: 1 }, ring2: { damage: 1, luck: 3, speed: 2 },
};
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
const tiers: Rarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral'];
const weights: Record<ArmorSlot, number> = { head: 2, chest: 6, gloves: 1, legs: 3, boots: 2, amulet: 0.5, ring1: 0.2, ring2: 0.2 };
const icon: Record<ArmorSlot, string> = { head: 'Shield', chest: 'Shield', gloves: 'Shield', legs: 'Shield', boots: 'Shield', amulet: 'Gem', ring1: 'Gem', ring2: 'Gem' };
const idFor = (slot: ArmorSlot, tier: Rarity) => `${slot}_${tier}`;

function statsFor(slot: ArmorSlot, tier: Rarity) {
  const mult = RARITY_MULT[tier];
  return Object.fromEntries(Object.entries(ARMOR_STAT_TABLE[slot]).map(([key, value]) => [key, Math.max(1, Math.round(value * mult))]));
}

export const ARMOR_ITEMS: Record<string, Item> = {};
for (const slot of Object.keys(names) as ArmorSlot[]) {
  for (const [index, rarity] of tiers.entries()) {
    if (slot === 'chest' && index === 0) continue;
    const id = idFor(slot, rarity);
    ARMOR_ITEMS[id] = { id, name: names[slot][index]!, category: 'armor', rarity, equipSlot: slot, weight: weights[slot], maxStack: 1, dropOnDeath: false, usable: false, equippable: true, stats: statsFor(slot, rarity), icon: icon[slot] };
  }
}
