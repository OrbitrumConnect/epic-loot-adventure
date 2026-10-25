/**
 * HIT STOP (Pedro 25/10, pendente da visão "pós-colapso": hit stop / hit reaction). No golpe CRÍTICO ou no ABATE a
 * animação de todo mundo congela por HIT_STOP_MS e volta — dá peso ao combate. Só animação (IA, física e rede
 * seguem), só local, e no máximo 1 a cada HIT_STOP_GAP_MS (o piloto batendo sem parar não vira tremedeira).
 */
export const HIT_STOP_MS = 55;
export const HIT_STOP_GAP_MS = 250;
let until = 0;
let last = -Infinity;

/** Pede um hit stop agora (respeita o intervalo mínimo). `now` em ms (performance.now). */
export function triggerHitStop(now: number = performance.now(), ms = HIT_STOP_MS): boolean {
  if (now - last < HIT_STOP_GAP_MS) return false;
  last = now;
  until = now + ms;
  return true;
}
/** Está congelado agora? */
export function hitStopActive(now: number = performance.now()): boolean {
  return now < until;
}
/** Escala de tempo da animação: quase parada no hit stop, normal fora. */
export function hitStopScale(now: number = performance.now()): number {
  return hitStopActive(now) ? 0.04 : 1;
}
/** Só pra testes. */
export function resetHitStop(): void { until = 0; last = -Infinity; }
