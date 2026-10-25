/**
 * RAJADA (Pedro 25/10: "arma semiautomática de rajada, 6 a 9 tiros com intervalo leve de ~1 s, baixando com o nível;
 * o herói também"). Um gatilho solta a rajada inteira; depois vem a pausa. Só o RIFLE (pistola segue tiro único).
 *   tamanho: 6 tiros, +1 a cada 50 níveis, teto 9   ·   entre tiros: 0,1 s   ·   pausa: 1 s → 0,6 s no nível 150
 * Cada tiro gasta 1 bala e passa pelo MESMO caminho do tiro normal (dano, munição, som, rastro, rede).
 */
export const BURST_ITEMS = new Set(['rifle']);
export const BURST_GAP = 0.1;
export const BURST_MIN = 6;
export const BURST_MAX = 9;
export const BURST_PAUSE_START = 1.0;
export const BURST_PAUSE_END = 0.6;
const PAUSE_FULL_LEVEL = 150;

export function burstSize(itemId: string | null, level: number): number {
  if (!itemId || !BURST_ITEMS.has(itemId)) return 1;
  return Math.min(BURST_MAX, BURST_MIN + Math.floor(Math.max(0, level) / 50));
}
export function burstPause(level: number): number {
  const t = Math.min(1, Math.max(0, level) / PAUSE_FULL_LEVEL);
  return BURST_PAUSE_START - (BURST_PAUSE_START - BURST_PAUSE_END) * t;
}
/** Cadência (s) que o tiro precisa respeitar: dentro da rajada o intervalo curto; gatilho novo espera a pausa. */
export function shotCooldown(baseCooldown: number, itemId: string | null, level: number, fromBurst: boolean): number {
  if (burstSize(itemId, level) <= 1) return baseCooldown;
  return fromBurst ? BURST_GAP * 0.8 : burstPause(level);
}

/** Rajada em curso (fora do React; um atirador local). `fire` devolve false = parou (alvo morreu, sem bala, trocou). */
type Pending = { left: number; nextAt: number; fire: () => boolean };
let pending: Pending | null = null;

export function startBurst(size: number, fire: () => boolean, nowMs = Date.now()): void {
  pending = size > 1 ? { left: size - 1, nextAt: nowMs + BURST_GAP * 1000, fire } : null;
}
export function burstActive(): boolean { return pending !== null; }
export function cancelBurst(): void { pending = null; }
/** Chamado por quadro (pausado = não chama). Dispara no máximo 1 tiro por chamada. */
export function tickBurst(nowMs = Date.now()): void {
  const p = pending;
  if (!p || nowMs < p.nextAt) return;
  const ok = p.fire();
  p.left -= 1;
  if (!ok || p.left <= 0) { if (pending === p) pending = null; return; }
  p.nextAt = Math.max(p.nextAt + BURST_GAP * 1000, nowMs);
}
