import type { CampDefinition, CampState, CreatureState, Position } from '../types';
import { CAMPS, CAMP_PLACEMENTS, WORLD_HALF, type CampPlacement } from '../data/camps';
import { CREATURES } from '../data/creatures';
import { getDistance } from './combatSystem';

/** Distância extra além do raio do acampamento em que o jogador já o enxerga. */
export const CAMP_SIGHT_MARGIN = 14;

export type CampWorld = {
  camps: CampState[];
  creatures: CreatureState[];
};

export type CampTickResult = CampWorld & {
  /** Acampamentos que acabaram de ficar limpos neste tick. A recompensa sai daqui, uma vez. */
  newlyCleared: CampState[];
  /** Acampamentos que repopularam neste tick. */
  respawned: CampState[];
};

export type CampDiscoveryResult = {
  camps: CampState[];
  newlyDiscovered: CampState[];
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampToWorld(value: number): number {
  return Math.min(WORLD_HALF, Math.max(-WORLD_HALF, value));
}

/** Posto de guarda em coordenadas do mundo, preso dentro do mapa. */
export function getSpawnPosition(campPosition: Position, offset: Position): Position {
  return {
    x: clampToWorld(campPosition.x + offset.x),
    z: clampToWorld(campPosition.z + offset.z),
  };
}

/** Id determinístico: mesmo acampamento e mesmo índice de spawn sempre dão o mesmo id. */
export function getSpawnCreatureId(campId: string, spawnIndex: number): string {
  return `${campId}_e${spawnIndex}`;
}

/** Vivo = ainda conta para o acampamento não estar limpo. */
export function isAlive(creature: CreatureState): boolean {
  return creature.behavior !== 'dead' && creature.behavior !== 'respawning' && creature.hp > 0;
}

function buildCreature(
  id: string,
  def: CampDefinition,
  spawnIndex: number,
  campPosition: Position,
): CreatureState | null {
  const spawn = def.spawns[spawnIndex];
  if (!spawn) return null;
  const species = CREATURES[spawn.speciesId];
  if (!species) return null;

  return {
    id,
    speciesId: species.id,
    name: species.name,
    hp: species.maxHp,
    maxHp: species.maxHp,
    attackPower: species.attackPower,
    armor: species.armor,
    attackCooldown: species.attackCooldown,
    lastAttackAt: 0,
    position: getSpawnPosition(campPosition, spawn.offset),
    behavior: spawn.guard ? 'patrol' : 'idle',
    lootTable: [],
    respawnAt: null,
  };
}

// ---------------------------------------------------------------------------
// Criação
// ---------------------------------------------------------------------------

export function createCamps(
  now: number,
  placements: CampPlacement[] = CAMP_PLACEMENTS,
): CampWorld {
  const camps: CampState[] = [];
  const creatures: CreatureState[] = [];

  for (const placement of placements) {
    const def = CAMPS[placement.defId];
    if (!def) continue;

    const creatureIds: string[] = [];
    def.spawns.forEach((_spawn, index) => {
      const id = getSpawnCreatureId(placement.id, index);
      const creature = buildCreature(id, def, index, placement.position);
      if (!creature) return;
      creatureIds.push(id);
      creatures.push(creature);
    });

    camps.push({
      id: placement.id,
      defId: def.id,
      name: def.name,
      tier: def.tier,
      position: { ...placement.position },
      creatureIds,
      cleared: false,
      clearedAt: null,
      respawnAt: null,
      discovered: false,
    });
  }

  // `now` entra na assinatura para manter o padrão dos sistemas puros; o estado
  // inicial não tem nenhum prazo em andamento, então nada é derivado dele.
  void now;
  return { camps, creatures };
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function getCampCreatures(camp: CampState, creatures: CreatureState[]): CreatureState[] {
  const ids = new Set(camp.creatureIds);
  return creatures.filter(c => ids.has(c.id));
}

export function getAliveCount(camp: CampState, creatures: CreatureState[]): number {
  return getCampCreatures(camp, creatures).filter(isAlive).length;
}

/** Limpo = nenhuma criatura viva do acampamento. */
export function isCampCleared(camp: CampState, creatures: CreatureState[]): boolean {
  return getAliveCount(camp, creatures) === 0;
}

export function getCamp(camps: CampState[], campId: string): CampState | null {
  return camps.find(c => c.id === campId) ?? null;
}

export function getNearestLivingEnemy(
  camp: CampState,
  creatures: CreatureState[],
  from: Position,
): CreatureState | null {
  let best: CreatureState | null = null;
  let bestDist = Infinity;
  for (const creature of getCampCreatures(camp, creatures)) {
    if (!isAlive(creature)) continue;
    const dist = getDistance(from, creature.position);
    if (dist < bestDist) {
      bestDist = dist;
      best = creature;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Descoberta
// ---------------------------------------------------------------------------

export function discoverCamps(camps: CampState[], playerPosition: Position): CampDiscoveryResult {
  const newlyDiscovered: CampState[] = [];
  let changed = false;

  const next = camps.map(camp => {
    if (camp.discovered) return camp;
    const def = CAMPS[camp.defId];
    const sight = (def?.radius ?? 0) + CAMP_SIGHT_MARGIN;
    if (getDistance(playerPosition, camp.position) > sight) return camp;
    changed = true;
    const updated: CampState = { ...camp, discovered: true };
    newlyDiscovered.push(updated);
    return updated;
  });

  return changed ? { camps: next, newlyDiscovered } : { camps, newlyDiscovered: [] };
}

// ---------------------------------------------------------------------------
// Tick: marca limpeza e repopula quando o prazo vence
// ---------------------------------------------------------------------------

/**
 * Avança os acampamentos até `now`.
 *
 * - O acampamento vira `cleared` no instante em que o último inimigo cai, e o
 *   `respawnAt` é agendado ali mesmo. Como a troca de `cleared` acontece uma
 *   única vez, `newlyCleared` nunca repete o mesmo acampamento: a recompensa é
 *   idempotente por construção.
 * - Quando `respawnAt` vence, as criaturas voltam aos postos com vida cheia e o
 *   acampamento volta a não estar limpo.
 */
export function tickCamps(
  camps: CampState[],
  creatures: CreatureState[],
  now: number,
): CampTickResult {
  const newlyCleared: CampState[] = [];
  const respawned: CampState[] = [];
  let nextCamps = camps;
  let nextCreatures = creatures;
  let campsChanged = false;

  const updatedCamps = camps.map(camp => {
    const def = CAMPS[camp.defId];

    if (!camp.cleared) {
      if (!isCampCleared(camp, creatures)) return camp;
      const cleared: CampState = {
        ...camp,
        cleared: true,
        clearedAt: now,
        respawnAt: now + (def?.respawnMs ?? 300_000),
      };
      campsChanged = true;
      newlyCleared.push(cleared);
      return cleared;
    }

    if (camp.respawnAt != null && now >= camp.respawnAt) {
      const restored: CampState = { ...camp, cleared: false, clearedAt: null, respawnAt: null };
      campsChanged = true;
      respawned.push(restored);
      return restored;
    }

    return camp;
  });

  if (campsChanged) nextCamps = updatedCamps;

  if (respawned.length > 0) {
    const restoreById = new Map<string, { camp: CampState; index: number }>();
    for (const camp of respawned) {
      camp.creatureIds.forEach((id, index) => restoreById.set(id, { camp, index }));
    }
    nextCreatures = creatures.map(creature => {
      const entry = restoreById.get(creature.id);
      if (!entry) return creature;
      const def = CAMPS[entry.camp.defId];
      if (!def) return creature;
      const rebuilt = buildCreature(creature.id, def, entry.index, entry.camp.position);
      return rebuilt ?? creature;
    });
  }

  return { camps: nextCamps, creatures: nextCreatures, newlyCleared, respawned };
}
