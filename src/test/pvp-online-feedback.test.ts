import { describe, expect, it } from 'vitest';
import { useGameStore } from '../game/state/game-store';
import { useNet } from '../net/multiplayer';
import { pushOutBasePieces } from '../components/world/base-collision';
import { cellCenter } from '../game/systems/playerBaseSystem';
import type { PlayerBaseState } from '../game/types/playerbase';

describe('PvP online — colisão e feedback', () => {
  it('muro da base de OUTRO jogador bloqueia (antes atravessava)', () => {
    useGameStore.setState({ playerBase: null });
    const wall = { id: 'w1', kind: 'wall', cell: { gx: 10, gz: 10 }, rotation: 0, hp: 100, maxHp: 100, tier: 1 };
    useNet.setState({ bases: { amigo: { pieces: [wall] } as unknown as PlayerBaseState } });
    const c = cellCenter(wall.cell as never);
    const [x, z] = pushOutBasePieces(c.x + 0.2, c.z, 0.5);
    expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThanOrEqual(1.39);
    useNet.setState({ bases: {} });
    const [x2] = pushOutBasePieces(c.x + 0.2, c.z, 0.5);
    expect(x2).toBeCloseTo(c.x + 0.2);
  });

  it('golpe PvP recebido mostra o número de dano em mim', () => {
    useGameStore.setState((s) => ({ feedback: [], player: { ...s.player, dead: false, hp: 100, maxHp: 100 } }));
    useGameStore.getState().takePlayerDamage(12, 'Caio');
    const st = useGameStore.getState();
    expect(st.player.hp).toBe(88);
    expect(st.feedback.some((e) => e.kind === 'damage' && e.amount === 12 && e.onPlayer)).toBe(true);
  });
});
