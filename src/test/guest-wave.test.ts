import { afterEach, describe, expect, it } from 'vitest';
import type { PlayerBaseState } from '@/game/types/playerbase';
import { spawnWaveRaiders, useGameStore } from '@/game/state/game-store';
import { isMyWave, useNet, waveOwner } from '@/net/multiplayer';
import { tickWorld as bridgeTickWorld } from '@/components/world/objective-bridge';

const base = (): PlayerBaseState => ({
  id: 'base_test',
  owner: { kind: 'player', id: 'p', name: 'Kael' },
  worldPosition: { x: 0, z: 0 },
  origin: { gx: 0, gz: 0 },
  size: 8,
  stage: 'bed',
  pieces: [{ id: 'core', kind: 'core', cell: { gx: 3, gz: 3 }, rotation: 0, hp: 100, maxHp: 100, tier: 1 }],
  enclosed: true,
  claimedAt: 0,
  lastDamagedAt: null,
});

afterEach(() => useNet.setState({ connected: false, isHost: false }));

describe('horda online — cada jogador tem a sua', () => {
  it('id com dono: lê o dono; solo/antigo fica sem dono', () => {
    const tagged = spawnWaveRaiders(3, { x: 0, z: 0 }, 1, 'abc123')[0]!;
    const solo = spawnWaveRaiders(3, { x: 0, z: 0 }, 1)[0]!;
    expect(waveOwner(tagged.id)).toBe('abc123');
    expect(tagged.id.startsWith('wave3_')).toBe(true);
    expect(waveOwner(solo.id)).toBeNull();
    expect(waveOwner(spawnWaveRaiders(12, { x: 0, z: 0 }, 1).find((c) => c.id.includes('boss'))?.id ?? 'wave12_boss0_1')).toBeNull();
  });

  it('isMyWave: convidado só conta a dele; host conta a dele + as sem dono', () => {
    useNet.setState({ connected: true, isHost: false, selfId: 'guest1' });
    expect(isMyWave('wave2_oguest1_0_5')).toBe(true);
    expect(isMyWave('wave2_ohost99_0_5')).toBe(false);
    expect(isMyWave('wave2_0_5')).toBe(false);
    useNet.setState({ isHost: true, selfId: 'host99' });
    expect(isMyWave('wave2_ohost99_0_5')).toBe(true);
    expect(isMyWave('wave2_0_5')).toBe(true);
    expect(isMyWave('wave2_oguest1_0_5')).toBe(false);
  });

  it('convidado: horda NÃO some — espera o host e não declara vitória antes da hora', () => {
    useNet.setState({ connected: true, isHost: false, selfId: 'guest1' });
    useGameStore.setState({
      playerBase: base(), upgradeChoices: null,
      creatures: [],
      wave: { phase: 'peace', wave: 0, phaseEndsAt: Date.now() - 1, spawnPending: 0 },
    });
    useGameStore.getState().tickWorld();
    let w = useGameStore.getState().wave;
    expect(w.phase).toBe('combat');
    expect(w.spawnPending).toBeGreaterThan(0); // pediu ao host, não spawnou local
    expect(useGameStore.getState().creatures.some((c) => c.id.startsWith('wave'))).toBe(false);
    useGameStore.getState().tickWorld();
    expect(useGameStore.getState().wave.phase).toBe('combat'); // sem horda ainda: segue em combate

    // Chega pelo mundo do host a horda com MEU dono → pendente zera; ao morrer, onda repelida.
    const mine = spawnWaveRaiders(1, { x: 0, z: 0 }, Date.now(), 'guest1');
    useGameStore.setState({ creatures: mine });
    useGameStore.getState().tickWorld();
    w = useGameStore.getState().wave;
    expect(w.spawnPending).toBe(0);
    expect(w.phase).toBe('combat');
    useGameStore.setState({ creatures: mine.map((c) => ({ ...c, hp: 0, behavior: 'dead' as const })) });
    useGameStore.getState().tickWorld();
    expect(useGameStore.getState().wave.phase).toBe('peace');
  });

  it('convidado: o relógio do jogo (mesmo caminho do jogo) avança a MINHA onda e não mexe nos bichos do host', () => {
    useNet.setState({ connected: true, isHost: false, selfId: 'guest1' });
    const hostMobs = spawnWaveRaiders(2, { x: 50, z: 50 }, 1, 'host99');
    useGameStore.setState({
      playerBase: base(), creatures: hostMobs,
      wave: { phase: 'peace', wave: 0, phaseEndsAt: Date.now() - 1, spawnPending: 0 },
    });
    bridgeTickWorld();
    const st = useGameStore.getState();
    expect(st.wave.phase).toBe('combat');
    expect(st.creatures).toBe(hostMobs); // intocado
  });

  it('solo segue igual: spawna local na hora', () => {
    useGameStore.setState({
      playerBase: base(), creatures: [],
      wave: { phase: 'peace', wave: 0, phaseEndsAt: Date.now() - 1, spawnPending: 0 },
    });
    useGameStore.getState().tickWorld();
    const st = useGameStore.getState();
    expect(st.wave.phase).toBe('combat');
    expect(st.creatures.filter((c) => c.id.startsWith('wave1_')).length).toBeGreaterThan(0);
    expect(st.creatures.every((c) => waveOwner(c.id) === null)).toBe(true);
  });
});
