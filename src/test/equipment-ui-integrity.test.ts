import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ARMOR_SLOTS,
  equipmentKeyForArmorSlot,
  isEquipped,
  ringSlotForEquipment,
} from '@/game/systems/equipmentSlots';
import type { EquipmentSlots } from '@/game/types/inventory';

const routeSource = readFileSync(join(process.cwd(), 'src/routes/index.tsx'), 'utf8');
const cssSource = readFileSync(join(process.cwd(), 'src/styles.css'), 'utf8');

function equipment(overrides: Partial<EquipmentSlots> = {}): EquipmentSlots {
  return {
    primary: null, secondary: null, armor: null, accessory: null,
    head: null, gloves: null, legs: null, boots: null, amulet: null, ring1: null, ring2: null,
    ...overrides,
  };
}

describe('equipment slots UI contract', () => {
  it('preserva ordem dos 8 slots e mapeia chest para armor', () => {
    expect(ARMOR_SLOTS).toEqual(['head', 'chest', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2']);
    expect(equipmentKeyForArmorSlot('chest')).toBe('armor');
    expect(ARMOR_SLOTS.filter(slot => slot !== 'chest').map(equipmentKeyForArmorSlot)).toEqual(['head', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2']);
  });

  it('detecta item equipado em todos slots, incluindo legado', () => {
    for (const slot of ['primary', 'secondary', 'armor', 'accessory', 'head', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2'] as const) {
      expect(isEquipped(equipment({ [slot]: 'item-x' }), 'item-x')).toBe(true);
    }
    expect(isEquipped(equipment({ ring2: 'other' }), 'item-x')).toBe(false);
  });

  it('mantém ordem de escolha dos anéis', () => {
    expect(ringSlotForEquipment(equipment())).toBe('ring1');
    expect(ringSlotForEquipment(equipment({ ring1: 'a' }))).toBe('ring2');
    expect(ringSlotForEquipment(equipment({ ring1: 'a', ring2: 'b' }))).toBe('ring1');
  });
});

describe('routes/index.tsx UI integrity', () => {
  it('usa contrato central para renderizar equipamento, sprites, desequipar e vida efetiva', () => {
    for (const token of ['ARMOR_SLOTS', 'equipmentKeyForArmorSlot', 'isEquipped', 'ItemSprite', 'unequipSlot', 'effectiveMaxHp', 'RARITY_LABEL', 'equipmentStats', 'effectiveResistance', 'luckMultiplier']) {
      expect(routeSource).toContain(token);
    }
    for (const slot of ['head', 'chest', 'gloves', 'legs', 'boots', 'amulet', 'ring1', 'ring2']) {
      expect(routeSource).toContain(slot);
    }
    expect(routeSource).toMatch(/equipment\.accessory\s*&&/);
    expect(routeSource).toMatch(/const maxHp = effectiveMaxHp\(player\)/);
    expect(routeSource).toMatch(/name: 'Vida',[\s\S]*max: maxHp/);
  });
});

describe('equipment CSS integrity', () => {
  it('define seis tiers, grade mobile 4 colunas e alvos de toque', () => {
    for (const rarity of ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ancestral']) {
      expect(cssSource).toContain(`rarity-${rarity}`);
    }
    expect(cssSource).toMatch(/\.equip-slots-grid\s*\{[^}]*repeat\(4/);
    expect(cssSource).toMatch(/\.equip-slot[^}]*min-height:\s*50px/);
  });
});
