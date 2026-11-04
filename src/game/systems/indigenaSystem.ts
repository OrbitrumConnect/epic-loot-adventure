/**
 * GUERREIRO INDÍGENA (03/11, Pedro: "um indígena no mapa que aparece correndo atrás do jogador diversas vezes; não
 * matar — dar dano até ele sumir; meio forte; o dano que mataria ele, ele sai correndo e volta depois de um tempo").
 *
 * Na Zona Sul, longe da base, ele surge ATRÁS de você e caça. NÃO MORRE: o golpe que o mataria faz ele RECUAR FERIDO
 * (`deadCreature` devolve 'flee' com 40% da vida — você leva o XP/loot do "abate" de sempre), corre pra longe, some e
 * VOLTA depois de 2–4 min, inteiro. Se você fugir dele (140 m), ele desiste e volta em ~1 min. Um por vez; online, o host
 * decide (como o bando da noite). Só decisões puras + o relógio — quem cria/remove é o store (`tickIndigena`).
 */
export const IND_PREFIX = 'ind_';
/** Não morre: no golpe fatal recua ferido (`deadCreature`). */
export const isUnkillable = (id: string) => id.startsWith(IND_PREFIX);

export const IND = {
  /** nível mínimo do herói */
  MIN_LEVEL: 5,
  /** a 1ª aparição da sessão (ms) */
  FIRST_MS: 180_000,
  /** volta depois de RECUAR ferido: sorteado entre (ms) */
  RETURN_MIN_MS: 120_000, RETURN_MAX_MS: 240_000,
  /** volta depois de você FUGIR dele (ms) */
  LOST_RETURN_MS: 60_000,
  /** fração da vida com que recua (o "golpe fatal" vira fuga) */
  FLEE_HP: 0.4,
  /** some depois de correr isto (ms) ou de abrir esta distância de você (m) */
  FLEE_MS: 6000, FLEE_GONE_DIST: 60,
  /** desiste se você abrir esta distância dele (m) */
  LEAVE_DIST: 140,
  /** não surge perto da SUA base (m) nem na zona segura (+ folga) */
  BASE_CLEAR: 60, SAFE_PAD: 20,
} as const;

/** Relógio da sessão (fora do React). `fleeSeen`: quando cada um começou a recuar. `returns`: quantas vezes já voltou. */
export const indClock = { startedAt: 0, nextAt: 0, fleeSeen: new Map<string, number>(), returns: 0 };

export function nextIndigenaAt(now: number, rng: () => number = Math.random): number {
  return now + IND.RETURN_MIN_MS + rng() * (IND.RETURN_MAX_MS - IND.RETURN_MIN_MS);
}

export type IndCheck = { now: number; level: number; dead: boolean; inCave: boolean; present: boolean; baseDist: number; safeDist: number; safeR: number };
/** Pode (re)aparecer AGORA? */
export function indigenaMaySpawn(c: IndCheck): boolean {
  if (indClock.startedAt === 0) { indClock.startedAt = c.now; indClock.nextAt = c.now + IND.FIRST_MS; }
  if (c.now < indClock.nextAt || c.present || c.dead || c.inCave || c.level < IND.MIN_LEVEL) return false;
  return c.baseDist >= IND.BASE_CLEAR && c.safeDist >= c.safeR + IND.SAFE_PAD;
}

/** O que fazer com ele agora: 'stay' (segue caçando / correndo), 'gone_fled' (recuou e sumiu → volta em 2–4 min),
 *  'gone_lost' (você fugiu → volta em ~1 min). `fleeingSince` = quando começou a recuar (null = não está recuando). */
export function indigenaState(o: { now: number; fleeingSince: number | null; dist: number }): 'stay' | 'gone_fled' | 'gone_lost' {
  if (o.fleeingSince !== null) return o.now - o.fleeingSince >= IND.FLEE_MS || o.dist >= IND.FLEE_GONE_DIST ? 'gone_fled' : 'stay';
  return o.dist > IND.LEAVE_DIST ? 'gone_lost' : 'stay';
}

/** Armadura enquanto recua: todo golpe vira o dano mínimo (1) — não dá pra "abater" de novo e farmar o loot nos 6 s. */
export const FLEE_ARMOR = 1_000_000;

/** O "golpe fatal" nele: recua ferido (40% da vida, intocável até sumir; o resto do estado igual). Já recuando: fica. */
export function fleeInsteadOfDeath<T extends { maxHp: number; hp: number; armor: number; behavior: string }>(c: T): T {
  if (c.behavior === 'flee') return { ...c, hp: Math.max(1, c.hp) };
  return { ...c, hp: Math.max(1, Math.round(c.maxHp * IND.FLEE_HP)), behavior: 'flee', armor: FLEE_ARMOR };
}
