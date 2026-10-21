import { describe, it, expect } from 'vitest';
import {
  INITIAL_WAVE, PEACE_MS, FIRST_PEACE_MS, BASE_WAVE_ENEMIES, peaceDurationMs,
  tickWaves, waveMultiplier, waveEnemyCount, waveHpScale, markSpawned,
} from '../game/systems/waveSystem';

describe('waveSystem · escala', () => {
  it('onda 1 = 2× a referência; cresce ~1,3× por onda; teto 10×', () => {
    expect(waveMultiplier(0)).toBe(0);
    expect(waveMultiplier(1)).toBeCloseTo(2, 5);
    expect(waveMultiplier(2)).toBeCloseTo(2.6, 5);
    expect(waveMultiplier(3)).toBeCloseTo(3.38, 5);
    expect(waveMultiplier(99)).toBe(10); // teto
  });

  it('quantidade e HP sobem com a onda', () => {
    expect(waveEnemyCount(1)).toBe(BASE_WAVE_ENEMIES * 2); // 8
    expect(waveEnemyCount(99)).toBe(BASE_WAVE_ENEMIES * 10); // 40 (teto)
    expect(waveHpScale(1)).toBeCloseTo(1, 5);
    expect(waveHpScale(6)).toBeCloseTo(1.6, 5);
  });
});

describe('waveSystem · ciclo', () => {
  it('sem base = idle sempre', () => {
    const r = tickWaves({ phase: 'combat', wave: 3, phaseEndsAt: 0, spawnPending: 5 }, 1000, false, 2);
    expect(r.state).toEqual(INITIAL_WAVE);
  });

  it('base FECHADA → PAZ longa (5 min) antes da 1ª horda', () => {
    const r = tickWaves(INITIAL_WAVE, 1000, true, 0, true);
    expect(r.state.phase).toBe('peace');
    expect(r.state.phaseEndsAt).toBe(1000 + FIRST_PEACE_MS);
    expect(r.message).toBeTruthy();
  });

  it('paz não dispara onda antes do tempo', () => {
    const peace = { phase: 'peace' as const, wave: 0, phaseEndsAt: 10_000, spawnPending: 0 };
    const r = tickWaves(peace, 9_999, true, 0);
    expect(r.state).toBe(peace);
    expect(r.startedWave).toBeNull();
  });

  it('paz termina → onda 1 começa (combate, 8 inimigos pendentes)', () => {
    const peace = { phase: 'peace' as const, wave: 0, phaseEndsAt: 10_000, spawnPending: 0 };
    const r = tickWaves(peace, 10_000, true, 0);
    expect(r.state.phase).toBe('combat');
    expect(r.state.wave).toBe(1);
    expect(r.state.spawnPending).toBe(8);
    expect(r.startedWave).toBe(1);
  });

  it('combate NÃO termina com inimigo vivo (nem com spawn pendente)', () => {
    const a = tickWaves({ phase: 'combat', wave: 1, phaseEndsAt: 0, spawnPending: 0 }, 20_000, true, 3);
    expect(a.state.phase).toBe('combat'); // ainda tem vivo
    const b = tickWaves({ phase: 'combat', wave: 1, phaseEndsAt: 0, spawnPending: 2 }, 20_000, true, 0);
    expect(b.state.phase).toBe('combat'); // ainda falta nascer
  });

  it('todos nasceram e morreram → volta pra paz (próxima onda)', () => {
    const r = tickWaves({ phase: 'combat', wave: 1, phaseEndsAt: 0, spawnPending: 0 }, 30_000, true, 0);
    expect(r.state.phase).toBe('peace');
    expect(r.state.wave).toBe(1); // guarda a onda; a próxima será 2
    expect(r.state.phaseEndsAt).toBe(30_000 + PEACE_MS);
  });

  it('tempo de paz escala com a onda (10→5min, 15→8min, 20→10min)', () => {
    expect(peaceDurationMs(5)).toBe(PEACE_MS);     // 1 min até a 10
    expect(peaceDurationMs(10)).toBe(PEACE_MS);    // 1 min na 10
    expect(peaceDurationMs(11)).toBe(300_000);     // 5 min acima de 10
    expect(peaceDurationMs(15)).toBe(300_000);     // 5 min na 15
    expect(peaceDurationMs(16)).toBe(480_000);     // 8 min acima de 15
    expect(peaceDurationMs(21)).toBe(600_000);     // 10 min acima de 20
    // a transição combate→paz usa o tempo escalado:
    const r = tickWaves({ phase: 'combat', wave: 16, phaseEndsAt: 0, spawnPending: 0 }, 1000, true, 0);
    expect(r.state.phaseEndsAt).toBe(1000 + 480_000);
  });

  it('markSpawned desconta o pendente sem passar de 0', () => {
    expect(markSpawned({ phase: 'combat', wave: 1, phaseEndsAt: 0, spawnPending: 8 }, 3).spawnPending).toBe(5);
    expect(markSpawned({ phase: 'combat', wave: 1, phaseEndsAt: 0, spawnPending: 2 }, 5).spawnPending).toBe(0);
  });
});
