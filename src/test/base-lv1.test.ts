import { beforeEach, describe, expect, it } from 'vitest';

import type { PlayerBaseState } from '@/game/types/playerbase';
import { useGameStore } from '@/game/state/game-store';
import { createInventory } from '@/game/systems/inventorySystem';
import { baseLv1Layout, baseLv1Progress } from '@/game/systems/baseLv1';

const baseAt = (): PlayerBaseState => ({
  id: 'base_test',
  owner: { kind: 'player', id: 'p', name: 'Kael' },
  worldPosition: { x: 0, z: 0 },
  origin: { gx: 0, gz: 0 },
  size: 8,
  stage: 'bed',
  pieces: [{ id: 'core', kind: 'core', cell: { gx: 3, gz: 3 }, rotation: 0, hp: 100, maxHp: 100, tier: 1 }],
  enclosed: false,
  claimedAt: 0,
  lastDamagedAt: null,
});

describe('layout Lv1 padrão', () => {
  it('perímetro: 4 torres nos cantos + 1 porta + muros', () => {
    const layout = baseLv1Layout({ gx: 0, gz: 0 }, 8);
    expect(layout.length).toBe(28); // borda de um 8x8
    expect(layout.filter(p => p.kind === 'tower').length).toBe(4);
    expect(layout.filter(p => p.kind === 'door').length).toBe(1);
    expect(layout.filter(p => p.kind === 'wall').length).toBe(23);
  });

  it('progresso 0% com só a cama; 100% com todo o layout', () => {
    const base = baseAt();
    expect(baseLv1Progress(base).pct).toBe(0);
    const full = { ...base, pieces: [...base.pieces, ...baseLv1Layout(base.origin, base.size).map((l, i) => ({ id: `p${i}`, kind: l.kind, cell: l.cell, rotation: 0 as const, hp: 1, maxHp: 1, tier: 1 as const }))] };
    expect(baseLv1Progress(full).pct).toBe(100);
  });
});

describe('deliverToBase (construção por recurso)', () => {
  beforeEach(() => {
    useGameStore.setState(s => ({
      playerBase: baseAt(),
      player: { ...s.player, inventory: createInventory([{ itemId: 'wood', quantity: 500 }, { itemId: 'stone', quantity: 500 }]) },
    }));
  });

  it('entregar recurso ergue peças e sobe o %', () => {
    const before = baseLv1Progress(useGameStore.getState().playerBase!).pct;
    useGameStore.getState().deliverToBase();
    const after = baseLv1Progress(useGameStore.getState().playerBase!).pct;
    expect(after).toBeGreaterThan(before);
    // gastou recurso da bolsa
    expect(useGameStore.getState().getItemCount('wood')).toBeLessThan(500);
  });

  it('sem recurso, não ergue nada', () => {
    useGameStore.setState(s => ({ player: { ...s.player, inventory: createInventory([]) } }));
    useGameStore.getState().deliverToBase();
    expect(baseLv1Progress(useGameStore.getState().playerBase!).pct).toBe(0);
  });
});
