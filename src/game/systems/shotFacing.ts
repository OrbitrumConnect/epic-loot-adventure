/**
 * Pra ONDE o último tiro/golpe do herói foi (Pedro 25/10: "tô mirando pra frente, mas tem bala indo pra trás ou pro
 * lado e o boneco não vira"). Antes o herói virava pro bicho MAIS PERTO a cada ataque — não pro que levou o tiro.
 * O store anota o ponto em `attack`/`fireMiss`; o `Character` vira pra ele. Fora do React (sem re-render, sem save).
 */
const SHOT_FACING_MS = 400;
let last: { x: number; z: number; at: number } | null = null;

export function noteShotAt(x: number, z: number, now = Date.now()): void { last = { x, z, at: now }; }

/** Ponto do tiro recente (≤ 0,4 s) ou null (aí vale o comportamento de antes). */
export function recentShotPoint(now = Date.now()): { x: number; z: number } | null {
  return last && now - last.at <= SHOT_FACING_MS ? last : null;
}
