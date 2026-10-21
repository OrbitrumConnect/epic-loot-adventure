import { describe, expect, it } from 'vitest';
import { pvpBaseDamage, pvpPlayerDamage, PVP_MAX_HIT_FRACTION } from '../game/systems/pvpSystem';

const noArmor = (n: number) => n;

describe('PvP justo (sem morrer num golpe)', () => {
  it('bate 40% do dano de PvE', () => {
    expect(pvpPlayerDamage(50, 1000, noArmor)).toBe(20);
  });

  it('golpe gigante NÃO mata: teto de 20% da vida máxima → ≥5 golpes', () => {
    const maxHp = 196;
    const hit = pvpPlayerDamage(10_000, maxHp, noArmor);
    expect(hit).toBe(Math.floor(maxHp * PVP_MAX_HIT_FRACTION));
    expect(Math.ceil(maxHp / hit)).toBeGreaterThanOrEqual(5);
  });

  it('a armadura do ALVO reduz', () => {
    const halfArmor = (n: number) => n / 2;
    expect(pvpPlayerDamage(100, 1000, halfArmor)).toBe(20);
  });

  it('nunca menos que 1', () => {
    expect(pvpPlayerDamage(0, 100, noArmor)).toBe(1);
    expect(pvpBaseDamage(0)).toBe(1);
  });

  it('base inimiga leva 40% do dano', () => {
    expect(pvpBaseDamage(80)).toBe(32);
  });
});
