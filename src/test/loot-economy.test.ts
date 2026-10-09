import { describe, expect, it } from 'vitest';

import { CREATURES } from '@/game/data/creatures';
import { ITEMS } from '@/game/data/items';
import {
  accessibleRarities, BONUS_POOLS, HUNT_THRESHOLDS, rollBonusLoot,
} from '@/game/systems/lootEconomySystem';

const bear = CREATURES['bear']!; // bicho forte (bom valor de caça)

describe('economia de loot — acesso por marco de valor', () => {
  it('abaixo do primeiro marco, nenhuma raridade de bônus', () => {
    expect(accessibleRarities(0)).toEqual([]);
    expect(accessibleRarities(HUNT_THRESHOLDS.rare - 1)).toEqual([]);
  });

  it('cada marco desbloqueia a raridade seguinte (cumulativo)', () => {
    expect(accessibleRarities(HUNT_THRESHOLDS.rare)).toEqual(['rare']);
    expect(accessibleRarities(HUNT_THRESHOLDS.epic)).toEqual(['rare', 'epic']);
    expect(accessibleRarities(HUNT_THRESHOLDS.mythic)).toEqual(['rare', 'epic', 'mythic']);
  });

  it('os pools apontam pra itens reais com a raridade certa', () => {
    for (const [rarity, ids] of Object.entries(BONUS_POOLS)) {
      for (const id of ids) {
        expect(ITEMS[id], id).toBeTruthy();
        expect(ITEMS[id]!.rarity).toBe(rarity);
      }
    }
  });
});

describe('economia de loot — roll de bônus', () => {
  it('sem valor acumulado, nunca dá bônus (zero regressão)', () => {
    expect(rollBonusLoot(bear, HUNT_THRESHOLDS.rare - 1, 0, () => 0)).toBeNull();
  });

  it('com acesso e sorte, cai um item do tier (raridade correta)', () => {
    const drop = rollBonusLoot(bear, HUNT_THRESHOLDS.rare, 0, () => 0);
    expect(drop).not.toBeNull();
    expect(ITEMS[drop!.itemId]!.rarity).toBe('rare');
  });

  it('diminishing returns: farmar a mesma espécie derruba a chance', () => {
    const rng = () => 0.1; // fixo: cai com espécie "nova", falha quando muito farmada
    expect(rollBonusLoot(bear, HUNT_THRESHOLDS.rare, 0, rng)).not.toBeNull();
    expect(rollBonusLoot(bear, HUNT_THRESHOLDS.rare, 12, rng)).toBeNull();
  });
});
