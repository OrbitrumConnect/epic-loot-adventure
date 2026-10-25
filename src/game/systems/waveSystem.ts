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

export const PEACE_MS = 60_000;      // 1 min de preparo ENTRE ondas (até a onda 10)
export const FIRST_PEACE_MS = 300_000; // 5 min após FECHAR a base, antes da 1ª horda

/**
 * Tempo de PAZ após repelir a onda `wave`, escalando com o progresso (Pedro):
 *   até 10 → 1 min | >10 → 5 min | >15 → 8 min | >20 → 10 min.
 * Dá mais fôlego pra reconstruir/evoluir conforme as ondas ficam pesadas.
 */
export function peaceDurationMs(wave: number): number {
  // Escala ~1 min por onda — fôlego pra farmar material, remanejar tropas e até raidar um
  // inimigo no servidor (sabendo que pode ser atacado). Médio/justo (nem fácil nem difícil):
  //   ondas 1-5: 3 min · 6→20: sobe +1/onda até o teto de 8 min · acima da 20: 8→12 min.
  // Pedro (21/10): hordas GRANDES (≥ onda 7 já ~40 inimigos) pedem um pouco mais de paz,
  // inclusive porque o mundo segue rodando nos menus/modo cidade. +2 min nos tetos.
  let minutes: number;
  if (wave <= 5) minutes = 3;
  // Pedro (22/10, nv 35): na onda 7 ainda matava bicho a 45 s da 8 e não deu tempo de evoluir → +2 min.
  else if (wave <= 20) minutes = Math.min(10, 5 + (wave - 5)); // 6=6, 7=7, 8=8, 9=9, 10..20=10
  else minutes = Math.min(14, 10 + (wave - 20));              // 21=11 … 24+=14
  return minutes * 60_000;
}
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

/**
 * BALA da HORDA cresce com a onda (Pedro, 23/10 — "meio a meio, dure até a onda 18–20; depois o pack").
 * Medido: a partir da onda 10 a horda para em 45 inimigos e a vida segue +12%/onda → as torres (1 bala por
 * tiro, do pool do jogador) precisavam de mais tiros do que caía (onda 20: 1221 tiros × 718 balas). Com
 * +3,5%/onda no drop, só com torres o empate cai ~onda 19 (jogador/tropas matando ajudam a ir além); depois
 * falta → espaço pro pack de bala (monetização futura). Só BALA e só bicho de horda (id `wave{n}_`).
 */
export const HORDE_AMMO_GROWTH = 0.035;
/**
 * HORDA MAIS RÁPIDA a cada onda (Pedro 25/10: "os bichos Mixamo da horda podem correr mais conforme a onda
 * aumenta"): +3% de velocidade por onda (teto +60%) e, a partir de +20% (onda 8), a animação vira CORRIDA.
 * Só nos raiders com rig Mixamo (têm clip de corrida; os outros patinariam).
 */
export const HORDE_SPEED_PER_WAVE = 0.03;
export const HORDE_SPEED_MAX = 1.6;
export const HORDE_RUN_FROM = 1.2;
export const HORDE_RUNNERS = new Set(['raider_scout', 'raider_brute', 'raider_shaman', 'raider_warrior', 'raider_samurai', 'raider_mushroom']);
/**
 * ACAMPAMENTO: quem PERSEGUE corre (Pedro 25/10: "perseguem andando; correr fica mais realista"). +25% só enquanto
 * persegue e anima corrida; parado no alcance ataca/atira; desistiu e volta pra casa = anda. Só raiders Mixamo.
 */
export const CAMP_CHASE_RUN = 1.25;
export function campChaseScale(isCamp: boolean, speciesId: string): number {
  return isCamp && HORDE_RUNNERS.has(speciesId) ? CAMP_CHASE_RUN : 1;
}
export function hordeSpeedScale(creatureId: string, speciesId: string): number {
  if (!HORDE_RUNNERS.has(speciesId)) return 1;
  const m = /^wave(\d+)_/.exec(creatureId);
  return m ? Math.min(HORDE_SPEED_MAX, 1 + HORDE_SPEED_PER_WAVE * Math.max(0, Number(m[1]) - 1)) : 1;
}

export function hordeAmmoScale(creatureId: string): number {
  const m = /^wave(\d+)_/.exec(creatureId);
  return m ? 1 + HORDE_AMMO_GROWTH * Math.max(0, Number(m[1]) - 1) : 1;
}
export function scaleHordeAmmo<T extends { itemId: string | null; quantity: number }>(loot: T[], creatureId: string): T[] {
  const k = hordeAmmoScale(creatureId);
  if (k === 1) return loot;
  return loot.map((d) => (d.itemId === 'ammo' ? { ...d, quantity: Math.round(d.quantity * k) } : d));
}

/**
 * CHAMAR A HORDA AGORA (Pedro 25/10: controle do ritmo em vez de esperar): pular a paz dá bônus de loot na onda que
 * vem — +10% por minuto pulado, teto +50%. Só a horda daquela onda (id `wave{n}_`).
 */
export const HORDE_CALL_PER_MIN = 0.1;
export const HORDE_CALL_MAX = 0.5;
export function hordeCallBonus(msLeft: number): number {
  return Math.round(Math.min(HORDE_CALL_MAX, Math.max(0, msLeft / 60_000) * HORDE_CALL_PER_MIN) * 100) / 100;
}
export function applyHordeCall<T extends { quantity: number }>(loot: T[], creatureId: string, call: { wave: number; bonus: number } | null): T[] {
  if (!call || call.bonus <= 0 || !creatureId.startsWith(`wave${call.wave}_`)) return loot;
  return loot.map((d) => ({ ...d, quantity: Math.max(d.quantity, Math.round(d.quantity * (1 + call.bonus))) }));
}

export type WaveTick = {
  state: WaveState;
  startedWave: number | null; // nº da onda que ACABOU de começar (pra spawnar)
  repelledWave: number | null; // nº da onda que ACABOU de ser repelida (→ cartas de evolução)
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
  baseEnclosed: boolean = true,
): WaveTick {
  if (!baseExists) return { state: INITIAL_WAVE, startedWave: null, repelledWave: null, message: null };

  switch (state.phase) {
    case 'idle':
      // Só ARMA o cerco quando a base estiver FECHADA (enclosed). Base aberta/em
      // construção = sem hordas ainda (pedido do Pedro: tempo pra montar em paz).
      if (!baseEnclosed) return { state, startedWave: null, repelledWave: null, message: null };
      // Base fechada → PAZ LONGA (5 min) antes da 1ª horda. Depois que arma, o
      // ciclo continua por `baseExists` mesmo se a base for furada no combate.
      return {
        state: { phase: 'peace', wave: 0, phaseEndsAt: now + FIRST_PEACE_MS, spawnPending: 0 },
        startedWave: null,
        repelledWave: null,
        message: '🛡️ Base fechada! A primeira horda vem em ~5 min — prepare as defesas.',
      };

    case 'peace':
      if (now >= state.phaseEndsAt) {
        const wave = state.wave + 1;
        const count = waveEnemyCount(wave);
        return {
          state: { phase: 'combat', wave, phaseEndsAt: 0, spawnPending: count },
          startedWave: wave,
          repelledWave: null,
          message: `⚔️ Onda ${wave}! ${count} inimigos avançando pra base.`,
        };
      }
      return { state, startedWave: null, repelledWave: null, message: null };

    case 'combat':
      if (state.spawnPending <= 0 && aliveWaveEnemies <= 0) {
        return {
          state: { phase: 'peace', wave: state.wave, phaseEndsAt: now + peaceDurationMs(state.wave), spawnPending: 0 },
          startedWave: null,
          repelledWave: state.wave, // onda vencida → oferece as cartas de evolução
          message: `✅ Onda ${state.wave} repelida! Escolha uma evolução pra base.`,
        };
      }
      return { state, startedWave: null, repelledWave: null, message: null };

    default:
      return { state, startedWave: null, repelledWave: null, message: null };
  }
}

/** Marca `n` inimigos como nascidos (desconta do pendente). */
export function markSpawned(state: WaveState, n: number): WaveState {
  return { ...state, spawnPending: Math.max(0, state.spawnPending - n) };
}
