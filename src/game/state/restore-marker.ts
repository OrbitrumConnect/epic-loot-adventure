/**
 * Marca o instante em que um save foi CARREGADO no store. Quem reage a mudanças (ex.: as cartas) usa isso pra não
 * confundir "o save chegou" (nível 1→123, Salão 1→11, casa liberada…) com conquista nova.
 */
let restoredAt = 0;
export function markRestored(now: number = Date.now()): void { restoredAt = now; }
export function restoredRecently(windowMs = 2000, now: number = Date.now()): boolean { return now - restoredAt < windowMs; }
