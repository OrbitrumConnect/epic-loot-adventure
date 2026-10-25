/**
 * Rumo do PASSEIO de um bicho (sem perseguir): mistura a direção aleatória com a de CASA.
 * Antes: média de ÂNGULOS (`a·(1−b) + casa·b`) — erra na virada de 360° (ex.: 6,0 rad e −0,3 rad davam
 * 0,96 rad, quase 70° fora) — e a mistura pulava de 0,2 pra 0,8 exatamente nos 5 m de casa → na beirada o
 * bicho ia e voltava no lugar (Pedro 25/10: "ficam tentando ir pra um lado e pro outro"). Agora soma de
 * DIREÇÕES (vetores) e a puxada pra casa cresce suave entre 3 e 8 m. `strength` = tamanho da soma (0..1): quando
 * as duas se anulam (quer sair × casa puxa) o bicho PARA (pasta) até sortear outro rumo — em vez de tremer.
 */
export function wanderStep(wanderAngle: number, toHomeX: number, toHomeZ: number): { heading: number; strength: number } {
  const dist = Math.hypot(toHomeX, toHomeZ);
  const t = Math.min(1, Math.max(0, (dist - 3) / 5));
  const pull = 0.2 + 0.6 * t * t * (3 - 2 * t); // 0,2 perto de casa → 0,8 a partir de 8 m
  let x = Math.sin(wanderAngle) * (1 - pull);
  let z = Math.cos(wanderAngle) * (1 - pull);
  if (dist > 1e-6) { x += (toHomeX / dist) * pull; z += (toHomeZ / dist) * pull; }
  const strength = Math.hypot(x, z);
  return { heading: strength < 1e-9 ? wanderAngle : Math.atan2(x, z), strength };
}
/** Só o rumo (atalho do `wanderStep`). */
export function wanderHeading(wanderAngle: number, toHomeX: number, toHomeZ: number): number {
  return wanderStep(wanderAngle, toHomeX, toHomeZ).heading;
}
/** Abaixo disso o bicho fica parado (pastando) em vez de dar passos que se anulam. */
export const WANDER_MIN_STRENGTH = 0.25;
