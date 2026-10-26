/**
 * ESQUIVA / ROLAMENTO do herói (Pedro 26/10: "tem algo de desvio/rolamento? baixei um — no idle automático ele desvia de
 * alguns tiros quando toma bastante dano; e manual também"). Clip Mixamo "Falling To Roll" (só o trecho do rolamento).
 *  - Manual: tecla Y (PC) / botão "Esquiva" (celular). Rola pra onde você anda; parado, pra onde o herói olha.
 *  - Desloca ~3,5 m em 1 s (passa pelas colisões do andar) e fica INVULNERÁVEL ~0,55 s no meio do rolamento:
 *    mordida, tiro, PvP → "Esquivou!". Recarga 3 s. Preso no giro da morte / morto: não rola.
 *  - Piloto (idle): perdeu ≥ 25% da vida em 3 s e a esquiva está pronta → rola de LADO em relação a quem ataca.
 * Estado fora do React (1 herói local).
 */
export const DODGE_MS = 1000;
export const DODGE_DIST = 3.5;
export const DODGE_IFRAME_FROM = 0.15; // fração do rolamento em que começa a invulnerabilidade
export const DODGE_IFRAME_TO = 0.7;
export const DODGE_COOLDOWN_MS = 3000;
export const AUTO_DODGE_LOSS = 0.25;  // perdeu 25% da vida…
export const AUTO_DODGE_WINDOW_MS = 3000; // …em 3 s → piloto rola
/** Trecho do clip (s): 0,1 = aterrissa; 1,4 = de pé de novo (medido no "Falling To Roll"). */
export const DODGE_CLIP_FROM = 0.1;
export const DODGE_CLIP_TO = 1.4;

type Dodge = { dirX: number; dirZ: number; startAt: number };
let dodge: Dodge | null = null;
let lastAt = -Infinity;
let pending: { dir: { x: number; z: number } | null } | null = null;
const hits: { at: number; amount: number }[] = [];

/** Pede uma esquiva (tecla/botão/piloto). `dir` opcional (piloto); sem ela o herói decide (andar/olhar). */
export function requestDodge(dir: { x: number; z: number } | null = null): void { pending = { dir }; }
/** O herói consome o pedido (1×). */
export function takeDodgeRequest(): { dir: { x: number; z: number } | null } | null { const p = pending; pending = null; return p; }

export function dodgeReady(now = Date.now()): boolean { return !dodge && now - lastAt >= DODGE_COOLDOWN_MS; }
export function dodgeCooldownLeft(now = Date.now()): number { return Math.max(0, Math.ceil((DODGE_COOLDOWN_MS - (now - lastAt)) / 1000)); }

/** Começa a rolar na direção (dirX, dirZ). Devolve false se em recarga/rolando ou direção nula. */
export function startDodge(dirX: number, dirZ: number, now = Date.now()): boolean {
  const l = Math.hypot(dirX, dirZ);
  if (l < 1e-6 || !dodgeReady(now)) return false;
  dodge = { dirX: dirX / l, dirZ: dirZ / l, startAt: now };
  lastAt = now;
  return true;
}

/** Rolamento em curso: direção e progresso 0..1 (null = não está rolando). */
export function activeDodge(now = Date.now()): { dirX: number; dirZ: number; t: number } | null {
  if (!dodge) return null;
  const t = (now - dodge.startAt) / DODGE_MS;
  if (t >= 1) { dodge = null; return null; }
  return { dirX: dodge.dirX, dirZ: dodge.dirZ, t: Math.max(0, t) };
}
export function isDodging(now = Date.now()): boolean { return activeDodge(now) !== null; }
/** Invulnerável (meio do rolamento)? Golpes/tiros nesse instante "erram". */
export function isInvulnerable(now = Date.now()): boolean {
  const d = activeDodge(now);
  return !!d && d.t >= DODGE_IFRAME_FROM && d.t <= DODGE_IFRAME_TO;
}
/** Velocidade (m/s) no progresso t: perfil seno (arranca, desliza, para) — a soma dá exatamente DODGE_DIST. */
export function dodgeSpeed(t: number): number {
  return (DODGE_DIST / (DODGE_MS / 1000)) * (Math.PI / 2) * Math.sin(Math.PI * Math.min(1, Math.max(0, t)));
}

/** Piloto: anota o dano que o herói levou. */
export function noteHeroDamage(amount: number, now = Date.now()): void {
  if (amount <= 0) return;
  hits.push({ at: now, amount });
  while (hits.length && now - hits[0]!.at > AUTO_DODGE_WINDOW_MS) hits.shift();
}
/** Piloto: perdeu ≥ 25% da vida nos últimos 3 s e a esquiva está pronta? */
export function shouldAutoDodge(maxHp: number, now = Date.now()): boolean {
  while (hits.length && now - hits[0]!.at > AUTO_DODGE_WINDOW_MS) hits.shift();
  const lost = hits.reduce((a, h) => a + h.amount, 0);
  return maxHp > 0 && lost >= maxHp * AUTO_DODGE_LOSS && dodgeReady(now);
}
/** Direção de LADO em relação ao atacante (perpendicular), pro lado `side` (+1/−1). */
export function sidestepFrom(me: { x: number; z: number }, foe: { x: number; z: number }, side: number): { x: number; z: number } {
  const dx = foe.x - me.x, dz = foe.z - me.z;
  const l = Math.hypot(dx, dz) || 1;
  return { x: (-dz / l) * side, z: (dx / l) * side };
}

/** Só pra testes. */
export function resetDodge(): void { dodge = null; lastAt = -Infinity; pending = null; hits.length = 0; }
