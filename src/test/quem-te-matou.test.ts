import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';

/* Pedro, 22/10 (PvP na sala do amigo): ao morrer pra outro jogador, a tela de morte mostra QUEM
   te matou. Fica só na UI (não vai pro save). */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

describe('quem te matou', () => {
  it('golpe PvP que mata grava o nome e marca pvp', () => {
    useGameStore.setState(s => ({ player: { ...s.player, hp: 10, dead: false } }));
    useGameStore.getState().takePlayerDamage(50, 'Caio', true);
    const s = useGameStore.getState();
    expect(s.player.dead).toBe(true);
    expect(s.ui.deathBy).toEqual({ name: 'Caio', pvp: true });
  });
  it('dano que NÃO mata não grava; bicho da horda online = pvp false', () => {
    useGameStore.setState(s => ({ player: { ...s.player, hp: 100, dead: false } }));
    useGameStore.getState().takePlayerDamage(5, 'Caio', true);
    expect(useGameStore.getState().ui.deathBy ?? null).toBeNull();
    useGameStore.getState().takePlayerDamage(500, 'Lobo');
    expect(useGameStore.getState().ui.deathBy).toEqual({ name: 'Lobo', pvp: false });
  });
});
