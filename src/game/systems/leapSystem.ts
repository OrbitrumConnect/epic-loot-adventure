/**
 * SALTO e RUGIDO dos chefes novos (03/11, Pedro: "atacar pulando, dando dano e jogado pra longe"; "algo bem macabro").
 * Estado fora do React, como o agarrão do jacaré (grabSystem): a IA (hostile-ai) pergunta e aplica; o corpo (raider)
 * só lê pra tocar a animação certa.
 *
 * SALTO: a uma distância média do alvo (nem colado, nem longe) e com a recarga pronta, o chefe agacha, pula em arco
 * e cai EM CIMA: dano em área (×dmgK do golpe), EMPURRÃO forte e tremor. Esquiva (rolagem) na hora = escapa. O tempo
 * da queda casa com o clip de mutante (Mixamo "Mutant Jump Attack": agacha → voa → cai aos 1,67 s do clip).
 * RUGIDO: na 1ª vez que ele te vê, para e ruge (~2 s) antes da caçada — anúncio do chefe.
 */
export type LeapSpec = {
  /** distância do alvo (m) em que ele salta */
  minD: number; maxD: number;
  /** recarga entre saltos (ms) */
  cooldownMs: number;
  /** duração do salto (ms) e em que fração dela ele CAI (dano) */
  durMs: number; landAt: number;
  /** trecho do salto em que ele voa (frações): fora disso fica parado (agachando / se levantando) */
  flyFrom: number;
  /** área do impacto (m), dano (× o golpe), empurrão (m) e tremor */
  aoeR: number; dmgK: number; shove: number; impact: number;
  /** ruge ao avistar (ms parado); 0 = não ruge */
  roarMs: number;
};

export const LEAP: Record<string, LeapSpec> = {
  raider_cannibal: { minD: 6, maxD: 16, cooldownMs: 7000, durMs: 1200, landAt: 0.8, flyFrom: 0.2, aoeR: 4.5, dmgK: 1.6, shove: 10, impact: 0.9, roarMs: 2300 },
  raider_kraken: { minD: 7, maxD: 18, cooldownMs: 9000, durMs: 1400, landAt: 0.81, flyFrom: 0.2, aoeR: 6, dmgK: 2, shove: 13, impact: 1.2, roarMs: 2300 },
  // feiticeira: bote correndo (Mixamo "Standing Melee Run Jump Attack") — curto, sem rugido (ela chega de surpresa)
  raider_sorceress: { minD: 3.5, maxD: 9, cooldownMs: 6000, durMs: 1000, landAt: 0.8, flyFrom: 0.1, aoeR: 2.8, dmgK: 1.3, shove: 4, impact: 0.4, roarMs: 0 },
};

type LeapState = { startAt: number; until: number; landed: boolean; nextAt: number; roarUntil: number; roared: boolean;
  /** de onde saiu e onde CAI (o ponto em que o alvo estava ao pular, ~1 m antes dele) */
  fromX: number; fromZ: number; toX: number; toZ: number };
const states = new Map<string, LeapState>();
const stateOf = (id: string): LeapState => {
  let s = states.get(id);
  if (!s) { s = { startAt: -Infinity, until: -Infinity, landed: true, nextAt: 0, roarUntil: -Infinity, roared: false, fromX: 0, fromZ: 0, toX: 0, toZ: 0 }; states.set(id, s); }
  return s;
};

/** Rugido de chegada: começa na 1ª vez que ele vê o alvo (uma vez por vida). Devolve true se começou agora. */
export function tryStartRoar(id: string, speciesId: string, now = Date.now()): boolean {
  const spec = LEAP[speciesId];
  if (!spec || spec.roarMs <= 0) return false;
  const s = stateOf(id);
  if (s.roared) return false;
  s.roared = true;
  s.roarUntil = now + spec.roarMs;
  s.nextAt = Math.max(s.nextAt, s.roarUntil + 400); // não salta no meio do rugido
  return true;
}
export function isRoaring(id: string, now = Date.now()): boolean { return now < (states.get(id)?.roarUntil ?? -Infinity); }

/** Tenta começar o salto (distância e recarga): de `from` (ele) até ~1 m antes de `to` (o alvo, onde está AGORA). */
export function tryStartLeap(id: string, speciesId: string, from: { x: number; z: number }, to: { x: number; z: number }, now = Date.now()): boolean {
  const spec = LEAP[speciesId];
  if (!spec) return false;
  const s = stateOf(id);
  if (now < s.until || now < s.nextAt || now < s.roarUntil) return false;
  const dist = Math.hypot(to.x - from.x, to.z - from.z);
  if (dist < spec.minD || dist > spec.maxD) return false;
  const k = Math.max(0, dist - 1) / dist;
  s.startAt = now; s.until = now + spec.durMs; s.landed = false; s.nextAt = now + spec.cooldownMs;
  s.fromX = from.x; s.fromZ = from.z; s.toX = from.x + (to.x - from.x) * k; s.toZ = from.z + (to.z - from.z) * k;
  return true;
}
export function isLeaping(id: string, now = Date.now()): boolean { const s = states.get(id); return !!s && now < s.until; }
/** 0..1 do salto em curso (−1 sem salto). */
export function leapProgress(id: string, now = Date.now()): number {
  const s = states.get(id);
  if (!s || now >= s.until) return -1;
  return (now - s.startAt) / (s.until - s.startAt);
}
/** ONDE ele está no salto AGORA (pelo relógio, não pelo quadro — a IA anda em passos limitados e "perdia" metade do
 *  voo): parado agachando, em linha até o ponto marcado no voo, e lá depois de cair. Quem ROLOU pra fora a tempo não
 *  está mais lá → escapa. null = sem salto. */
export function leapPos(id: string, speciesId: string, now = Date.now()): { x: number; z: number } | null {
  const spec = LEAP[speciesId], s = states.get(id), k = leapProgress(id, now);
  if (!spec || !s || k < 0) return null;
  const f = Math.max(0, Math.min(1, (k - spec.flyFrom) / (spec.landAt - spec.flyFrom)));
  return { x: s.fromX + (s.toX - s.fromX) * f, z: s.fromZ + (s.toZ - s.fromZ) * f };
}
/** O instante da QUEDA (true UMA vez por salto) — quem chama aplica o dano em área. */
export function takeLeapLanding(id: string, speciesId: string, now = Date.now()): boolean {
  const spec = LEAP[speciesId], s = states.get(id);
  if (!spec || !s || s.landed) return false;
  if (now < s.startAt + (s.until - s.startAt) * spec.landAt) return false;
  s.landed = true;
  return true;
}
/** Morreu/sumiu: esquece (a próxima vida ruge de novo). */
export function clearLeap(id: string): void { states.delete(id); }
