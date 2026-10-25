/**
 * Câmera acompanha o ALVO do piloto automático (Pedro 25/10: "no modo automático, em 3ª pessoa, a câmera deve
 * virar junto pro alvo que atira"). O piloto (auto-pilot.tsx) avisa quem está atacando; a câmera de 3ª pessoa
 * (game-world.tsx) gira suave até ele. Mexer o mouse/dedo devolve a câmera pro jogador por 1,5 s.
 */
const AIM_HOLD_MS = 1200;   // sem aviso novo nesse tempo = piloto largou o alvo
export const MANUAL_LOOK_MS = 1500;
export const PILOT_CAM_RATE = 5; // ~63% do giro em 0,2 s

let aim: { id: string; until: number } | null = null;
let manualAt = 0;

export function setPilotAim(id: string | null, now = Date.now()): void {
  aim = id ? { id, until: now + AIM_HOLD_MS } : null;
}
export function noteManualLook(now = Date.now()): void { manualAt = now; }

/** Alvo que a câmera deve seguir agora (null = jogador manda na câmera). */
export function pilotAimId(now = Date.now()): string | null {
  if (!aim || now > aim.until || now - manualAt < MANUAL_LOOK_MS) return null;
  return aim.id;
}

/** Gira `cur` em direção a `target` pelo lado mais curto, suave e independente do FPS. */
export function followYaw(cur: number, target: number, dt: number, rate = PILOT_CAM_RATE): number {
  let d = (target - cur) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  else if (d < -Math.PI) d += Math.PI * 2;
  return cur + d * (1 - Math.exp(-Math.min(dt, 0.1) * rate));
}
