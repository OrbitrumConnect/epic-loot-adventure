import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FIRST_PEACE_MS, INITIAL_WAVE, peaceDurationMs, tickWaves, ZS_EXTRA_PEACE_MS } from '@/game/systems/waveSystem';

/* Pedro 31/10: "mapa maior, mais jogabilidade — hordas 5 a 8 min a mais" → SÓ na Zona Sul, +5 min em toda paz. */
describe('hordas mais espaçadas na Zona Sul', () => {
  it('+5 min em toda paz, inclusive a 1ª (10 min) — e o aviso mostra o tempo certo', () => {
    expect(ZS_EXTRA_PEACE_MS).toBe(5 * 60_000);
    const first = tickWaves(INITIAL_WAVE, 1000, true, 0, true, ZS_EXTRA_PEACE_MS);
    expect(first.state.phaseEndsAt).toBe(1000 + FIRST_PEACE_MS + ZS_EXTRA_PEACE_MS);
    expect(first.message).toMatch(/~10 min/);
    for (const wave of [1, 5, 6, 12, 20, 25]) {
      const r = tickWaves({ phase: 'combat', wave, phaseEndsAt: 0, spawnPending: 0 }, 5000, true, 0, true, ZS_EXTRA_PEACE_MS);
      expect(r.state.phaseEndsAt).toBe(5000 + peaceDurationMs(wave) + ZS_EXTRA_PEACE_MS);
    }
  });
  it('o Vale (sem o extra) segue igual: 1ª em 5 min, paz de sempre', () => {
    const first = tickWaves(INITIAL_WAVE, 1000, true, 0, true);
    expect(first.state.phaseEndsAt).toBe(1000 + FIRST_PEACE_MS);
    expect(first.message).toMatch(/~5 min/);
    const r = tickWaves({ phase: 'combat', wave: 3, phaseEndsAt: 0, spawnPending: 0 }, 5000, true, 0);
    expect(r.state.phaseEndsAt).toBe(5000 + peaceDurationMs(3));
  });
  it('o jogo passa o extra só no mapa da Zona Sul', () => {
    const src = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(src).toMatch(/WORLD\.id === 'zona-sul' \? ZS_EXTRA_PEACE_MS : 0\)/);
  });
});
