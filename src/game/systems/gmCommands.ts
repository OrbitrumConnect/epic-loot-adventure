import { CREATURES } from '@/game/data/creatures';
import { ITEMS } from '@/game/data/items';

/**
 * Comandos de GM do chat (puro, testável). Normaliza texto pra casar nome↔id de forma tolerante
 * (espaço/traço/maiúsculas/acento) e separa comando/argumento. Execução é feita por quem chama.
 */

/** Normaliza: tira acento, caixa baixa, e junta separadores (espaço/traço/underscore) num só '_'. */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[\s\-_]+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

/** Casa `query` contra uma lista {id,name}: id exato normalizado > nome exato normalizado > prefixo > contém. */
export function matchId(query: string, entries: { id: string; name: string }[]): string | null {
  const q = normalizeName(query);
  if (!q) return null;
  const byId = entries.find(e => normalizeName(e.id) === q);
  if (byId) return byId.id;
  const byName = entries.find(e => normalizeName(e.name) === q);
  if (byName) return byName.id;
  const pref = entries.find(e => normalizeName(e.name).startsWith(q) || normalizeName(e.id).startsWith(q));
  if (pref) return pref.id;
  const has = entries.find(e => normalizeName(e.name).includes(q) || normalizeName(e.id).includes(q));
  if (has) return has.id;
  const compact = (value: string) => normalizeName(value).replace(/_/g, '');
  const compactQuery = compact(q);
  const compactPref = entries.find(e => compact(e.name).startsWith(compactQuery) || compact(e.id).startsWith(compactQuery));
  if (compactPref) return compactPref.id;
  const compactHas = entries.find(e => compact(e.name).includes(compactQuery) || compact(e.id).includes(compactQuery));
  return compactHas ? compactHas.id : null;
}

const CREATURE_ENTRIES = (): { id: string; name: string }[] =>
  Object.values(CREATURES).map(c => ({ id: c.id, name: c.name }));
const ITEM_ENTRIES = (): { id: string; name: string }[] =>
  Object.values(ITEMS).map(i => ({ id: i.id, name: i.name }));

/** Nome digitado → speciesId de CREATURES (ou null). Aceita espaço/traço/caixa/acento. */
export function resolveCreatureId(query: string): string | null {
  return matchId(query, CREATURE_ENTRIES());
}
/** Nome digitado → itemId de ITEMS (ou null). */
export function resolveItemId(query: string): string | null {
  return matchId(query, ITEM_ENTRIES());
}

export type GmParsed = { cmd: string; arg: string };
/** Separa "!goto Colosso dos Ancestrais" em { cmd:'goto', arg:'Colosso dos Ancestrais' }. Sem '!' → null. */
export function parseGmCommand(raw: string): GmParsed | null {
  const s = raw.trim();
  if (!s.startsWith('!')) return null;
  const body = s.slice(1).trim();
  if (!body) return null;
  const sp = body.search(/\s/);
  if (sp < 0) return { cmd: body.toLowerCase(), arg: '' };
  return { cmd: body.slice(0, sp).toLowerCase(), arg: body.slice(sp + 1).trim() };
}

/** Personagens com poderes de GM (nome normalizado). O dono pediu: Joel = GM. */
const GM_NAMES = new Set<string>(['joel']);
/** Esse personagem é GM? (allowlist por nome — não depende de save). */
export function isGM(player: { name: string }): boolean {
  return GM_NAMES.has(normalizeName(player.name));
}
