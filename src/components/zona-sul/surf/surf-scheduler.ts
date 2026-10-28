/**
 * ZONA SUL — agenda das SÉRIES de onda (surf, fase B). Um relógio só (avança no quadro do jogo), 5 VAGAS FIXAS de onda
 * (nada criado/destruído), semente fixa (determinístico). Regras do documento do Pedro:
 *  - série de 3–5 ondas a 7–10 s uma da outra (≥ 22 m: o tubo de uma não encosta na outra); CALMARIA de 45–60 s depois da última onda da série (Pedro 28/10: "o
 *    intervalo tá 3 min? pode ser uns 45 s, 1 min") e vem a próxima;
 *  - nunca sobrepõe: cada onda nova só ocupa uma vaga cuja onda antiga já saiu da zona (sem vaga, a série vem menor);
 *  - aba escondida/voltando: o quadro trava o passo (sem "rajada" de séries atrasadas);
 *  - 1ª série logo (pra ver), e `trigger()` chama a próxima na hora (tecla J) se o mar estiver livre.
 */
import { SURF, type WaveState, type WaveVar, waveStateAt } from './surf-wave';

export const SERIES = { CALM_MIN: 45, CALM_MAX: 60, MIN_WAVES: 3, MAX_WAVES: 5, GAP_MIN: 7, GAP_MAX: 10, FIRST_AT: 10, MAX_DT: 0.25 } as const;
/** Vida de uma onda (s): da origem até sumir. */
export const WAVE_LIFE = (SURF.Q_MAX + 6 - SURF.Q_MIN) / SURF.C;
export const SLOTS = 5;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export class SurfScheduler {
  clock = 0;
  nextSeriesAt: number = SERIES.FIRST_AT;
  seriesCount = 0;
  readonly births: number[] = new Array(SLOTS).fill(-1e9);
  readonly vars: WaveVar[] = Array.from({ length: SLOTS }, () => ({ hR: 1, hL: 1, vR: 1, vL: 1 }));
  readonly states: WaveState[] = Array.from({ length: SLOTS }, () => ({ qc: 0, h: 0, peelR: 0, peelL: 0, active: false }));
  private rnd: () => number;
  constructor(seed = 20261028) { this.rnd = mulberry32(seed); }

  /** Há alguma onda ainda na zona (nascida e não terminada)? */
  busy(): boolean { return this.births.some((b) => this.clock - b < WAVE_LIFE && this.clock >= b - 1e-6) || this.arriving(); }
  /** A série atual ainda está chegando (onda marcada pra nascer)? */
  arriving(): boolean { return this.births.some((b) => b > this.clock); }

  /** Avança o relógio (passo travado: aba que volta não dispara séries atrasadas) e atualiza o estado das 5 vagas. */
  advance(dt: number): void {
    this.clock += Math.max(0, Math.min(SERIES.MAX_DT, dt));
    if (this.clock >= this.nextSeriesAt && !this.arriving()) this.startSeries();
    for (let i = 0; i < SLOTS; i++) {
      const st = waveStateAt(this.clock - this.births[i]!, this.vars[i]!);
      const o = this.states[i]!; o.qc = st.qc; o.h = st.h; o.peelR = st.peelR; o.peelL = st.peelL; o.active = st.active;
    }
  }

  /** Chama a próxima série AGORA (tecla J), se a anterior já terminou de chegar e há vaga livre. */
  trigger(): boolean { if (this.arriving() || this.freeSlot(this.clock) < 0) return false; this.nextSeriesAt = this.clock; return true; }

  /** Vaga cuja onda já saiu da zona no instante `t` (−1 se nenhuma). */
  private freeSlot(t: number): number {
    for (let i = 0; i < SLOTS; i++) if (this.births[i]! + WAVE_LIFE <= t) return i;
    return -1;
  }

  private startSeries(): void {
    const r = this.rnd, n = SERIES.MIN_WAVES + Math.floor(r() * (SERIES.MAX_WAVES - SERIES.MIN_WAVES + 1));
    let t = this.clock, last = -1;
    for (let k = 0; k < n; k++) {
      const i = this.freeSlot(t); if (i < 0) break; // sem vaga: a série vem menor (nunca por cima de onda viva)
      this.births[i] = t; last = t;
      this.vars[i] = { hR: 0.92 + r() * 0.16, hL: 0.92 + r() * 0.16, vR: 0.88 + r() * 0.24, vL: 0.88 + r() * 0.24 };
      t += SERIES.GAP_MIN + r() * (SERIES.GAP_MAX - SERIES.GAP_MIN);
    }
    if (last < 0) { this.nextSeriesAt = this.clock + 1; return; }
    this.seriesCount++;
    // próxima: calmaria de 45–60 s depois da ÚLTIMA onda desta série
    this.nextSeriesAt = last + SERIES.CALM_MIN + r() * (SERIES.CALM_MAX - SERIES.CALM_MIN);
  }
}
