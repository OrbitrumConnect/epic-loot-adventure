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
// 04/11 (Pedro: "upar ficou mais difícil — add um pouco mais de inimigo; não pombo, veado nem bicho: os inimigos"): dupla → TRIO
// (os mesmos pontos — sem lugar novo)
export const ZS_BANDITS_PER_GROUP = 3;
const BANDIT_GROUP_SPACING = 150;
export const isZsBandit = (id: string) => id.startsWith(ZS_BANDIT_PREFIX);
const banditGround = (q: ZsQuery, x: number, z: number) =>
  (q.surf(x, z) === SURF.forest || q.surf(x, z) === SURF.land) && q.height(x, z) >= 45 && q.slope(x, z) < 28;

export function createZsBandits(q: ZsQuery, camps: CampPlacement[] = [], seed = 20261102, groups = ZS_BANDIT_GROUPS, avoid: Position[] = []): CreatureState[] {
  const def = CREATURES['raider_scout'];
  if (!def) return [];
  const rand = rng32(seed);
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const anchors: Position[] = [];
  for (let tries = 0; anchors.length < groups && tries < 30000; tries++) {
    const p = { x: Math.round(minX + 30 + rand() * (maxX - minX - 60)), z: Math.round(minZ + 30 + rand() * (maxZ - minZ - 60)) };
    if (!banditGround(q, p.x, p.z) || !freeOfSpawn(q, p.x, p.z)) continue;
    if (anchors.some((a) => d2(a, p) < BANDIT_GROUP_SPACING * BANDIT_GROUP_SPACING)) continue;
    if (avoid.some((a) => d2(a, p) < BANDIT_GROUP_SPACING * BANDIT_GROUP_SPACING)) continue; // 03/11: longe das duplas que já existem
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

/**
 * ÁREA NOVA (02/11 — Gávea, Pedra Bonita, São Conrado; Pedro: "bichos/inimigos na área nova"): o MESMO sorteio da
 * fauna e dos bandidos, só que no terreno de agora e SÓ FORA do recorte antigo (lá dentro conta como "fora do mapa").
 * Sorteio próprio (sementes novas) → nada do que existe muda. Ids com `gv` (`wild_deer_gv0`, `wild_bandit_gv0`):
 * perigo pela região e renascer iguais aos da fauna; o bandido segue atirador (`isZsBandit`).
 */
export const ZS_NEW_AREA_FAUNA: ZsRule[] = [
  { speciesId: 'deer', count: 7, ok: lowForest, spacing: 18 },       // Cervo — mata baixa
  { speciesId: 'rabbit', count: 6, ok: lowForest, spacing: 12 },     // Coelho
  { speciesId: 'pheasant', count: 4, ok: lowForest, spacing: 14 },   // Faisão
  { speciesId: 'monster', count: 4, ok: highForest, spacing: 40 },   // Aberração — mata alta (a Gávea é alta)
  { speciesId: 'flintmaw', count: 3, ok: highForest, spacing: 50 },  // Fauce de Sílex
];
export const ZS_NEW_AREA_BANDIT_GROUPS = 2;
export function createZsNewAreaCreatures(q: ZsQuery, oldBounds: ZsQuery['bounds'], camps: CampPlacement[] = []): CreatureState[] {
  const inOld = (x: number, z: number) => x >= oldBounds.minX && x <= oldBounds.maxX && z >= oldBounds.minZ && z <= oldBounds.maxZ;
  const area: ZsQuery = { ...q, surf: (x, z) => (inOld(x, z) ? SURF.out : q.surf(x, z)) };
  const tag = (c: CreatureState) => ({ ...c, id: c.id.replace(/_(\d+)$/, '_gv$1') });
  return [
    ...createZsWildlife(area, 20261102, ZS_NEW_AREA_FAUNA, camps).map(tag),
    ...createZsBandits(area, camps, 0x67617665, ZS_NEW_AREA_BANDIT_GROUPS).map(tag),
  ];
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

/**
 * BICHOS ESPALHADOS PELO MAPA (03/11, Pedro: "preciso ver quanto mais inimigos e mutantes, bichos pra farmar pelo mapa —
 * acho que tá pouco, o mapa é grande"). Medido: cada espécie nasce num grupo SÓ (1 âncora por bioma, 110 m de raio) — os
 * mansos em 3 lugares; o maciço da Tijuca/Alto da Boa Vista, Copacabana, Ipanema, Leblon e São Conrado sem bicho. Esta
 * leva SOMA zonas novas no mapa inteiro (terreno de agora), cada uma a ≥ ZS_SPREAD_GAP de qualquer bicho/inimigo que já
 * existe e das outras zonas, com os bichos do chão dela: mata ALTA = mutantes (Aberração, Fauce de Sílex) + cervo; mata
 * baixa = cervo, coelho, faisão; campo = leoa, búfalo; cidade = pombo + leoa/búfalo. Os tipos vão em rodízio (os
 * mutantes aparecem em toda volta). Sorteio próprio → nada do que existe muda. Ids `wild_<espécie>_sp<n>` (perigo pela
 * região e renascer iguais aos da fauna). Custo medido: dobrar os bichos soltos (+235) tirou ~8% do FPS; esta leva é ~metade.
 */
export const ZS_SPREAD_ZONES = 16;
export const ZS_SPREAD_GAP = 200;
/** raio de cada zona (m) */
export const ZS_SPREAD_R = 60;
export type ZsSpreadKind = 'high' | 'low' | 'field' | 'city';
export const ZS_SPREAD_MIX: Record<ZsSpreadKind, { speciesId: string; count: number; spacing: number }[]> = {
  high: [{ speciesId: 'monster', count: 2, spacing: 25 }, { speciesId: 'flintmaw', count: 2, spacing: 30 }, { speciesId: 'deer', count: 2, spacing: 15 }],
  low: [{ speciesId: 'deer', count: 3, spacing: 15 }, { speciesId: 'rabbit', count: 3, spacing: 10 }, { speciesId: 'pheasant', count: 2, spacing: 12 }],
  field: [{ speciesId: 'wolf_alpha', count: 2, spacing: 20 }, { speciesId: 'bear', count: 2, spacing: 20 }, { speciesId: 'pigeon', count: 2, spacing: 8 }],
  city: [{ speciesId: 'pigeon', count: 4, spacing: 8 }, { speciesId: 'wolf_alpha', count: 1, spacing: 20 }, { speciesId: 'bear', count: 1, spacing: 20 }],
};
const SPREAD_ORDER: ZsSpreadKind[] = ['high', 'low', 'city', 'high', 'low', 'field'];
const SPREAD_OK: Record<string, (q: ZsQuery, x: number, z: number) => boolean> = {
  monster: highForest, flintmaw: highForest, deer: lowForest, rabbit: lowForest, pheasant: lowForest,
  wolf_alpha: openField, bear: openField, pigeon: cityGround,
};
/** O tipo de zona que o chão de (x, z) aceita (null = nenhum: praia, água, paredão…). */
export function zsSpreadKindAt(q: ZsQuery, x: number, z: number): ZsSpreadKind | null {
  if (q.height(x, z) < 0.5) return null;
  if (highForest(q, x, z)) return 'high';
  if (lowForest(q, x, z)) return 'low';
  if (openField(q, x, z)) return 'field';
  if (cityGround(q, x, z)) return 'city';
  return null;
}
/** Grade grossa (8 m) do chão que se alcança A PÉ do nascedouro (sem cruzar mar/Lagoa) — as Cagarras ficam de fora. */
const REACH_CELL = 8;
export function zsReachable(q: ZsQuery): (x: number, z: number) => boolean {
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const W = Math.ceil((maxX - minX) / REACH_CELL), H = Math.ceil((maxZ - minZ) / REACH_CELL);
  const seen = new Uint8Array(W * H);
  const walk = (i: number, j: number) => { const s = q.surf(minX + (i + 0.5) * REACH_CELL, minZ + (j + 0.5) * REACH_CELL); return s !== SURF.sea && s !== SURF.lagoon && s !== SURF.out; };
  const i0 = Math.floor((ZS_SAFE.x - minX) / REACH_CELL), j0 = Math.floor((ZS_SAFE.z - minZ) / REACH_CELL);
  const stack = [j0 * W + i0];
  seen[j0 * W + i0] = 1;
  while (stack.length) {
    const k = stack.pop()!, i = k % W, j = (k - i) / W;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const a = i + di, b = j + dj;
      if (a < 0 || b < 0 || a >= W || b >= H || seen[b * W + a] || !walk(a, b)) continue;
      seen[b * W + a] = 1; stack.push(b * W + a);
    }
  }
  return (x, z) => { const i = Math.floor((x - minX) / REACH_CELL), j = Math.floor((z - minZ) / REACH_CELL); return i >= 0 && j >= 0 && i < W && j < H && seen[j * W + i] === 1; };
}
export function createZsSpreadFauna(q: ZsQuery, avoid: Position[], camps: CampPlacement[] = [], seed = 0x73707264, zones = ZS_SPREAD_ZONES): { creatures: CreatureState[]; zones: { kind: ZsSpreadKind; x: number; z: number }[] } {
  const rand = rng32(seed);
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const gap2 = ZS_SPREAD_GAP * ZS_SPREAD_GAP;
  const reach = zsReachable(q);
  const centers: { kind: ZsSpreadKind; x: number; z: number }[] = [];
  for (let zi = 0; centers.length < zones && zi < zones * 3; zi++) {
    const want = SPREAD_ORDER[zi % SPREAD_ORDER.length]!;
    // entre os lugares que servem, o MAIS LONGE de tudo (enche primeiro os maiores buracos do mapa)
    let best: Position | null = null, bestD = -1;
    for (let tries = 0, found = 0; tries < 20000 && found < 300; tries++) {
      const p = { x: Math.round(minX + 40 + rand() * (maxX - minX - 80)), z: Math.round(minZ + 40 + rand() * (maxZ - minZ - 80)) };
      if (!freeOfSpawn(q, p.x, p.z) || zsSpreadKindAt(q, p.x, p.z) !== want || !reach(p.x, p.z)) continue;
      if (camps.some((c) => d2(c.position, p) < ((CAMPS[c.defId]?.radius ?? 10) + 40) ** 2)) continue;
      let dmin = Infinity;
      for (const a of avoid) dmin = Math.min(dmin, d2(a, p));
      for (const c of centers) dmin = Math.min(dmin, d2(c, p));
      if (dmin < gap2) continue;
      found++;
      if (dmin > bestD) { bestD = dmin; best = p; }
    }
    if (best) centers.push({ kind: want, ...best });
  }
  const out: CreatureState[] = [];
  const nBy: Record<string, number> = {};
  for (const c of centers) {
    for (const m of ZS_SPREAD_MIX[c.kind]) {
      const def = CREATURES[m.speciesId], ok = SPREAD_OK[m.speciesId];
      if (!def || !ok) continue;
      const mine: Position[] = [];
      for (let tries = 0; mine.length < m.count && tries < 400; tries++) {
        const r = Math.sqrt(rand()) * ZS_SPREAD_R, a = rand() * Math.PI * 2;
        const p = { x: Math.round((c.x + Math.cos(a) * r) * 100) / 100, z: Math.round((c.z + Math.sin(a) * r) * 100) / 100 };
        if (p.x < minX + 20 || p.x > maxX - 20 || p.z < minZ + 20 || p.z > maxZ - 20) continue;
        if (q.height(p.x, p.z) < 0.5 || !freeOfSpawn(q, p.x, p.z) || !ok(q, p.x, p.z) || !reach(p.x, p.z)) continue;
        if (mine.some((o) => d2(o, p) < m.spacing * m.spacing) || out.some((o) => d2(o.position, p) < 36)) continue;
        if (camps.some((cp) => d2(cp.position, p) < ((CAMPS[cp.defId]?.radius ?? 10) + 12) ** 2)) continue;
        mine.push(p);
        const n = (nBy[m.speciesId] = (nBy[m.speciesId] ?? -1) + 1);
        out.push({
          id: `wild_${m.speciesId}_sp${n}`, speciesId: m.speciesId, name: def.name,
          hp: scaleEnemyHp(def.maxHp), maxHp: scaleEnemyHp(def.maxHp), attackPower: def.attackPower, armor: def.armor,
          attackCooldown: def.attackCooldown, lastAttackAt: 0, position: p,
          behavior: def.peaceful ? 'idle' : 'patrol', lootTable: [], respawnAt: null,
        });
      }
    }
  }
  return { creatures: out, zones: centers };
}
/** + duplas de bandidos (03/11: "mais inimigos"): mesmas regras das de sempre, longe delas; ids `wild_bandit_sp<n>`. */
/**
 * ARQUEIROS NA MATA (03/11, Pedro: "o saqueador xamã está pequeno, inimigo dos acampamentos… seria bom ter ele no mato
 * rondando, pois é arqueiro, atira de longe — fica maneiro"). DUPLAS de xamã (o arqueiro) em CHÃO DE FLORESTA (≥ 8 m,
 * encosta andável), âncoras a ≥ 140 m umas das outras, longe dos acampamentos (+30 m), do nascedouro e das duplas de
 * bandidos (≥ 100 m). Tamanho normal (fora do acampamento); rondam, veem de 24 m e atiram FLECHA de 16 m (raider.tsx).
 * Ids `wild_archer_<n>` (perigo pela região e renascer iguais aos da fauna).
 */
export const ZS_ARCHER_PREFIX = 'wild_archer_';
export const ZS_ARCHER_GROUPS = 6;
export const ZS_ARCHERS_PER_GROUP = 3; // 04/11: dupla → trio (mais inimigo pra upar)
const ARCHER_GROUP_SPACING = 140;
export const isZsArcher = (id: string) => id.startsWith(ZS_ARCHER_PREFIX);
const archerGround = (q: ZsQuery, x: number, z: number) => q.surf(x, z) === SURF.forest && q.height(x, z) >= 8 && q.slope(x, z) < 30;
export function createZsForestArchers(q: ZsQuery, camps: CampPlacement[] = [], avoid: Position[] = [], seed = 0x61726368): CreatureState[] {
  const def = CREATURES['raider_shaman'];
  if (!def) return [];
  const rand = rng32(seed);
  const { minX, maxX, minZ, maxZ } = q.bounds;
  const anchors: Position[] = [];
  for (let tries = 0; anchors.length < ZS_ARCHER_GROUPS && tries < 30000; tries++) {
    const p = { x: Math.round(minX + 30 + rand() * (maxX - minX - 60)), z: Math.round(minZ + 30 + rand() * (maxZ - minZ - 60)) };
    if (!archerGround(q, p.x, p.z) || !freeOfSpawn(q, p.x, p.z)) continue;
    if (anchors.some((a) => d2(a, p) < ARCHER_GROUP_SPACING ** 2)) continue;
    if (avoid.some((a) => d2(a, p) < 100 ** 2)) continue;
    if (camps.some((c) => d2(c.position, p) < ((CAMPS[c.defId]?.radius ?? 10) + 30) ** 2)) continue;
    anchors.push(p);
  }
  const out: CreatureState[] = [];
  for (const a of anchors) {
    let n = 0;
    for (let tries = 0; n < ZS_ARCHERS_PER_GROUP && tries < 200; tries++) {
      const r = 4 + rand() * 8, ang = rand() * Math.PI * 2;
      const p = { x: Math.round((a.x + Math.sin(ang) * r) * 100) / 100, z: Math.round((a.z + Math.cos(ang) * r) * 100) / 100 };
      if (!archerGround(q, p.x, p.z) || out.some((o) => d2(o.position, p) < 9)) continue;
      const hp = scaleEnemyHp(def.maxHp);
      out.push({
        id: `${ZS_ARCHER_PREFIX}${out.length}`, speciesId: def.id, name: def.name, hp, maxHp: hp, attackPower: def.attackPower, armor: def.armor,
        attackCooldown: def.attackCooldown, lastAttackAt: 0, position: p, behavior: 'patrol', lootTable: [], respawnAt: null,
      });
      n++;
    }
  }
  return out;
}

export const ZS_SPREAD_BANDIT_GROUPS = 4;
export function createZsSpreadBandits(q: ZsQuery, existing: CreatureState[], camps: CampPlacement[] = []): CreatureState[] {
  const avoid = existing.filter((c) => isZsBandit(c.id)).map((c) => c.position);
  return createZsBandits(q, camps, 0x62616e64, ZS_SPREAD_BANDIT_GROUPS, avoid).map((c) => ({ ...c, id: c.id.replace(/_(\d+)$/, '_sp$1') }));
}
