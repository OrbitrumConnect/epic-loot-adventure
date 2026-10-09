import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/game/state/game-store';
import { equippedArmor, mitigateDamage } from '@/game/systems/attributesSystem';

const resetEquip = () =>
  useGameStore.setState(s => ({
    player: { ...s.player, inventory: { ...s.player.inventory, equipment: { primary: null, secondary: null, armor: null, accessory: null } } },
  }));

describe('equipar por categoria', () => {
  beforeEach(resetEquip);

  it('arma vai pro slot primary', () => {
    useGameStore.getState().equipItem('iron_sword');
    expect(useGameStore.getState().player.inventory.equipment.primary).toBe('iron_sword');
  });

  it('armadura vai pro slot armor (não vira "arma")', () => {
    useGameStore.getState().equipItem('bone_armor');
    const eq = useGameStore.getState().player.inventory.equipment;
    expect(eq.armor).toBe('bone_armor');
    expect(eq.primary).toBeNull();
  });

  it('desequipar limpa o slot', () => {
    useGameStore.getState().equipItem('bone_armor');
    useGameStore.getState().unequipSlot('armor');
    expect(useGameStore.getState().player.inventory.equipment.armor).toBeNull();
  });

  it('item não equipável é ignorado', () => {
    useGameStore.getState().equipItem('wood');
    expect(useGameStore.getState().player.inventory.equipment.primary).toBeNull();
  });
});

describe('armadura reduz o dano', () => {
  beforeEach(resetEquip);

  it('sem armadura, dano cheio', () => {
    const p = useGameStore.getState().player;
    expect(equippedArmor(p)).toBe(0);
    expect(mitigateDamage(10, p)).toBe(10);
  });

  it('com armadura, dano menor (mas nunca abaixo de 1)', () => {
    useGameStore.getState().equipItem('guardian_plate'); // armor 26
    const p = useGameStore.getState().player;
    expect(equippedArmor(p)).toBe(26);
    expect(mitigateDamage(10, p)).toBeLessThan(10);
    expect(mitigateDamage(1, p)).toBe(1);
  });
});
