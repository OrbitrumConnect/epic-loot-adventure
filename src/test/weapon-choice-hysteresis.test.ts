import { describe, expect, it } from 'vitest';

import { pickWeaponFor, type AutoWeapon } from '@/game/systems/weaponChoiceSystem';

const sword: AutoWeapon = {
  hotbarIndex: 0, itemId: 'iron_sword', type: 'melee', range: 4,
  cooldown: 0.8, attackPower: 25, hasAmmo: true,
};
const rifle: AutoWeapon = {
  hotbarIndex: 10, itemId: 'rifle', type: 'rifle', range: 12,
  cooldown: 0.8, attackPower: 30, hasAmmo: true,
};

describe('weaponChoiceSystem — histerese da fronteira melee/ranged', () => {
  it('mantém a arma durante pequenas oscilações em torno da fronteira', () => {
    const weapons = [sword, rifle];
    let heldIndex = rifle.hotbarIndex;

    const choose = (dist: number) => {
      const picked = pickWeaponFor(dist, weapons, 'auto', heldIndex);
      expect(picked).not.toBeNull();
      heldIndex = picked!.hotbarIndex;
      return picked!.type;
    };

    expect([3.1, 2.9, 3.1, 2.9].map(choose)).toEqual([
      'rifle', 'rifle', 'rifle', 'rifle',
    ]);
  });
});
