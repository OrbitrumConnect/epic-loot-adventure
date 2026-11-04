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
  /** fração da vida com que recua (o "golpe fatal" vira fuga). 03/11 (2ª): 40% → 10% — "a vida subiu" parecia cura; ele
   *  foge FERIDO (o recuo é intocável de qualquer jeito: a armadura do recuo) */
  FLEE_HP: 0.1,
  /** …mas no mínimo isto (a 1 por golpe, nem o automático a 10/s esvazia nos ~6–10 s até sumir → sem 2º "abate"/loot) */
  FLEE_HP_MIN: 200,
  /** some depois de correr isto (ms) ou de abrir esta distância de você (m) */
  FLEE_MS: 6000, FLEE_GONE_DIST: 60,
  /** desiste se você abrir esta distância dele (m) */
  LEAVE_DIST: 140,
  /** 03/11 (2ª, Pedro: "se não matou o indígena em uns 3 min é melhor ele sair correndo pra mata e voltar depois"):
   *  luta sem cair por isto (ms) → recua sozinho (sem o loot do abate) e volta em 2–4 min */
  ENGAGE_MS: 180_000,
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

/**
 * Está RECUANDO? (03/11, 2ª — Pedro: "fui até o final, ele subiu a vida, saiu correndo, ataquei ele, ele voltou a me
 * atacar… e só dá 1 de dano"). Todo golpe num bicho põe ele pra PERSEGUIR (7 lugares no jogo) — no recuo isso apagava o
 * 'flee': ele voltava a caçar com a armadura do recuo (todo golpe = 1) e o relógio de sumir parava. A ARMADURA do recuo é
 * a marca que nenhum golpe apaga → recuo = 'flee' OU essa armadura.
 */
export function isRetreating(c: { behavior: string; armor: number }): boolean { return c.behavior === 'flee' || c.armor >= FLEE_ARMOR; }

/** O "golpe fatal" nele: recua ferido (10% da vida, intocável até sumir; o resto do estado igual). Já recuando: fica. */
export function fleeInsteadOfDeath<T extends { maxHp: number; hp: number; armor: number; behavior: string }>(c: T): T {
  if (isRetreating(c)) return { ...c, hp: Math.max(1, c.hp), behavior: 'flee', armor: FLEE_ARMOR };
  return { ...c, hp: Math.max(1, Math.round(c.maxHp * IND.FLEE_HP), Math.min(c.maxHp, IND.FLEE_HP_MIN)), behavior: 'flee', armor: FLEE_ARMOR };
}
/** Cansou (3 min sem cair): recua pra mata com a vida que tem (sem abate = sem loot). */
export function retreatToForest<T extends { armor: number; behavior: string }>(c: T): T { return { ...c, behavior: 'flee', armor: FLEE_ARMOR }; }
/** Quando nasceu (o id leva a hora). */
export function indBornAt(id: string, fallback: number): number { const t = Number(id.slice(IND_PREFIX.length)); return Number.isFinite(t) && t > 0 ? t : fallback; }

/** Força pelo NÍVEL DA REGIÃO onde ele surge (03/11, 2ª — Pedro: "quem for lvl baixo vai passar sufoco"; e a regra selada
 *  de 07/10: "a dificuldade pertence à REGIÃO, não ao jogador" — 1ª versão era pelo nível do herói, trocada com o OK dele).
 *  `level` = `zoneLevel` do lugar: zona 1 (perto do início) ≈ 40% (vida e golpe), zona 2 ≈ 65%, zona 3 ≈ 95%, 4–5 = 100%. */
export function indigenaLevelK(level: number): number { return Math.min(1, Math.max(0.4, 0.35 + Math.max(0, level) * 0.01)); }
