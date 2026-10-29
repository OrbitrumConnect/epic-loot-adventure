/**
 * ZONA SUL — ONDE NASCE CADA COISA (29/10, Pedro: "espalhar corretamente nas áreas: jacaré na Lagoa, leão no campo
 * aberto, acampamentos inimigos entre os matos em locais adequados, praia mais vazia").
 * Puro e determinístico (mesma semente = mesmo mapa pra todo mundo). Lê o terreno por uma interface (`ZsQuery`) — não
 * sabe de PNG nem de three. As regras usam o TIPO de chão que o bake já marca (mar, Lagoa, praia, mata, campo, pista),
 * a altura e a inclinação:
 *  - PRAIA e zona segura: ninguém nasce (praia "mais vazia").
 *  - Jacaré: na BEIRA da Lagoa (terra a até ~18 m da água da Lagoa). Ganso: beira da Lagoa também.
 *  - Leoa e Búfalo: CAMPO ABERTO (terra que não é mata nem pista, plano, baixo — Aterro/Botafogo/Jockey).
 *  - Cervo, coelho, faisão: borda e miolo da MATA baixa. Pombo: pistas e campo da cidade (fora da praia).
 *  - Aberração e Fauce de Sílex: mata ALTA (morros/Floresta da Tijuca) — o perigo pela geografia.
 *  - Acampamentos: clareira PLANA dentro/encostada na MATA, fora da praia, longe do nascedouro e uns dos outros.
 */
import { CREATURES, scaleEnemyHp } from '../data/creatures';
import { CAMPS, type CampPlacement } from '../data/camps';
import type { CreatureState, Position } from '../types';

/** Tipos de chão do bake (espelho de ZS_SURF em zona-sul-meta.ts). */
export const SURF = { land: 0, sea: 1, lagoon: 2, beach: 3, forest: 4, out: 5, road: 6 } as const;

export type ZsQuery = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  surf: (x: number, z: number) => number;
  height: (x: number, z: number) => number;
  slope: (x: number, z: number) => number;
};

export type ZsRule = {
  speciesId: string;
  count: number;
  /** aceita o ponto? */
  ok: (q: ZsQuery, x: number, z: number) => boolean;
  /** distância mínima entre dois da mesma espécie (m) */
  spacing: number;
};

/** Nascedouro / zona segura da Zona Sul (praia do Arpoador). */
export const ZS_SAFE = { x: 90, z: 390, radius: 45 } as const;
/** Ninguém (bicho ou acampamento) nasce a menos disto do nascedouro (m). */
export const ZS_CLEAR_R = 140;
/** Faixas de PERIGO (m do nascedouro): praia → orla → Lagoa/Botafogo → morros → Tijuca. */
export const ZS_ZONE_RADII = [140, 300, 480, 680] as const;

const isLand = (s: number) => s === SURF.land || s === SURF.forest || s === SURF.road;

/** Tem célula do tipo `kind` a até `r` m de (x, z)? (8 direções em 2 anéis — barato e suficiente) */
export function near(q: ZsQuery, x: number, z: number, kind: number, r: number): boolean {
  for (const k of [0.5, 1]) {
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      if (q.surf(x + Math.sin(ang) * r * k, z + Math.cos(ang) * r * k) === kind) return true;
    }
  }
  return false;
}

const openField = (q: ZsQuery, x: number, z: number) =>
  q.surf(x, z) === SURF.land && q.slope(x, z) < 9 && q.height(x, z) < 45 && !near(q, x, z, SURF.forest, 10) && !near(q, x, z, SURF.beach, 25);
const lowForest = (q: ZsQuery, x: number, z: number) =>
  (q.surf(x, z) === SURF.forest || (q.surf(x, z) === SURF.land && near(q, x, z, SURF.forest, 12))) && q.slope(x, z) < 24 && q.height(x, z) < 140;
const highForest = (q: ZsQuery, x: number, z: number) =>
  q.surf(x, z) === SURF.forest && q.height(x, z) >= 100 && q.slope(x, z) < 38;
const lagoonShore = (q: ZsQuery, x: number, z: number) =>
  isLand(q.surf(x, z)) && q.height(x, z) < 8 && near(q, x, z, SURF.lagoon, 18);
const cityGround = (q: ZsQuery, x: number, z: number) =>
  (q.surf(x, z) === SURF.road || q.surf(x, z) === SURF.land) && q.slope(x, z) < 12 && q.height(x, z) < 40 && !near(q, x, z, SURF.beach, 20);

export const ZS_FAUNA: ZsRule[] = [
  { speciesId: 'boar', count: 12, ok: lagoonShore, spacing: 14 },        // Jacaré — beira da Lagoa
  { speciesId: 'goose', count: 8, ok: lagoonShore, spacing: 10 },        // Ganso — beira da Lagoa
  { speciesId: 'wolf_alpha', count: 8, ok: openField, spacing: 30 },     // Leoa — campo aberto
  { speciesId: 'bear', count: 8, ok: openField, spacing: 30 },           // Búfalo — campo aberto
  { speciesId: 'deer', count: 18, ok: lowForest, spacing: 18 },          // Cervo — mata baixa
  { speciesId: 'rabbit', count: 14, ok: lowForest, spacing: 12 },        // Coelho
  { speciesId: 'pheasant', count: 8, ok: lowForest, spacing: 14 },       // Faisão
  { speciesId: 'pigeon', count: 36, ok: cityGround, spacing: 8 },        // Pombo — pistas e campo da cidade
  { speciesId: 'monster', count: 7, ok: highForest, spacing: 40 },       // Aberração — mata alta
  { speciesId: 'flintmaw', count: 4, ok: highForest, spacing: 50 },      // Fauce de Sílex — mata alta
];

/** Mulberry32 — o mesmo gerador do resto do jogo. */
export function rng32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const d2 = (a: Position, b: Position) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;

/** Fora da praia, da zona segura e do raio limpo do nascedouro. */
export function freeOfSpawn(q: ZsQuery, x: number, z: number, spawn: Position = ZS_SAFE): boolean {
  if (q.surf(x, z) === SURF.beach) return false;
  return d2({ x, z }, spawn) >= ZS_CLEAR_R * ZS_CLEAR_R;
}

/** Fauna da Zona Sul (ids `wild_<espécie>_<n>`, igual ao Vale: entra no perigo pela geografia e no respawn). */
export function createZsWildlife(q: ZsQuery, seed = 20261029, rules: ZsRule[] = ZS_FAUNA, camps: CampPlacement[] = []): CreatureState[] {
  const rand = rng32(seed);
  const out: CreatureState[] = [];
  const { minX, maxX, minZ, maxZ } = q.bounds;
  for (const rule of rules) {
    const def = CREATURES[rule.speciesId];
    if (!def) continue;
    const mine: Position[] = [];
    for (let tries = 0; mine.length < rule.count && tries < rule.count * 1500; tries++) {
      const x = minX + 20 + rand() * (maxX - minX - 40), z = minZ + 20 + rand() * (maxZ - minZ - 40);
      if (q.height(x, z) < 0.5 || !freeOfSpawn(q, x, z) || !rule.ok(q, x, z)) continue; // chão SECO (nada nasce na água)
      const p = { x: Math.round(x * 100) / 100, z: Math.round(z * 100) / 100 };
      if (mine.some((m) => d2(m, p) < rule.spacing * rule.spacing)) continue;
      if (camps.some((c) => d2(c.position, p) < ((CAMPS[c.defId]?.radius ?? 10) + 12) ** 2)) continue;
      mine.push(p);
      out.push({
        id: `wild_${rule.speciesId}_${mine.length - 1}`, speciesId: rule.speciesId, name: def.name,
        hp: scaleEnemyHp(def.maxHp), maxHp: scaleEnemyHp(def.maxHp), attackPower: def.attackPower, armor: def.armor,
        attackCooldown: def.attackCooldown, lastAttackAt: 0, position: p,
        behavior: def.peaceful ? 'idle' : 'patrol', lootTable: [], respawnAt: null,
      });
    }
  }
  return out;
}

/** Clareira de acampamento: chão PLANO no raio todo (5 pontos), terra seca, encostada na MATA. */
function campSiteOk(q: ZsQuery, x: number, z: number, r: number): boolean {
  if (!freeOfSpawn(q, x, z) || q.surf(x, z) === SURF.road) return false;
  const h0 = q.height(x, z);
  if (h0 < 4 || h0 > 160) return false;
  for (const [dx, dz] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]] as const) {
    const s = q.surf(x + dx, z + dz);
    if (!isLand(s) || q.slope(x + dx, z + dz) > 14 || Math.abs(q.height(x + dx, z + dz) - h0) > 3.5) return false;
  }
  return near(q, x, z, SURF.forest, r + 10);
}

/** Acampamentos da Zona Sul: `count` clareiras na mata, alternando os 4 tipos (fraco perto → forte longe). */
export function pickZsCampSites(q: ZsQuery, count = 8, seed = 291029, spacing = 170): CampPlacement[] {
  const rand = rng32(seed);
  const defs = Object.keys(CAMPS).sort((a, b) => (CAMPS[a]!.radius) - (CAMPS[b]!.radius)); // menor (fraco) → maior
  const out: CampPlacement[] = [];
  const { minX, maxX, minZ, maxZ } = q.bounds;
  for (let tries = 0; out.length < count && tries < 40000; tries++) {
    const x = minX + 30 + rand() * (maxX - minX - 60), z = minZ + 30 + rand() * (maxZ - minZ - 60);
    const p = { x: Math.round(x), z: Math.round(z) };
    if (out.some((c) => d2(c.position, p) < spacing * spacing)) continue;
    // o tipo sai da DISTÂNCIA do nascedouro: perto = posto pequeno, longe = fortim (perigo pela geografia)
    const far = Math.min(defs.length - 1, Math.floor((Math.sqrt(d2(p, ZS_SAFE)) - ZS_CLEAR_R) / 170));
    const defId = defs[Math.max(0, far)]!;
    if (!campSiteOk(q, p.x, p.z, CAMPS[defId]!.radius)) continue;
    out.push({ id: `zs_camp_${out.length}`, defId, position: p });
  }
  return out;
}
