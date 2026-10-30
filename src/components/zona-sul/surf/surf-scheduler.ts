/**
 * ZONA SUL — agenda das SÉRIES de onda (surf, fase B). Um relógio só (avança no quadro do jogo), 5 VAGAS FIXAS de onda
 * (nada criado/destruído), semente fixa (determinístico). Regras do documento do Pedro:
 *  - série de 3–5 ondas a 12,5–15,5 s uma da outra (≥ 40 m, onda de 6,3 m: o tubo de uma não encosta na outra), CRESCENDO (SERIES_GROW); CALMARIA de 45–60 s depois da última onda da série (Pedro 28/10: "o
 *    intervalo tá 3 min? pode ser uns 45 s, 1 min") e vem a próxima;
 *  - nunca sobrepõe: cada onda nova só ocupa uma vaga cuja onda antiga já saiu da zona (sem vaga, a série vem menor);
 *  - aba escondida/voltando: o quadro trava o passo (sem "rajada" de séries atrasadas);
 *  - 1ª série logo (pra ver), e `trigger()` chama a próxima na hora (tecla J) se o mar estiver livre.
 */
import { ARPOADOR, SURF, type SurfProfile, type WaveState, type WaveVar, waveStateAt } from './surf-wave';

export const SERIES = { CALM_MIN: 45, CALM_MAX: 60, MIN_WAVES: 3, MAX_WAVES: 5, GAP_MIN: 12.5, GAP_MAX: 15.5, FIRST_AT: 10, MAX_DT: 0.25 } as const;
/** Tamanho de cada onda na série (Pedro 28/10: "a 1ª vem do jeito que dá, a 2ª maior, a 3ª maior ainda") — a 3ª é a
 *  onda da série; a 4ª e a 5ª (se vierem) baixam um pouco. Multiplica a altura (a variação ±8% por lado continua). */
export const SERIES_GROW = [1, 1.12, 1.25, 1.17, 1.08] as const;
export const SERIES_GROW_MAX = Math.max(...SERIES_GROW);
/** Vida de uma onda (s): da origem até sumir. */
export const WAVE_LIFE = (SURF.Q_MAX + 6 - SURF.Q_MIN) / SURF.C;
/** Vida de uma onda deste perfil (s). */
export function waveLife(pf: SurfProfile): number { return (pf.Q_MAX + 6 - pf.Q_MIN) / pf.C; }
export type SeriesRule = { readonly CALM_MIN: number; readonly CALM_MAX: number; readonly MIN_WAVES: number; readonly MAX_WAVES: number; readonly GAP_MIN: number; readonly GAP_MAX: number; readonly FIRST_AT: number; readonly MAX_DT: number };
export const SLOTS = 5;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class SurfScheduler {
  clock = 0;
  /** Desligada (ex.: Sorriso fora da ressaca): não começa série nova — as ondas que já vinham terminam. */
  enabled = true;
  nextSeriesAt: number;
  readonly life: number;
  seriesCount = 0;
  readonly births: number[] = new Array(SLOTS).fill(-1e9);
  readonly vars: WaveVar[] = Array.from({ length: SLOTS }, () => ({ hR: 1, hL: 1, vR: 1, vL: 1 }));
  readonly states: WaveState[] = Array.from({ length: SLOTS }, () => ({ qc: 0, h: 0, peelR: 0, peelL: 0, active: false, peel2R: 0, peel2L: 0, reform: 0 }));
  private rnd: () => number;
  constructor(seed = 20261028, readonly pf: SurfProfile = ARPOADOR, readonly rule: SeriesRule = SERIES) {
    this.rnd = mulberry32(seed); this.life = waveLife(pf); this.nextSeriesAt = rule.FIRST_AT;
  }

  /** Há alguma onda ainda na zona (nascida e não terminada)? */
  busy(): boolean { return this.births.some((b) => this.clock - b < this.life && this.clock >= b - 1e-6) || this.arriving(); }
  /** A série atual ainda está chegando (onda marcada pra nascer)? */
  arriving(): boolean { return this.births.some((b) => b > this.clock); }

  /** Avança o relógio (passo travado: aba que volta não dispara séries atrasadas) e atualiza o estado das 5 vagas. */
  advance(dt: number): void {
    this.clock += Math.max(0, Math.min(this.rule.MAX_DT, dt));
    if (this.clock >= this.nextSeriesAt && !this.arriving()) {
      if (this.enabled) this.startSeries();
      else this.nextSeriesAt = this.clock + 1; // desligada: confere de novo daqui a 1 s
    }
    for (let i = 0; i < SLOTS; i++) {
      const st = waveStateAt(this.clock - this.births[i]!, this.vars[i]!, this.pf);
      const o = this.states[i]!; o.qc = st.qc; o.h = st.h; o.peelR = st.peelR; o.peelL = st.peelL; o.active = st.active;
      o.peel2R = st.peel2R ?? 0; o.peel2L = st.peel2L ?? 0; o.reform = st.reform ?? 0;
      o.stA = st.stA ?? 0; o.stB = st.stB ?? 0; o.lagA = st.lagA ?? this.pf.CLOSE_LAG_OUT; o.outer = st.outer ?? 1;
    }
  }

  /** Chama a próxima série AGORA (tecla J), se a anterior já terminou de chegar e há vaga livre. */
  trigger(): boolean { if (!this.enabled || this.arriving() || this.freeSlot(this.clock) < 0) return false; this.nextSeriesAt = this.clock; return true; }

  /** Vaga cuja onda já saiu da zona no instante `t` (−1 se nenhuma). */
  private freeSlot(t: number): number {
    for (let i = 0; i < SLOTS; i++) if (this.births[i]! + this.life <= t) return i;
    return -1;
  }

  private startSeries(): void {
    const r = this.rnd, R = this.rule, n = R.MIN_WAVES + Math.floor(r() * (R.MAX_WAVES - R.MIN_WAVES + 1));
    let t = this.clock, last = -1;
    for (let k = 0; k < n; k++) {
      const i = this.freeSlot(t); if (i < 0) break; // sem vaga: a série vem menor (nunca por cima de onda viva)
      this.births[i] = t; last = t;
      const g = SERIES_GROW[k] ?? 1;
      this.vars[i] = { hR: (0.92 + r() * 0.16) * g, hL: (0.92 + r() * 0.16) * g, vR: 0.88 + r() * 0.24, vL: 0.88 + r() * 0.24 };
      t += R.GAP_MIN + r() * (R.GAP_MAX - R.GAP_MIN);
    }
    if (last < 0) { this.nextSeriesAt = this.clock + 1; return; }
    this.seriesCount++;
    // próxima: calmaria de 45–60 s depois da ÚLTIMA onda desta série
    this.nextSeriesAt = last + R.CALM_MIN + r() * (R.CALM_MAX - R.CALM_MIN);
  }
}
