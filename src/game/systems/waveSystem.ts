/**
 * Sistema de HORDAS (puro, testável) — Fase 5.
 *
 * Ciclo: a base é assentada → PAZ (preparo, ~1 min) → COMBATE (onda de inimigos
 * que vão pra base) → onda repelida → PAZ de novo, cada onda mais difícil.
 *
 * Regra de jogo mora aqui como função pura (recebe `now`); quem spawna de fato
 * e aplica no mundo é o store. Escala combina com a visão do Pedro: começa ~2× a
 * referência e cresce ~1,3× por onda, com teto de 10×.
 */
export type WavePhase = 'idle' | 'peace' | 'combat';

export type WaveState = {
  phase: WavePhase;
  wave: number;        // nº da onda atual (0 = nenhuma começou)
  phaseEndsAt: number; // fim da PAZ (timestamp); 0 em combate
  spawnPending: number; // inimigos que ainda faltam nascer nesta onda
};

export const INITIAL_WAVE: WaveState = { phase: 'idle', wave: 0, phaseEndsAt: 0, spawnPending: 0 };

export const PEACE_MS = 60_000;      // 1 min de preparo entre ondas
export const BASE_WAVE_ENEMIES = 4;  // referência de quantidade
const START_MULT = 2;                // onda 1 = 2× a referência
const STEP = 1.3;                    // +30% por onda
const CAP_MULT = 10;                 // teto de dificuldade

/** Multiplicador de dificuldade da onda (1-based), limitado ao teto. */
export function waveMultiplier(wave: number): number {
  if (wave <= 0) return 0;
  return Math.min(CAP_MULT, START_MULT * Math.pow(STEP, wave - 1));
}

/** Quantos inimigos nascem na onda `wave`. */
export function waveEnemyCount(wave: number): number {
  return Math.max(1, Math.round(BASE_WAVE_ENEMIES * waveMultiplier(wave)));
}

/** Escala de HP dos inimigos da onda (dificuldade sobe com as ondas). */
export function waveHpScale(wave: number): number {
  return 1 + Math.max(0, wave - 1) * 0.12; // +12% por onda
}

export type WaveTick = {
  state: WaveState;
  startedWave: number | null; // nº da onda que ACABOU de começar (pra spawnar)
  message: string | null;     // aviso pro HUD (null = nada)
};

/**
 * Avança o ciclo. `baseExists`: a base foi assentada? `aliveWaveEnemies`: quantos
 * inimigos DESTA onda ainda estão vivos. A onda só termina quando todos nasceram
 * E morreram (não é só timer) — assim não declara vitória com inimigo vivo.
 */
export function tickWaves(
  state: WaveState,
  now: number,
  baseExists: boolean,
  aliveWaveEnemies: number,
): WaveTick {
  if (!baseExists) return { state: INITIAL_WAVE, startedWave: null, message: null };

  switch (state.phase) {
    case 'idle':
      // Base recém-assentada → entra em PAZ (preparo).
      return {
        state: { phase: 'peace', wave: 0, phaseEndsAt: now + PEACE_MS, spawnPending: 0 },
        startedWave: null,
        message: '🛡️ Base assentada! A primeira horda vem em 1 min — prepare as defesas.',
      };

    case 'peace':
      if (now >= state.phaseEndsAt) {
        const wave = state.wave + 1;
        const count = waveEnemyCount(wave);
        return {
          state: { phase: 'combat', wave, phaseEndsAt: 0, spawnPending: count },
          startedWave: wave,
          message: `⚔️ Onda ${wave}! ${count} inimigos avançando pra base.`,
        };
      }
      return { state, startedWave: null, message: null };

    case 'combat':
      if (state.spawnPending <= 0 && aliveWaveEnemies <= 0) {
        return {
          state: { phase: 'peace', wave: state.wave, phaseEndsAt: now + PEACE_MS, spawnPending: 0 },
          startedWave: null,
          message: `✅ Onda ${state.wave} repelida! Reforce a base — a próxima vem em 1 min.`,
        };
      }
      return { state, startedWave: null, message: null };

    default:
      return { state, startedWave: null, message: null };
  }
}

/** Marca `n` inimigos como nascidos (desconta do pendente). */
export function markSpawned(state: WaveState, n: number): WaveState {
  return { ...state, spawnPending: Math.max(0, state.spawnPending - n) };
}
