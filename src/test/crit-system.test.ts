import { describe, expect, it } from 'vitest';

import type { PlayerState } from '@/game/types';
import { critChance, rollCrit } from '@/game/systems/attributesSystem';
import { useGameStore } from '@/game/state/game-store';

function player(dex: number): PlayerState {
  const base = useGameStore.getState().player;
  return { ...base, level: 1, attributes: { damage: 0, dexterity: dex, carry: 0, moveSpeed: 0 } };
}

describe('crit por destreza', () => {
  it('destreza 0 = nunca crita (zero regressão)', () => {
    expect(critChance(player(0))).toBe(0);
    expect(rollCrit(player(0), () => 0)).toBe(false);
  });

  it('mais destreza = mais chance, com teto de 40%', () => {
    expect(critChance(player(50))).toBeCloseTo(0.2, 5);
    expect(critChance(player(100))).toBe(0.4);
    expect(critChance(player(250))).toBe(0.4); // trava no teto
  });

  it('crita quando o sorteio cai abaixo da chance', () => {
    expect(rollCrit(player(100), () => 0.3)).toBe(true);  // 0.3 < 0.4
    expect(rollCrit(player(100), () => 0.5)).toBe(false); // 0.5 >= 0.4
  });
});
