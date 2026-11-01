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
/** Raio máximo do cluster de fauna em torno da âncora do bioma. */
export const ZONE_SPREAD = 110;
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

// Pedro 01/11: "dá pra aumentar mais bichos — já estão bem espalhados, +20% nas áreas espalhadas" → 123 → 149
// (era 12/8/8/8/18/14/8/36/7/4); 01/11 (2ª): "uns 10% mais de inimigos e animais" → 149 → 164 (era 14/10/10/10/22/17/10/43/8/5)
export const ZS_FAUNA: ZsRule[] = [
  { speciesId: 'boar', count: 15, ok: lagoonShore, spacing: 14 },        // Jacaré — beira da Lagoa
  { speciesId: 'goose', count: 11, ok: lagoonShore, spacing: 10 },       // Ganso — beira da Lagoa
  { speciesId: 'wolf_alpha', count: 11, ok: openField, spacing: 30 },    // Leoa — campo aberto
  { speciesId: 'bear', count: 11, ok: openField, spacing: 30 },          // Búfalo — campo aberto
  { speciesId: 'deer', count: 24, ok: lowForest, spacing: 18 },          // Cervo — mata baixa
  { speciesId: 'rabbit', count: 19, ok: lowForest, spacing: 12 },        // Coelho
  { speciesId: 'pheasant', count: 11, ok: lowForest, spacing: 14 },      // Faisão
  { speciesId: 'pigeon', count: 47, ok: cityGround, spacing: 8 },        // Pombo — pistas e campo da cidade
  { speciesId: 'monster', count: 9, ok: highForest, spacing: 40 },       // Aberração — mata alta
  { speciesId: 'flintmaw', count: 6, ok: highForest, spacing: 50 },      // Fauce de Sílex — mata alta
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

type ZsBiome = 'lagoon' | 'field' | 'lowforest' | 'highforest' | 'roads';

const BIOME_BY_SPECIES: Record<string, ZsBiome> = {
  boar: 'lagoon', goose: 'lagoon',
  wolf_alpha: 'field', bear: 'field',
  deer: 'lowforest', rabbit: 'lowforest', pheasant: 'lowforest',
  monster: 'highforest', flintmaw: 'highforest',
  pigeon: 'roads',
};

const BIOME_ANCHOR_SEEDS: Record<ZsBiome, number> = {
  lagoon: 0x6c61676f, field: 0x6669656c, lowforest: 0x6c6f7766,
  highforest: 0x68696768, roads: 0x726f6164,
};

const biomeOf = (speciesId: string): ZsBiome => BIOME_BY_SPECIES[speciesId] ?? 'roads';

/** Escolhe o candidato mais denso dentro de ZONE_SPREAD; empate preserva índice. */
function findBiomeAnchor(q: ZsQuery, rule: ZsRule, biome: ZsBiome): Position {
  const rand = rng32(BIOME_ANCHOR_SEEDS[biome]);
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const candidates: Position[] = [];
  for (let i = 0; i < 3000; i++) {
    const x = minX + 20 + rand() * (maxX - minX - 40);
    const z = minZ + 20 + rand() * (maxZ - minZ - 40);
    if (q.height(x, z) > 0.5 && freeOfSpawn(q, x, z) && rule.ok(q, x, z)) candidates.push({ x, z });
  }
  if (candidates.length === 0) return { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  if (candidates.length < 32) {
    return candidates.reduce((sum, point) => ({ x: sum.x + point.x / candidates.length, z: sum.z + point.z / candidates.length }), { x: 0, z: 0 });
  }
  let bestIndex = 0;
  let bestDensity = -1;
  const spread2 = ZONE_SPREAD * ZONE_SPREAD;
  for (let i = 0; i < candidates.length; i++) {
    let density = 0;
    for (let j = 0; j < candidates.length; j++) {
      if (i !== j && d2(candidates[i]!, candidates[j]!) <= spread2) density++;
    }
    if (density > bestDensity) {
      bestDensity = density;
      bestIndex = i;
    }
  }
  return candidates[bestIndex]!;
}

function biomeAnchors(q: ZsQuery, rules: ZsRule[]): Map<ZsBiome, Position> {
  const anchors = new Map<ZsBiome, Position>();
  for (const rule of rules) {
    const biome = biomeOf(rule.speciesId);
    if (!anchors.has(biome)) anchors.set(biome, findBiomeAnchor(q, rule, biome));
  }
  return anchors;
}

/** Fora da praia, da zona segura e do raio limpo do nascedouro. */
export function freeOfSpawn(q: ZsQuery, x: number, z: number, spawn: Position = ZS_SAFE): boolean {
  if (q.surf(x, z) === SURF.beach) return false;
  return d2({ x, z }, spawn) >= ZS_CLEAR_R * ZS_CLEAR_R;
}

/** Fauna da Zona Sul (ids `wild_<espécie>_<n>`, igual ao Vale: entra no perigo pela geografia e no respawn). */
export function createZsWildlife(q: ZsQuery, seed = 20261029, rules: ZsRule[] = ZS_FAUNA, camps: CampPlacement[] = []): CreatureState[] {
  const rand = rng32(seed);
  const out: CreatureState[] = [];
  const anchors = biomeAnchors(q, rules);
  for (const rule of rules) {
    const def = CREATURES[rule.speciesId];
    if (!def) continue;
    const anchor = anchors.get(biomeOf(rule.speciesId));
    if (!anchor) continue;
    const mine: Position[] = [];
    for (let tries = 0; mine.length < rule.count && tries < rule.count * 3000; tries++) {
      const radius = Math.sqrt(rand()) * ZONE_SPREAD;
      const angle = rand() * Math.PI * 2;
      const x = anchor.x + Math.cos(angle) * radius, z = anchor.z + Math.sin(angle) * radius;
      if (x < q.bounds.minX + 20 || x > q.bounds.maxX - 20 || z < q.bounds.minZ + 20 || z > q.bounds.maxZ - 20) continue;
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

/**
 * TUBARÕES (Pedro 01/11, GLB dele: "ficam mais próximos aos picos de surf — não exatamente onde dropa, mais próximos,
 * colado na região que chega lá — e alguns pelo mar"). Cada pico entra com o ponto do DROP (onde a onda quebra) e um
 * ANEL em volta dele (`rMin`..`rMax`): nunca em cima do drop, mas na área por onde se chega remando. O resto ("alguns
 * pelo mar") vai solto no mar fundo, longe dos picos. Sempre em MAR com fundura mínima, afastado da pedra/areia e da
 * praia de partida. Ids `wild_shark_<n>` (perigo pela região e renascer iguais aos da fauna).
 */
export const ZS_SHARK_MIN_DEPTH = 2.5;
export type ZsSharkPeak = { id: string; x: number; z: number; count: number; rMin: number; rMax: number };
/** Quantos por pico e o anel em volta do DROP (m). Arpoador: o lado aberto é o de Ipanema (a pedra fecha o outro). */
export const ZS_SHARK_PEAKS: Record<'arpoador' | 'sorriso', { count: number; rMin: number; rMax: number }> = {
  arpoador: { count: 2, rMin: 30, rMax: 80 },
  sorriso: { count: 3, rMin: 35, rMax: 110 },
};
export const ZS_SHARKS_OPEN_SEA = 3;
/** a praia de partida (Arpoador) fica calma: nenhum tubarão nasce a menos disto do nascedouro (m) */
export const ZS_SHARK_CLEAR_SPAWN = 90;
const SHARK_SPACING = 28;
const SHARK_OPEN_SPACING = 110;
const SHARK_OPEN_FROM_PEAK = 150;
const SHARK_OPEN_DEPTH = 6;

/** Mar fundo de verdade, sem pedra/areia a menos de 6 m (o tubarão não fica raspando na costa). */
export function sharkWater(q: ZsQuery, x: number, z: number, depth = ZS_SHARK_MIN_DEPTH): boolean {
  if (x < q.bounds.minX + 6 || x > q.bounds.maxX - 6 || z < q.bounds.minZ + 6 || z > q.bounds.maxZ - 6) return false;
  if (q.surf(x, z) !== SURF.sea || q.height(x, z) > -depth) return false;
  for (let a = 0; a < 8; a++) {
    const ang = (a / 8) * Math.PI * 2;
    if (q.height(x + Math.sin(ang) * 6, z + Math.cos(ang) * 6) > -1) return false;
  }
  return d2({ x, z }, ZS_SAFE) >= ZS_SHARK_CLEAR_SPAWN * ZS_SHARK_CLEAR_SPAWN;
}

export function createZsSharks(q: ZsQuery, peaks: readonly ZsSharkPeak[], seed = 20261101, openSea = ZS_SHARKS_OPEN_SEA): CreatureState[] {
  const def = CREATURES['shark'];
  if (!def) return [];
  const rand = rng32(seed);
  const at: Position[] = [];
  const mk = (p: Position): CreatureState => {
    const hp = scaleEnemyHp(def.maxHp);
    return {
      id: `wild_shark_${at.length - 1}`, speciesId: 'shark', name: def.name, hp, maxHp: hp, attackPower: def.attackPower, armor: def.armor,
      attackCooldown: def.attackCooldown, lastAttackAt: 0, position: p, behavior: 'patrol', lootTable: [], respawnAt: null,
    };
  };
  const out: CreatureState[] = [];
  // perto dos picos: anel em volta do drop
  for (const pk of peaks) {
    let n = 0;
    for (let tries = 0; n < pk.count && tries < 6000; tries++) {
      const r = pk.rMin + rand() * (pk.rMax - pk.rMin), ang = rand() * Math.PI * 2;
      const p = { x: Math.round((pk.x + Math.sin(ang) * r) * 100) / 100, z: Math.round((pk.z + Math.cos(ang) * r) * 100) / 100 };
      if (!sharkWater(q, p.x, p.z) || at.some((o) => d2(o, p) < SHARK_SPACING * SHARK_SPACING)) continue;
      at.push(p); out.push(mk(p)); n++;
    }
  }
  // "alguns pelo mar": soltos no mar fundo, longe dos picos e uns dos outros
  const { minX, maxX, minZ, maxZ } = q.bounds;
  let m = 0;
  for (let tries = 0; m < openSea && tries < 20000; tries++) {
    const p = { x: Math.round(minX + rand() * (maxX - minX)), z: Math.round(minZ + rand() * (maxZ - minZ)) };
    if (!sharkWater(q, p.x, p.z, SHARK_OPEN_DEPTH)) continue;
    if (peaks.some((pk) => d2(p, pk) < SHARK_OPEN_FROM_PEAK * SHARK_OPEN_FROM_PEAK)) continue;
    if (at.some((o) => d2(o, p) < SHARK_OPEN_SPACING * SHARK_OPEN_SPACING)) continue;
    at.push(p); out.push(mk(p)); m++;
  }
  return out;
}

/**
 * TOPOS ARMADOS (Pedro 31/10: "no topo de alguns locais como Sumaré, ali pra subida de Laranjeiras; no Horto, que é no
 * Jardim Botânico; Gávea; Rocinha — pôr mais inimigos armados: eles atiram quando passo voando com o carro"). O ponto é
 * o topo PLANO mais perto do morro de cada nome no OSM (medido no relevo): Morro do Sumaré, Morro do Horto, Morro da
 * Margarida (Gávea) e a parte alta da Rocinha. Fortim no Sumaré (com Couraça), posto/garra nos outros — todos com
 * piratas atiradores. Ids próprios, depois dos sorteados (os `zs_camp_N` e os bichos deles não mudam).
 */
export const ZS_HILLTOP_CAMPS: readonly CampPlacement[] = [
  { id: 'zs_top_sumare', defId: 'stonefist_stronghold', position: { x: -360, z: -287 } },
  { id: 'zs_top_horto', defId: 'raider_outpost', position: { x: -582, z: 121 } },
  { id: 'zs_top_gavea', defId: 'blackclaw_camp', position: { x: -484, z: 151 } },
  { id: 'zs_top_rocinha', defId: 'raider_outpost', position: { x: -690, z: 320 } },
];

/**
 * BANDIDOS ARMADOS ESPALHADOS (Pedro 01/11: "vejo poucos inimigos espalhados pelo mato no alto — não digo acampamento;
 * no Rio, no morro tem comunidade armada; mais inimigos armados espalhados pelo mato, no topo, Laranjeiras, Flamengo,
 * Gávea, Vista Chinesa, Rocinha, Vidigal"). DUPLAS de piratas de FUZIL (o mesmo atirador dos acampamentos —
 * `CAMP_GUNNERS`) no MATO ALTO (≥ 45 m, encosta andável), espalhadas pelos morros: âncoras a ≥ 150 m umas das outras,
 * longe dos acampamentos e do nascedouro. Ids `wild_bandit_<n>` (perigo pela região e renascer iguais aos da fauna).
 */
export const ZS_BANDIT_PREFIX = 'wild_bandit_';
export const ZS_BANDIT_GROUPS = 8;
export const ZS_BANDITS_PER_GROUP = 2;
const BANDIT_GROUP_SPACING = 150;
export const isZsBandit = (id: string) => id.startsWith(ZS_BANDIT_PREFIX);
const banditGround = (q: ZsQuery, x: number, z: number) =>
  (q.surf(x, z) === SURF.forest || q.surf(x, z) === SURF.land) && q.height(x, z) >= 45 && q.slope(x, z) < 28;

export function createZsBandits(q: ZsQuery, camps: CampPlacement[] = [], seed = 20261102, groups = ZS_BANDIT_GROUPS): CreatureState[] {
  const def = CREATURES['raider_scout'];
  if (!def) return [];
  const rand = rng32(seed);
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const anchors: Position[] = [];
  for (let tries = 0; anchors.length < groups && tries < 30000; tries++) {
    const p = { x: Math.round(minX + 30 + rand() * (maxX - minX - 60)), z: Math.round(minZ + 30 + rand() * (maxZ - minZ - 60)) };
    if (!banditGround(q, p.x, p.z) || !freeOfSpawn(q, p.x, p.z)) continue;
    if (anchors.some((a) => d2(a, p) < BANDIT_GROUP_SPACING * BANDIT_GROUP_SPACING)) continue;
    if (camps.some((c) => d2(c.position, p) < ((CAMPS[c.defId]?.radius ?? 10) + 30) ** 2)) continue;
    anchors.push(p);
  }
  const out: CreatureState[] = [];
  for (const a of anchors) {
    let n = 0;
    for (let tries = 0; n < ZS_BANDITS_PER_GROUP && tries < 200; tries++) {
      const r = 4 + rand() * 6, ang = rand() * Math.PI * 2;
      const p = { x: Math.round((a.x + Math.sin(ang) * r) * 100) / 100, z: Math.round((a.z + Math.cos(ang) * r) * 100) / 100 };
      if (!banditGround(q, p.x, p.z) || out.some((o) => d2(o.position, p) < 9)) continue;
      const hp = scaleEnemyHp(def.maxHp);
      out.push({
        id: `${ZS_BANDIT_PREFIX}${out.length}`, speciesId: def.id, name: def.name, hp, maxHp: hp, attackPower: def.attackPower, armor: def.armor,
        attackCooldown: def.attackCooldown, lastAttackAt: 0, position: p, behavior: 'patrol', lootTable: [], respawnAt: null,
      });
      n++;
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
