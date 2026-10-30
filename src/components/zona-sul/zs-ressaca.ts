/**
 * RESSACA (30/10, Pedro: "o Sorriso só acontece quando tem ressaca"). De tempos em tempos o mar entra em ressaca:
 * RESSACA.ON_MIN minutos a cada RESSACA.EVERY_MIN, pelo relógio REAL — todo mundo vê a mesma ressaca (até na sala, sem
 * mensagem de rede). Durante ela o Sorriso quebra no meio de Copacabana. `?ressaca=1` na URL deixa sempre ligada (teste).
 */
export const RESSACA = { EVERY_MIN: 20, ON_MIN: 6 } as const;

export type RessacaState = { on: boolean; leftS: number; nextS: number };

/** Ressaca no instante `nowMs`: ligada? quanto falta pra acabar (s)? quanto falta pra próxima (s)? Pura. */
export function ressacaAt(nowMs: number, forceOn = false): RessacaState {
  if (forceOn) return { on: true, leftS: Infinity, nextS: 0 };
  const per = RESSACA.EVERY_MIN * 60, dur = RESSACA.ON_MIN * 60;
  const ph = (((nowMs / 1000) % per) + per) % per;
  return ph < dur ? { on: true, leftS: dur - ph, nextS: 0 } : { on: false, leftS: 0, nextS: per - ph };
}

/** `?ressaca=1` (testes de tela / quem quiser ver o Sorriso agora). */
export function ressacaForced(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('ressaca') === '1';
}
