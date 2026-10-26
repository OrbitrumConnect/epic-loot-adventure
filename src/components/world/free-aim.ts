/**
 * TIRO LIVRE (Pedro 26/10: "só consigo atirar quando estou perto de inimigos; tiro livre, fluido"). Sem inimigo no
 * alcance, o ATACAR com arma de longe atira mesmo assim — pra onde?
 *  - PC, câmera de cima: no ponto do chão sob o CURSOR (atualizado pela câmera a cada quadro);
 *  - celular (ou mouse parado há > 4 s): pra onde o HERÓI OLHA.
 * Fora do React; quem escreve: game-world (câmera e herói). Quem lê: o ATACAR (routes/index.tsx).
 */
export const heroFacing = { yaw: 0 };
export const isoCursor = { x: 0, z: 0, at: -Infinity };
export const CURSOR_FRESH_MS = 4000;

export function setIsoCursor(x: number, z: number, now = performance.now()): void {
  isoCursor.x = x; isoCursor.z = z; isoCursor.at = now;
}

/** Ponto do tiro livre a `range` m do herói (o tiro some no fim do alcance). */
export function freeShotPoint(from: { x: number; z: number }, range: number, useCursor: boolean, now = performance.now()): { x: number; z: number } {
  let dx = Math.sin(heroFacing.yaw), dz = Math.cos(heroFacing.yaw);
  if (useCursor && now - isoCursor.at < CURSOR_FRESH_MS) {
    const cx = isoCursor.x - from.x, cz = isoCursor.z - from.z;
    const l = Math.hypot(cx, cz);
    if (l > 0.3) { dx = cx / l; dz = cz / l; }
  }
  return { x: from.x + dx * range, z: from.z + dz * range };
}
