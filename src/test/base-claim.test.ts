import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/game/state/game-store';
import { createInventory } from '@/game/systems/inventorySystem';
import {
  claimRadius, isInsideBase, MAX_BASE_TIER, upgradeCost, type PlayerBase,
} from '@/game/systems/baseClaimSystem';

describe('base/claim — números', () => {
  it('o raio do terreno cresce com o tier', () => {
    expect(claimRadius(1)).toBe(5);
    expect(claimRadius(3)).toBeGreaterThan(claimRadius(1));
  });

  it('o custo de evoluir sobe por tier', () => {
    expect(upgradeCost(2)).toEqual({ wood: 24, stone: 16 });
    expect(upgradeCost(3).wood).toBeGreaterThan(upgradeCost(2).wood);
  });

  it('isInsideBase: dentro do raio = true, longe = false', () => {
    const base: PlayerBase = { position: { x: 10, z: 10 }, tier: 1, claimedAt: 0 };
    expect(isInsideBase(base, { x: 11, z: 10 })).toBe(true);
    expect(isInsideBase(base, { x: 40, z: 40 })).toBe(false);
    expect(isInsideBase(null, { x: 0, z: 0 })).toBe(false);
  });
});

describe('base/claim — store', () => {
  beforeEach(() => {
    useGameStore.setState(s => ({
      playerBase: null,
      player: { ...s.player, inventory: createInventory([{ itemId: 'wood', quantity: 60 }, { itemId: 'stone', quantity: 60 }]) },
    }));
  });

  it('upgradeBase gasta recursos e sobe o tier', () => {
    useGameStore.setState({ playerBase: { position: { x: 5, z: 5 }, tier: 1, claimedAt: 0 } });
    useGameStore.getState().upgradeBase();
    const b = useGameStore.getState().playerBase!;
    expect(b.tier).toBe(2);
    // gastou 24 madeira + 16 pedra
    expect(useGameStore.getState().getItemCount('wood')).toBe(36);
    expect(useGameStore.getState().getItemCount('stone')).toBe(44);
  });

  it('sem recursos, não evolui', () => {
    useGameStore.setState(s => ({
      playerBase: { position: { x: 5, z: 5 }, tier: 1, claimedAt: 0 },
      player: { ...s.player, inventory: createInventory([]) },
    }));
    useGameStore.getState().upgradeBase();
    expect(useGameStore.getState().playerBase!.tier).toBe(1);
  });

  it('não passa do tier máximo', () => {
    useGameStore.setState({ playerBase: { position: { x: 5, z: 5 }, tier: MAX_BASE_TIER, claimedAt: 0 } });
    useGameStore.getState().upgradeBase();
    expect(useGameStore.getState().playerBase!.tier).toBe(MAX_BASE_TIER);
  });

  it('claimBase não cria uma segunda base se já existe', () => {
    const existing: PlayerBase = { position: { x: 5, z: 5 }, tier: 2, claimedAt: 1 };
    useGameStore.setState({ playerBase: existing });
    useGameStore.getState().claimBase();
    expect(useGameStore.getState().playerBase).toEqual(existing);
  });
});
