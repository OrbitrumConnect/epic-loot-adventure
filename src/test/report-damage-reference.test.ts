import { afterEach, describe, expect, it, vi } from 'vitest';

import { useGameStore } from '@/game/state/game-store';

describe('reportDamage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('preserva player quando lastDamagedAt já tem o valor recebido e registra o eco visual', () => {
    const now = 123_456;
    vi.spyOn(Date, 'now').mockReturnValue(now);
    useGameStore.setState(state => ({
      player: { ...state.player, lastDamagedAt: now },
      feedback: [],
    }));

    const playerBefore = useGameStore.getState().player;

    useGameStore.getState().reportDamage('player', 17.6, { x: 2, z: -3 }, true);

    const stateAfter = useGameStore.getState();
    expect(Object.is(stateAfter.player, playerBefore)).toBe(true);
    expect(stateAfter.feedback).toHaveLength(1);
    expect(stateAfter.feedback[0]).toMatchObject({
      kind: 'damage',
      targetId: 'player',
      amount: 18,
      onPlayer: true,
      createdAt: now,
    });
  });
});
