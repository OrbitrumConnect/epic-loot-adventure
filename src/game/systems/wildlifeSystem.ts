import type { CreatureState, Position } from '../types';
import { CREATURES } from '../data/creatures';
import { CAMPS, CAMP_PLACEMENTS, PLAYER_SPAWN, RUINS_POSITION, RUINS_RADIUS, WORLD_HALF } from '../data/camps';

/** Quantas de cada espécie `createWildCreatures` posiciona. */
export const WILD_SPAWN_COUNTS: Record<string, number> = {
  rabbit: 6,
  deer: 8,
  boar: 8,
  wolf: 4,
  wolf_alpha: 3,
  bear: 3,
};

/** Total de criaturas selvagens geradas (soma de `WILD_SPAWN_COUNTS`). */
export const WILD_CREATURE_COUNT: number = Object.values(WILD_SPAWN_COUNTS).reduce((a, b) => a + b, 0);

/** Nenhuma criatura selvagem nasce a menos disto do nascedouro. */
export const WILD_SPAWN_SAFE_RADIUS = 12;
/** Folga além do raio de cada acampamento. */
export const WILD_CAMP_MARGIN = 5;
export const WILD_MIN_SPACING = 5;
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
  const limit = WORLD_HALF - 3;
  if (Math.abs(p.x) > limit || Math.abs(p.z) > limit) return false;
  if (dist(p, PLAYER_SPAWN) < WILD_SPAWN_SAFE_RADIUS) return false;
  if (dist(p, RUINS_POSITION) < RUINS_RADIUS + 2) return false;
  for (const placement of CAMP_PLACEMENTS) {
    const def = CAMPS[placement.defId];
    if (!def) continue;
    if (dist(p, placement.position) < def.radius + WILD_CAMP_MARGIN) return false;
  }
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
        hp: def.maxHp,
        maxHp: def.maxHp,
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
