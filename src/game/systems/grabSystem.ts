/**
 * GIRO DA MORTE do jacaré (Pedro 26/10: "o jacaré pode executar"; "o giro é viável, bom"). Na mordida, 30% de chance
 * de AGARRAR: o herói fica preso ~1,2 s enquanto o jacaré GIRA o corpo, levando 3 pancadas (total 2,5× a mordida).
 * ESCAPA na hora se acertar o jacaré. Cada jacaré só agarra de 8 em 8 s. Só o jogador local (online: o convidado
 * mordido pelo host leva a mordida normal). Estado fora do React (1 agarrão por vez — só há 1 herói local).
 */
export const GRAB_SPECIES = new Set(['boar']); // 'boar' = Jacaré
export const GRAB_CHANCE = 0.3;
export const GRAB_MS = 1200;
export const GRAB_TICKS = 3;
export const GRAB_DMG_MULT = 2.5;
export const GRAB_COOLDOWN_MS = 8000;
/** Voltas que o jacaré dá no giro. */
export const GRAB_TURNS = 2;

export type Grab = { creatureId: string; startAt: number; until: number; ticksDone: number; perTick: number };
let grab: Grab | null = null;
const lastGrabAt = new Map<string, number>();

/** Tenta agarrar (na mordida). Devolve true se começou. */
export function tryStartGrab(creatureId: string, speciesId: string, bite: number, now = Date.now(), rng: () => number = Math.random): boolean {
  if (!GRAB_SPECIES.has(speciesId) || grab) return false;
  if (now - (lastGrabAt.get(creatureId) ?? -Infinity) < GRAB_COOLDOWN_MS) return false;
  if (rng() >= GRAB_CHANCE) return false;
  lastGrabAt.set(creatureId, now);
  grab = { creatureId, startAt: now, until: now + GRAB_MS, ticksDone: 0, perTick: Math.max(1, Math.round((bite * GRAB_DMG_MULT) / GRAB_TICKS)) };
  return true;
}

/** Agarrão em curso (null = livre; expira sozinho). */
export function activeGrab(now = Date.now()): Grab | null {
  // Expira SEMPRE (+0,3 s de folga pras pancadas): se o jacaré morrer/sumir no meio, o herói nunca fica preso.
  if (grab && now >= grab.until && (grab.ticksDone >= GRAB_TICKS || now >= grab.until + 300)) grab = null;
  return grab;
}
export function isGrabbed(now = Date.now()): boolean { const g = activeGrab(now); return !!g && now < g.until; }

/** Pancadas a aplicar AGORA (em 1/3, 2/3 e 3/3 do giro). Chamado pela IA do jacaré que agarrou. */
export function grabTicksDue(creatureId: string, now = Date.now()): number {
  const g = grab;
  if (!g || g.creatureId !== creatureId) return 0;
  const due = Math.min(GRAB_TICKS, Math.floor(((now - g.startAt) / GRAB_MS) * GRAB_TICKS + 1e-9));
  const n = Math.max(0, due - g.ticksDone);
  g.ticksDone += n;
  return n;
}

/** Solta (o herói acertou o jacaré, morreu, ou o jacaré morreu). Devolve true se soltou. */
export function breakGrab(creatureId?: string): boolean {
  if (!grab || (creatureId && grab.creatureId !== creatureId)) return false;
  grab = null;
  return true;
}

/** Ângulo do giro (rad) do jacaré `creatureId` agora — 0 quando não está girando. */
export function grabSpin(creatureId: string, now = Date.now()): number {
  const g = grab;
  if (!g || g.creatureId !== creatureId || now >= g.until) return 0;
  return ((now - g.startAt) / GRAB_MS) * Math.PI * 2 * GRAB_TURNS;
}

/** Só pra testes. */
export function resetGrabs(): void { grab = null; lastGrabAt.clear(); }
