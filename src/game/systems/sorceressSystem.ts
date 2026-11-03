/**
 * FEITICEIRA DA MATA (03/11, Pedro: "a sorceress ataca, pode aparecer correndo do nada no mapa atrás da pessoa"). De
 * tempos em tempos, quando você anda LONGE da base pela Zona Sul, uma Feiticeira surge ATRÁS de você (fora da vista),
 * corre e dá o bote (salto — leapSystem). Um aviso baixo no chat dá a chance de virar. Uma por vez; vai embora se você
 * sumir; o corpo sai depois de cair. Só decisões puras + o relógio — quem cria/remove é o store (`tickSorceress`).
 */
export const SORC_PREFIX = 'sorc_';
export const isSorceress = (id: string) => id.startsWith(SORC_PREFIX);

export const SORC = {
  /** nível mínimo do herói (antes disso a mata já é perigosa o bastante) */
  MIN_LEVEL: 8,
  /** a 1ª da sessão só depois disto; depois, um intervalo sorteado entre GAP_MIN e GAP_MAX (ms) */
  FIRST_MS: 120_000, GAP_MIN_MS: 180_000, GAP_MAX_MS: 360_000,
  /** onde surge: a esta distância (m), atrás de você, até ±SPREAD rad do "atrás" */
  DIST_MIN: 24, DIST_MAX: 32, SPREAD: 0.6,
  /** não surge perto da SUA base (m) nem na zona segura (+ folga) */
  BASE_CLEAR: 60, SAFE_PAD: 20,
  /** some se ficar longe assim de você (m); o corpo sai depois disto (ms) */
  LEAVE_DIST: 140, CORPSE_MS: 10_000,
} as const;

/** Relógio da sessão (fora do React, como o do agarrão). */
export const sorcClock = { startedAt: 0, nextAt: 0, deadSeen: new Map<string, number>() };

export function nextSorceressAt(now: number, rng: () => number = Math.random): number {
  return now + SORC.GAP_MIN_MS + rng() * (SORC.GAP_MAX_MS - SORC.GAP_MIN_MS);
}

export type SorcCheck = {
  now: number; level: number; dead: boolean; inCave: boolean; alive: boolean;
  /** distância até o núcleo da sua base (Infinity sem base) e até o centro da zona segura (e o raio dela) */
  baseDist: number; safeDist: number; safeR: number;
};
/** Pode surgir AGORA? (o relógio, a regra do lugar e uma por vez) */
export function sorceressMaySpawn(c: SorcCheck): boolean {
  if (sorcClock.startedAt === 0) { sorcClock.startedAt = c.now; sorcClock.nextAt = c.now + SORC.FIRST_MS; }
  if (c.now < sorcClock.nextAt || c.alive || c.dead || c.inCave || c.level < SORC.MIN_LEVEL) return false;
  return c.baseDist >= SORC.BASE_CLEAR && c.safeDist >= c.safeR + SORC.SAFE_PAD;
}

/** Ponto ATRÁS do herói (yaw do corpo: frente = (sin, cos)) onde ela pode nascer — `ok` diz se o chão serve. */
export function behindSpot(px: number, pz: number, yaw: number, ok: (x: number, z: number) => boolean, rng: () => number = Math.random): { x: number; z: number } | null {
  const back = yaw + Math.PI;
  for (let k = 0; k < 12; k++) {
    const a = back + (rng() * 2 - 1) * SORC.SPREAD, r = SORC.DIST_MIN + rng() * (SORC.DIST_MAX - SORC.DIST_MIN);
    const x = px + Math.sin(a) * r, z = pz + Math.cos(a) * r;
    if (ok(x, z)) return { x, z };
  }
  return null;
}
