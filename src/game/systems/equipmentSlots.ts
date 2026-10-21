import type { EquipmentSlots, Item, ArmorSlot } from '../types';

export const ARMOR_SLOTS: ArmorSlot[] = ['head', 'chest', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2'];
export type EquipmentKey = keyof EquipmentSlots;

export function equipmentKeyForArmorSlot(slot: ArmorSlot): EquipmentKey {
  return slot === 'chest' ? 'armor' : slot;
}

export function isEquipped(equipment: EquipmentSlots, itemId: string): boolean {
  return Object.values(equipment).some(id => id === itemId);
}

export function slotForItem(item: Item): EquipmentKey | null {
  if (!item.equippable) return null;
  if (item.category === 'weapon') return 'primary';
  if (item.category === 'armor') {
    if (item.equipSlot === 'chest' || !item.equipSlot) return 'armor';
    return item.equipSlot;
  }
  if (item.equipSlot === 'amulet') return 'amulet';
  if (item.equipSlot === 'accessory') return 'accessory';
  if (item.equipSlot === 'ring1' || item.equipSlot === 'ring2') return item.equipSlot;
  if (item.equipSlot === 'head' || item.equipSlot === 'gloves' || item.equipSlot === 'legs' || item.equipSlot === 'boots') return item.equipSlot;
  if (item.equipSlot === undefined && item.category === 'utility') return 'primary';
  return item.category === 'tool' ? 'primary' : null;
}

export function ringSlotForEquipment(equipment: EquipmentSlots): 'ring1' | 'ring2' {
  return (equipment.ring1 ?? null) === null ? 'ring1' : (equipment.ring2 ?? null) === null ? 'ring2' : 'ring1';
}
