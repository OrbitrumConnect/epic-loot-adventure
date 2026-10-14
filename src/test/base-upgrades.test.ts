import { describe, it, expect } from 'vitest';
import {
  UPGRADE_CARDS, rollUpgradeChoices, towerDamageMult, wallHpMult, coreHpMult,
} from '@/game/data/base-upgrades';

describe('base-upgrades (cartas de evolução da base)', () => {
  it('sorteia 3 cartas DISTINTAS', () => {
    const rng = () => 0.5;
    const ids = rollUpgradeChoices(rng);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(3); // sem repetição
    for (const id of ids) expect(UPGRADE_CARDS[id]).toBeTruthy();
  });

  it('cada carta tem nome, descrição e ícone', () => {
    for (const card of Object.values(UPGRADE_CARDS)) {
      expect(card.name.length).toBeGreaterThan(0);
      expect(card.description.length).toBeGreaterThan(0);
      expect(card.icon.length).toBeGreaterThan(0);
    }
  });

  it('dano da torre sobe +25% por stack', () => {
    expect(towerDamageMult(0)).toBe(1);
    expect(towerDamageMult(1)).toBeCloseTo(1.25);
    expect(towerDamageMult(4)).toBeCloseTo(2);
  });

  it('muro e núcleo têm multiplicadores positivos', () => {
    expect(wallHpMult()).toBeGreaterThan(1);
    expect(coreHpMult()).toBeGreaterThan(1);
  });
});
