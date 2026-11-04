import type { CreatureState, Position } from '../types';
import { CREATURES, scaleEnemyHp } from '../data/creatures';
import { CAMPS, CAMP_PLACEMENTS, LAKE_CENTERS, PLAYER_SPAWN, RIVER_HALF_WIDTH, RUINS_POSITION, RUINS_RADIUS, SAFE_ZONE, WORLD_HALF, riverDistance } from '../data/camps';
import { clampX, clampZ, isClassicWorld, WORLD } from '../data/world-profile';

/** Quantas de cada espécie `createWildCreatures` posiciona. */
// +10% (Pedro, 22/10): nv alto limpava o mapa. 155 → 173. Bicho longe (>40 m) não anima (custo baixo).
export const WILD_SPAWN_COUNTS: Record<string, number> = {
  rabbit: 15,
  deer: 20,
  boar: 18,
  wolf: 0,    // RAPOSA fora (Pedro 26/10) — drop dela foi pra leoa/búfalo/jacaré; vagas viraram inimigos de acampamento
  wolf_alpha: 7,
  bear: 7,
  goose: 6,
  pheasant: 6,
  pigeon: 60, // Pombo Bravo: mais pelo mapa (Pedro curtiu). Hostil, voa e mergulha.
  eel: 0,    // REMOVIDA (Pedro): modelo Tripo quebrado (nó escala-100 + single-sided). Survivor Red entra no lugar.
  monster: 7, // Aberração: monstro ~3m (anim própria)
  collector: 0, // FORA por ora: quantizado (não medi) → risco de gigante; reprocessar sem quantize depois
  civilian: 0, // REMOVIDO (Pedro): modelo demo vinha azul + T-pose (anim mixamo não roda). Fora do jogo.
  zombie: 0,   // Morto-Vivo: SÓ À NOITE desde 26/10 (createNightZombies, 6 espalhados) — de dia nenhum
  pelter: 0,   // ROBÔ fora (Pedro 26/10: animação da net, pequeno; um robô com a cara do jogo fica pro "mundo vivo")
  flintmaw: 3, // Fauce de Sílex (meio voador, anim própria)
};

/** Total de criaturas selvagens geradas (soma de `WILD_SPAWN_COUNTS`). */
export const WILD_CREATURE_COUNT: number = Object.values(WILD_SPAWN_COUNTS).reduce((a, b) => a + b, 0);

/** Nenhuma criatura selvagem nasce a menos disto do nascedouro. */
export const WILD_SPAWN_SAFE_RADIUS = 12;
/** Folga além do raio de cada acampamento. */
export const WILD_CAMP_MARGIN = 5;
export const WILD_MIN_SPACING = 9; // espalha mais (evita 2 bichos colados — ex. serpentes)
export const DEFAULT_WILD_SEED = 7771;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist(a: Position, b: Position): number {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function isFreeForWildlife(p: Position): boolean {
  // fora do Vale (Zona Sul, 31/10): limites, zona segura, acampamentos e chão firme do MAPA ATIVO
  if (!isClassicWorld()) {
    const b = WORLD.bounds;
    if (p.x < b.minX + 3 || p.x > b.maxX - 3 || p.z < b.minZ + 3 || p.z > b.maxZ - 3) return false;
    if (dist(p, SAFE_ZONE) < SAFE_ZONE.radius) return false;
    for (const placement of CAMP_PLACEMENTS) {
      const def = CAMPS[placement.defId];
      if (def && dist(p, placement.position) < def.radius + WILD_CAMP_MARGIN) return false;
    }
    return WORLD.walkable ? WORLD.walkable(p.x, p.z) : true;
  }
  const limit = WORLD_HALF - 3;
  if (Math.abs(p.x) > limit || Math.abs(p.z) > limit) return false;
  if (dist(p, PLAYER_SPAWN) < WILD_SPAWN_SAFE_RADIUS) return false;
  if (dist(p, RUINS_POSITION) < RUINS_RADIUS + 2) return false;
  for (const placement of CAMP_PLACEMENTS) {
    const def = CAMPS[placement.defId];
    if (!def) continue;
    if (dist(p, placement.position) < def.radius + WILD_CAMP_MARGIN) return false;
  }
  for (const lake of LAKE_CENTERS) {
    if (dist(p, { x: lake.x, z: lake.z }) < lake.r + 3) return false;
  }
  if (riverDistance(p.x, p.z) < RIVER_HALF_WIDTH + 2) return false;
  return true;
}

/**
 * Fauna selvagem do vale, determinística por `seed`. Pacíficas nascem em
 * `idle` (fogem ao ver o jogador); hostis nascem em `patrol`. Fica fora dos
 * acampamentos, das ruínas e da clareira do nascedouro.
 */
export function createWildCreatures(seed: number = DEFAULT_WILD_SEED): CreatureState[] {
  const rng = mulberry32(seed);
  const creatures: CreatureState[] = [];

  for (const [speciesId, count] of Object.entries(WILD_SPAWN_COUNTS)) {
    const def = CREATURES[speciesId];
    if (!def) continue;
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 300) {
      attempts += 1;
      const pos: Position = {
        x: Math.round((rng() * 2 - 1) * (WORLD_HALF - 3) * 100) / 100,
        z: Math.round((rng() * 2 - 1) * (WORLD_HALF - 3) * 100) / 100,
      };
      if (!isFreeForWildlife(pos)) continue;
      if (creatures.some(c => dist(c.position, pos) < WILD_MIN_SPACING)) continue;
      creatures.push({
        id: `wild_${speciesId}_${placed}`,
        speciesId,
        name: def.name,
        hp: scaleEnemyHp(def.maxHp),
        maxHp: scaleEnemyHp(def.maxHp),
        attackPower: def.attackPower,
        armor: def.armor,
        attackCooldown: def.attackCooldown,
        lastAttackAt: 0,
        position: pos,
        behavior: def.peaceful ? 'idle' : 'patrol',
        lootTable: [],
        respawnAt: null,
      });
      placed += 1;
    }
  }
  return creatures;
}

/**
 * NOITE (Pedro 26/10: "búfalo à noite pode ficar mais rápido, pombo também, e ter mais pombos à noite, uns 20–30"):
 *  - velocidade: búfalo (`bear`) e pombo até +30% na noite fechada, subindo junto com o escuro (`nightFactor` 0→1);
 *  - BANDO DA NOITE: +25 pombos a 20–60 m do jogador quando escurece (≥ 0,6) e vão embora ao clarear (≤ 0,2).
 *    Id `wild_pigeon_night_<n>` (escala de zona igual aos pombos do mapa). Não vão pro save (criaturas não salvam).
 */
export const NIGHT_SPEED: Record<string, number> = { bear: 1.3, pigeon: 1.3 };
export function nightSpeedScale(speciesId: string, night: number): number {
  const k = NIGHT_SPEED[speciesId];
  return k ? 1 + (k - 1) * Math.min(1, Math.max(0, night)) : 1;
}
export const NIGHT_PIGEONS = 25;
export const NIGHT_FLOCK_ON = 0.6;
export const NIGHT_FLOCK_OFF = 0.2;
export const NIGHT_FLOCK_PREFIX = 'wild_pigeon_night_';
const FLOCK_MIN_R = 20;
const FLOCK_MAX_R = 60;

/** O que fazer com o bando agora: 'spawn' | 'leave' | null (nada). Histerese: não pisca no entardecer. */
export function nightFlockAction(night: number, hasFlock: boolean): 'spawn' | 'leave' | null {
  if (!hasFlock && night >= NIGHT_FLOCK_ON) return 'spawn';
  if (hasFlock && night <= NIGHT_FLOCK_OFF) return 'leave';
  return null;
}

/**
 * BANDO DO DIA (03/11, Pedro: "pombo vejo mais de noite; poderia ter de dia — sinto falta de alguns deles pelo mapa vindo
 * atrás de mim, rondando"): de dia os pombos só existiam nas pistas da cidade (Zona Sul) — longe de onde se joga. Agora
 * 10 pombos a 20–60 m de quem joga enquanto é DIA (≤ 0,2 de noite); ao escurecer (≥ 0,6) vão embora e chega o bando da
 * noite (25). Se você se afastar 140 m de todos, o bando "voa" pra perto de novo. Id `wild_pigeon_day_<n>`; não vão pro save.
 */
export const DAY_PIGEONS = 10;
export const DAY_FLOCK_PREFIX = 'wild_pigeon_day_';
export const DAY_FLOCK_FAR = 140;
export function dayFlockAction(night: number, hasFlock: boolean, farFromPlayer: boolean): 'spawn' | 'leave' | 'move' | null {
  if (!hasFlock && night <= NIGHT_FLOCK_OFF) return 'spawn';
  if (hasFlock && night >= NIGHT_FLOCK_ON) return 'leave';
  if (hasFlock && farFromPlayer) return 'move';
  return null;
}

/** Cria o bando em volta de `center` (lugares livres, espalhados). `prefix`: o da noite (padrão) ou o do dia. */
export function createNightPigeons(center: Position, rng: () => number = Math.random, count = NIGHT_PIGEONS, prefix = NIGHT_FLOCK_PREFIX): CreatureState[] {
  const def = CREATURES['pigeon'];
  if (!def) return [];
  const out: CreatureState[] = [];
  for (let attempts = 0; out.length < count && attempts < count * 60; attempts++) {
    const ang = rng() * Math.PI * 2;
    const r = FLOCK_MIN_R + rng() * (FLOCK_MAX_R - FLOCK_MIN_R);
    const classic = isClassicWorld();
    const px = center.x + Math.sin(ang) * r, pz = center.z + Math.cos(ang) * r;
    const pos: Position = {
      x: Math.round((classic ? Math.max(-(WORLD_HALF - 3), Math.min(WORLD_HALF - 3, px)) : clampX(px, 3)) * 100) / 100,
      z: Math.round((classic ? Math.max(-(WORLD_HALF - 3), Math.min(WORLD_HALF - 3, pz)) : clampZ(pz, 3)) * 100) / 100,
    };
    if (!isFreeForWildlife(pos)) continue;
    if (out.some((c) => dist(c.position, pos) < 4)) continue;
    const hp = scaleEnemyHp(def.maxHp);
    out.push({
      id: `${prefix}${out.length}`, speciesId: 'pigeon', name: def.name, hp, maxHp: hp,
      attackPower: def.attackPower, armor: def.armor, attackCooldown: def.attackCooldown, lastAttackAt: 0,
      position: pos, behavior: 'patrol', lootTable: [], respawnAt: null,
    });
  }
  return out;
}

/**
 * RETOMAR SALA salva antes de uma atualização (26/10): a foto do mundo (até 3 dias) pode trazer espécie que saiu do jogo
 * (raposa/robô: contagem 0) e NÃO ter inimigo novo (acampamentos 7/9/12/15). Regra: a foto manda nos ids que ela tem;
 * some bicho solto/inicial de espécie que não nasce mais; entra o que é novo (id que existe agora e não está na foto).
 */
export function mergeResumedWorld(snapshot: CreatureState[], current: CreatureState[]): CreatureState[] {
  // (01/11) o TUBARÃO (aquático) e os BANDIDOS armados (`wild_bandit_`) só nascem na Zona Sul e não estão nesta tabela do
  // Vale — não contam como "saiu do jogo"
  const gone = (c: CreatureState) =>
    (c.id.startsWith('wild_') && !c.id.startsWith('wild_bandit_') && !c.id.startsWith('wild_archer_') && !NIGHT_PREFIXES.some((p) => c.id.startsWith(p)) && (WILD_SPAWN_COUNTS[c.speciesId] ?? (CREATURES[c.speciesId]?.aquatic ? 1 : 0)) === 0)
    || (c.speciesId === 'wolf' && /^wolf_\d+$/.test(c.id)); // as 3 raposas fixas do início
  const kept = snapshot.filter((c) => !gone(c));
  const have = new Set(kept.map((c) => c.id));
  return [...kept, ...current.filter((c) => !have.has(c.id) && !gone(c))];
}

/**
 * (03/11 — Pedro: "o zumbi verde estranho que aparece à noite pode remover do jogo": NÃO nasce mais; `tickNightFlock` só
 * tira os que vierem de sala retomada. A função fica pra testes/salas antigas.)
 * MORTO-VIVO SÓ À NOITE (26/10): de dia nenhum; ao escurecer (mesma regra do bando de pombos) nascem os 6 espalhados
 * pelo mapa em lugar livre (não em volta do herói); ao clarear vão embora. Id `wild_zombie_night_<n>` (zona/Enfurecido
 * iguais aos do mapa). Não vão pro save.
 */
export const NIGHT_ZOMBIES = 6;
export const NIGHT_ZOMBIE_PREFIX = 'wild_zombie_night_';
export function createNightZombies(rng: () => number = Math.random, count = NIGHT_ZOMBIES, center?: Position): CreatureState[] {
  const def = CREATURES['zombie'];
  if (!def) return [];
  const out: CreatureState[] = [];
  // Vale: o mapa inteiro (±87 m). Mapa grande (Zona Sul): a MESMA área (±87 m) em volta de quem joga — senão 6 zumbis
  // sumiam em 1,6 km de mapa
  const cx = !isClassicWorld() && center ? center.x : 0, cz = !isClassicWorld() && center ? center.z : 0;
  for (let attempts = 0; out.length < count && attempts < count * 300; attempts++) {
    const pos: Position = {
      x: Math.round((cx + (rng() * 2 - 1) * (WORLD_HALF - 3)) * 100) / 100,
      z: Math.round((cz + (rng() * 2 - 1) * (WORLD_HALF - 3)) * 100) / 100,
    };
    if (!isFreeForWildlife(pos) || out.some((c) => dist(c.position, pos) < WILD_MIN_SPACING * 2)) continue;
    const hp = scaleEnemyHp(def.maxHp);
    out.push({
      id: `${NIGHT_ZOMBIE_PREFIX}${out.length}`, speciesId: 'zombie', name: def.name, hp, maxHp: hp,
      attackPower: def.attackPower, armor: def.armor, attackCooldown: def.attackCooldown, lastAttackAt: 0,
      position: pos, behavior: 'patrol', lootTable: [], respawnAt: null,
    });
  }
  return out;
}
/** Ids que só existem de noite (a retomada de sala e o "some ao clarear" usam). */
export const NIGHT_PREFIXES = [NIGHT_FLOCK_PREFIX, NIGHT_ZOMBIE_PREFIX, DAY_FLOCK_PREFIX];
