import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { decideIntent } from '@/game/systems/objectiveSystem';
import type { AutoSnapshot } from '@/game/types';

/* Pedro, 23/10: liga o automático no ponto A, anda no manual até B, liga de novo → ele voltava pro
   bicho de A. O piloto "gruda" no último alvo (pra não ficar trocando) e essa memória sobrevivia. */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

describe('automático começa do zero no lugar novo', () => {
  it('ligar/desligar o automático zera a memória de alvo do piloto', () => {
    const st = useGameStore.getState();
    st.recordPilotIntent({ kind: 'attack', creatureId: 'lobo_A', to: { x: 0, z: 0 } });
    st.setAutoMode('manual');
    expect(useGameStore.getState().pilotLastIntent).toBeNull();
    useGameStore.getState().recordPilotIntent({ kind: 'attack', creatureId: 'lobo_A', to: { x: 0, z: 0 } });
    useGameStore.getState().setAutoMode('idle');
    expect(useGameStore.getState().pilotLastIntent).toBeNull();
  });

  it('no ponto B ele pega o bicho MAIS PERTO dele (B); fora do raio, o de A é ignorado', () => {
    const snap = (loboB: boolean, raio: number) => ({
      playerPosition: { x: 40, z: 0 }, playerHp: 100, playerMaxHp: 100, playerDead: false, healSlot: null,
      creatures: [
        { id: 'lobo_A', position: { x: 0, z: 0 }, behavior: 'chase', hp: 10, hostile: true, level: 1 },
        ...(loboB ? [{ id: 'lobo_B', position: { x: 46, z: 0 }, behavior: 'chase', hp: 10, hostile: true, level: 1 }] : []),
      ],
      camps: [], resources: [], objectives: { items: [], seq: 0, mode: 'idle', repeat: false },
      homePosition: { x: 0, z: 0 }, autoHuntRadius: raio,
    }) as unknown as AutoSnapshot;
    const alvo = (i: ReturnType<typeof decideIntent>) => (i.kind === 'attack' ? i.creatureId : i.kind);
    expect(alvo(decideIntent(snap(true, 45), 0))).toBe('lobo_B'); // tem bicho em B → B
    expect(alvo(decideIntent(snap(false, 30), 0))).not.toBe('lobo_A'); // raio 30 m: A (40 m) fica de fora
  });
});
