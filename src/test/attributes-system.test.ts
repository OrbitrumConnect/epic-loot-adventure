import { describe, expect, it } from 'vitest';

import type { PlayerState } from '@/game/types';
import { MAX_LEVEL, specialCooldown } from '@/game/systems/progressionSystem';
import {
  ATTRIBUTE_CAPS, BASE_MAX_WEIGHT, damageMultiplier, effectiveAttributes,
  effectiveMaxWeight, effectiveSpecialCooldown, levelAttributes, weaponDamageBonus,
} from '@/game/systems/attributesSystem';
import { useGameStore } from '@/game/state/game-store';

/** Jogador base real, com overrides pontuais. */
function player(overrides: Partial<PlayerState> = {}): PlayerState {
  const base = useGameStore.getState().player;
  return { ...base, ...overrides };
}

describe('atributos por nível', () => {
  it('nível 1 não dá bônus nenhum (neutro = zero regressão)', () => {
    expect(levelAttributes(1)).toEqual({ damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 });
  });

  it('no nível máximo cada atributo chega no seu teto', () => {
    expect(levelAttributes(MAX_LEVEL)).toEqual(ATTRIBUTE_CAPS);
  });

  it('cresce de forma monotônica com o nível', () => {
    let prev = -1;
    for (let lv = 1; lv <= MAX_LEVEL; lv++) {
      const c = levelAttributes(lv).carry;
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });
});

describe('bônus de dano por equipamento', () => {
  it('sem arma equipada = 0', () => {
    const p = player();
    p.inventory.equipment.primary = null;
    expect(weaponDamageBonus(p.inventory)).toBe(0);
  });

  it('arma rara soma dano%', () => {
    const p = player();
    p.inventory.equipment.primary = 'pistol'; // rara
    expect(weaponDamageBonus(p.inventory)).toBe(8);
  });
});

describe('atributos efetivos', () => {
  it('nível 1 sem equip = tudo 0 e multiplicador de dano = 1', () => {
    const p = player({ level: 1 });
    p.inventory.equipment.primary = null;
    expect(effectiveAttributes(p)).toEqual({ damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 });
    expect(damageMultiplier(p)).toBe(1);
  });

  it('soma nível + equip no dano', () => {
    const p = player({ level: MAX_LEVEL });
    p.inventory.equipment.primary = 'pistol'; // +8, mas trava em 100
    // nível máximo dá 40 de dano + 8 do equip = 48 (dentro do teto 100).
    expect(effectiveAttributes(p).damage).toBe(ATTRIBUTE_CAPS.damage + 8);
  });

  it('nunca passa de 100%', () => {
    const p = player({ level: MAX_LEVEL, attributes: { damage: 90, dexterity: 90, carry: 90, moveSpeed: 90 } });
    const a = effectiveAttributes(p);
    expect(a.damage).toBeLessThanOrEqual(100);
    expect(a.carry).toBeLessThanOrEqual(100);
    expect(a.moveSpeed).toBeLessThanOrEqual(100);
  });
});

describe('capacidade da bolsa', () => {
  it('nível 1 = peso base (40)', () => {
    expect(effectiveMaxWeight(player({ level: 1 }))).toBe(BASE_MAX_WEIGHT);
  });

  it('nível máximo carrega bem mais', () => {
    const maxw = effectiveMaxWeight(player({ level: MAX_LEVEL }));
    expect(maxw).toBeGreaterThan(BASE_MAX_WEIGHT);
    // carry 100% no máximo → dobra.
    expect(maxw).toBe(BASE_MAX_WEIGHT * 2);
  });
});

describe('cadência do especial (destreza)', () => {
  it('nível 1 = exatamente specialCooldown(1) (sem regressão)', () => {
    expect(effectiveSpecialCooldown(player({ level: 1 }))).toBe(specialCooldown(1));
  });

  it('destreza reduz a cadência além do que o nível já reduz', () => {
    const semDex = player({ level: 10, attributes: { damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 } });
    const comDex = player({ level: 10, attributes: { damage: 0, dexterity: 80, carry: 0, moveSpeed: 0 } });
    expect(effectiveSpecialCooldown(comDex)).toBeLessThan(effectiveSpecialCooldown(semDex));
  });

  it('nunca desce abaixo de 1.5s', () => {
    const p = player({ level: MAX_LEVEL, attributes: { damage: 0, dexterity: 100, carry: 0, moveSpeed: 0 } });
    expect(effectiveSpecialCooldown(p)).toBeGreaterThanOrEqual(1.5);
  });
});
