import type {
  AutoIntent, AutoMode, AutoSnapshot, InventoryState, Objective, ObjectiveKind,
  ObjectiveQueueState, Position,
} from '../types';
import { ITEMS } from '../data/items';
import { getDistance } from './combatSystem';

// ---------------------------------------------------------------------------
// Limiares do piloto automático (expostos para a UI e para os testes)
// ---------------------------------------------------------------------------

/** Abaixo desta fração da vida máxima o piloto cura ou recua. */
export const RETREAT_HP_RATIO = 0.35;
/** Perseguidor dentro deste raio vira alvo imediato, antes da fila. */
export const SELF_DEFENSE_RADIUS = 7;
/** Alcance usado para decidir atacar em vez de andar (a loja exige <= 4). */
export const ATTACK_RANGE = 3.2;
/** Alcance usado para decidir coletar em vez de andar (a loja exige <= 4). */
export const GATHER_RANGE = 3.2;
/** Raio de chegada de um objetivo `travel`. */
export const ARRIVAL_RADIUS = 2.5;
/** Raio padrão de uma área de caça. */
export const HUNT_AREA_RADIUS = 14;

/** O que `tickObjectives` precisa ler. `AutoSnapshot` satisfaz este formato. */
export type ObjectiveWorld = {
  playerPosition: Position;
  creatures: { id: string; behavior: string; hp: number }[];
  camps: { id: string; cleared: boolean; creatureIds: string[] }[];
  resources: { id: string; depleted: boolean }[];
};

export type ObjectiveTickResult = {
  queue: ObjectiveQueueState;
  completed: Objective[];
  failed: Objective[];
};

// ---------------------------------------------------------------------------
// Operações de fila
// ---------------------------------------------------------------------------

export function createQueue(): ObjectiveQueueState {
  return { items: [], mode: 'manual', repeat: false, seq: 0 };
}

export function isPending(objective: Objective): boolean {
  return objective.status === 'queued' || objective.status === 'active';
}

export function getActiveObjective(queue: ObjectiveQueueState): Objective | null {
  return queue.items.find(i => i.status === 'active') ?? null;
}

/** Já existe um objetivo não finalizado para o mesmo alvo? */
export function hasPendingObjective(
  queue: ObjectiveQueueState,
  kind: ObjectiveKind,
  targetId: string | null,
): boolean {
  return queue.items.some(i => isPending(i) && i.kind === kind && i.targetId === targetId);
}

export function addObjective(
  queue: ObjectiveQueueState,
  input: { kind: ObjectiveKind; targetId: string | null; position: Position; label: string; radius?: number },
  now: number,
): ObjectiveQueueState {
  if (hasPendingObjective(queue, input.kind, input.targetId)) return queue;

  const seq = queue.seq + 1;
  const objective: Objective = {
    id: `obj_${seq}`,
    kind: input.kind,
    targetId: input.targetId,
    position: { ...input.position },
    label: input.label,
    ...(input.radius != null ? { radius: input.radius } : {}),
    status: 'queued',
    createdAt: now,
    startedAt: null,
    completedAt: null,
    failedReason: null,
  };
  return { ...queue, seq, items: [...queue.items, objective] };
}

export function removeObjective(queue: ObjectiveQueueState, objectiveId: string): ObjectiveQueueState {
  if (!queue.items.some(i => i.id === objectiveId)) return queue;
  return { ...queue, items: queue.items.filter(i => i.id !== objectiveId) };
}

export function clearObjectives(queue: ObjectiveQueueState): ObjectiveQueueState {
  if (queue.items.length === 0) return queue;
  return { ...queue, items: [] };
}

/** Troca de lugar com o vizinho. `-1` sobe na fila, `1` desce. Nas pontas, não faz nada. */
export function reorderObjective(
  queue: ObjectiveQueueState,
  objectiveId: string,
  direction: -1 | 1,
): ObjectiveQueueState {
  const index = queue.items.findIndex(i => i.id === objectiveId);
  if (index < 0) return queue;
  const target = index + direction;
  if (target < 0 || target >= queue.items.length) return queue;

  const items = [...queue.items];
  const moved = items[index]!;
  items[index] = items[target]!;
  items[target] = moved;
  return { ...queue, items };
}

export function setMode(queue: ObjectiveQueueState, mode: AutoMode): ObjectiveQueueState {
  if (queue.mode === mode) return queue;
  return { ...queue, mode };
}

export function setRepeat(queue: ObjectiveQueueState, repeat: boolean): ObjectiveQueueState {
  if (queue.repeat === repeat) return queue;
  return { ...queue, repeat };
}

// ---------------------------------------------------------------------------
// Tick da fila
// ---------------------------------------------------------------------------

type Verdict = { status: 'done' } | { status: 'failed'; reason: string } | { status: 'running' };

const RUNNING: Verdict = { status: 'running' };

function judge(objective: Objective, world: ObjectiveWorld): Verdict {
  if (objective.kind === 'clear_camp') {
    const camp = world.camps.find(c => c.id === objective.targetId);
    if (!camp) return { status: 'failed', reason: 'Acampamento não existe mais.' };
    return camp.cleared ? { status: 'done' } : RUNNING;
  }

  if (objective.kind === 'hunt_creature') {
    const creature = world.creatures.find(c => c.id === objective.targetId);
    if (!creature) return { status: 'failed', reason: 'Criatura não existe mais.' };
    const dead = creature.behavior === 'dead' || creature.hp <= 0;
    return dead ? { status: 'done' } : RUNNING;
  }

  if (objective.kind === 'gather_node') {
    const node = world.resources.find(r => r.id === objective.targetId);
    if (!node) return { status: 'failed', reason: 'Recurso não existe mais.' };
    return node.depleted ? { status: 'done' } : RUNNING;
  }

  // Área de caça nunca termina sozinha: só some se o jogador cancelar.
  if (objective.kind === 'hunt_area') return RUNNING;

  const arrived = getDistance(world.playerPosition, objective.position) <= ARRIVAL_RADIUS;
  return arrived ? { status: 'done' } : RUNNING;
}

/**
 * Resolve o objetivo ativo e promove o próximo da fila.
 *
 * Com `repeat` ligado, um objetivo concluído volta para o fim da fila como
 * `queued` (um clone com novo id) em vez de ficar no histórico, então a fila
 * nunca cresce sem limite durante o modo ocioso. Com `repeat` desligado, o
 * registro `done`/`failed` fica na lista para a UI mostrar o que aconteceu.
 */
export function tickObjectives(
  queue: ObjectiveQueueState,
  world: ObjectiveWorld,
  now: number,
): ObjectiveTickResult {
  const completed: Objective[] = [];
  const failed: Objective[] = [];
  let seq = queue.seq;
  const items: Objective[] = [];
  const requeued: Objective[] = [];

  for (const objective of queue.items) {
    if (objective.status !== 'active') {
      items.push(objective);
      continue;
    }

    const verdict = judge(objective, world);
    if (verdict.status === 'running') {
      items.push(objective);
      continue;
    }

    if (verdict.status === 'done') {
      const done: Objective = { ...objective, status: 'done', completedAt: now };
      completed.push(done);
      if (queue.repeat) {
        seq += 1;
        requeued.push({
          ...objective,
          id: `obj_${seq}`,
          status: 'queued',
          createdAt: now,
          startedAt: null,
          completedAt: null,
          failedReason: null,
        });
      } else {
        items.push(done);
      }
      continue;
    }

    const lost: Objective = { ...objective, status: 'failed', failedReason: verdict.reason, completedAt: now };
    failed.push(lost);
    items.push(lost);
  }

  let next = [...items, ...requeued];

  if (!next.some(i => i.status === 'active')) {
    const index = next.findIndex(i => i.status === 'queued');
    if (index >= 0) {
      next = [...next];
      next[index] = { ...next[index]!, status: 'active', startedAt: now };
    }
  }

  const changed = completed.length > 0 || failed.length > 0 || seq !== queue.seq
    || next.length !== queue.items.length
    || next.some((item, i) => item !== queue.items[i]);

  return {
    queue: changed ? { ...queue, seq, items: next } : queue,
    completed,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Cura disponível na hotbar
// ---------------------------------------------------------------------------

/** Primeiro índice da hotbar com um consumível de cura em estoque, ou null. */
export function findHealHotbarIndex(inventory: InventoryState): number | null {
  for (let i = 0; i < inventory.hotbar.slots.length; i++) {
    const invIndex = inventory.hotbar.slots[i];
    if (invIndex == null) continue;
    const slot = inventory.slots[invIndex];
    if (!slot?.itemId || slot.quantity <= 0) continue;
    const item = ITEMS[slot.itemId];
    if (item?.usable && (item.healAmount ?? 0) > 0) return i;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Decisão do piloto automático
// ---------------------------------------------------------------------------

function isCreatureAlive(creature: { behavior: string; hp: number }): boolean {
  return creature.behavior !== 'dead' && creature.behavior !== 'respawning' && creature.hp > 0;
}

function nearestThreat(snapshot: AutoSnapshot): AutoSnapshot['creatures'][number] | null {
  let best: AutoSnapshot['creatures'][number] | null = null;
  let bestDist = Infinity;
  for (const creature of snapshot.creatures) {
    if (!isCreatureAlive(creature)) continue;
    if (creature.behavior !== 'chase' && creature.behavior !== 'attack') continue;
    const dist = getDistance(snapshot.playerPosition, creature.position);
    if (dist > SELF_DEFENSE_RADIUS) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = creature;
    }
  }
  return best;
}

/** Bicho vivo mais próximo dentro de `radius` (qualquer espécie) — caça ociosa. */
function nearestCreatureWithin(snapshot: AutoSnapshot, radius: number): AutoSnapshot['creatures'][number] | null {
  let best: AutoSnapshot['creatures'][number] | null = null;
  let bestDist = Infinity;
  for (const creature of snapshot.creatures) {
    if (!isCreatureAlive(creature)) continue;
    const dist = getDistance(snapshot.playerPosition, creature.position);
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      best = creature;
    }
  }
  return best;
}

function engage(
  snapshot: AutoSnapshot,
  creature: { id: string; position: Position },
  label: string,
): AutoIntent {
  // Com arma de longe, o alcance vem da arma: o piloto atira de longe em vez
  // de colar no bicho. Melee usa ATTACK_RANGE.
  const range = snapshot.attackRange ?? ATTACK_RANGE;
  if (getDistance(snapshot.playerPosition, creature.position) <= range) {
    return { kind: 'attack', creatureId: creature.id, to: { ...creature.position } };
  }
  return { kind: 'move', to: { ...creature.position }, reason: label };
}

/**
 * Prioridade do piloto automático, nesta ordem:
 *   1. jogador morto               -> `idle`
 *   2. vida < RETREAT_HP_RATIO, há cura na hotbar e `autoPotion` ligado -> `heal`
 *   3. vida < RETREAT_HP_RATIO sem cura (ou com `autoPotion` desligado) -> `retreat` para `homePosition`
 *   4. inimigo já perseguindo dentro de SELF_DEFENSE_RADIUS -> `attack` (defesa
 *      própria vem ANTES da fila: não dá para executar objetivo levando pancada)
 *   5. objetivo ativo: `move` até entrar no alcance, então `attack`/`gather`
 *   6. sem objetivo ativo          -> `idle`
 *
 * Determinística: sem `Math.random()` e sem `Date.now()`.
 */
export function decideIntent(snapshot: AutoSnapshot, now: number): AutoIntent {
  void now;

  // 1
  if (snapshot.playerDead) return { kind: 'idle', reason: 'Você está derrotado.' };

  // 2 e 3
  const lowHp = snapshot.playerHp <= snapshot.playerMaxHp * RETREAT_HP_RATIO;
  const autoPotion = snapshot.autoPotion ?? true;
  if (lowHp) {
    if (autoPotion && snapshot.healSlot != null) return { kind: 'heal', hotbarIndex: snapshot.healSlot };
    return {
      kind: 'retreat',
      to: { ...snapshot.homePosition },
      reason: autoPotion ? 'Vida baixa e sem cura: recuando.' : 'Vida baixa e poção automática desligada: recuando.',
    };
  }

  // 4
  const threat = nearestThreat(snapshot);
  if (threat) return { kind: 'attack', creatureId: threat.id, to: { ...threat.position } };

  // 5
  const active = getActiveObjective(snapshot.objectives);
  if (!active) {
    // 6. Ocioso: caça o bicho vivo mais próximo. Com arma de longe, o raio de
    // caça chega ao alcance da arma (engaja de longe em vez de correr pra cima).
    const huntBase = snapshot.autoHuntRadius ?? 0;
    if (huntBase > 0) {
      const huntRadius = Math.max(huntBase, snapshot.attackRange ?? 0);
      const prey = nearestCreatureWithin(snapshot, huntRadius);
      if (prey) return engage(snapshot, prey, 'Caçando por perto');
    }
    return { kind: 'idle', reason: 'Nenhum objetivo ativo.' };
  }

  if (active.kind === 'clear_camp') {
    const camp = snapshot.camps.find(c => c.id === active.targetId);
    if (!camp) return { kind: 'idle', reason: 'Acampamento indisponível.' };
    const ids = new Set(camp.creatureIds);
    let target: AutoSnapshot['creatures'][number] | null = null;
    let bestDist = Infinity;
    for (const creature of snapshot.creatures) {
      if (!ids.has(creature.id) || !isCreatureAlive(creature)) continue;
      const dist = getDistance(snapshot.playerPosition, creature.position);
      if (dist < bestDist) {
        bestDist = dist;
        target = creature;
      }
    }
    if (!target) return { kind: 'idle', reason: `${active.label}: nada vivo por aqui.` };
    return engage(snapshot, target, active.label);
  }

  if (active.kind === 'hunt_creature') {
    const creature = snapshot.creatures.find(c => c.id === active.targetId);
    if (!creature || !isCreatureAlive(creature)) {
      return { kind: 'idle', reason: 'Alvo indisponível.' };
    }
    return engage(snapshot, creature, active.label);
  }

  if (active.kind === 'hunt_area') {
    const radius = active.radius ?? HUNT_AREA_RADIUS;
    let target: AutoSnapshot['creatures'][number] | null = null;
    let bestDist = Infinity;
    for (const creature of snapshot.creatures) {
      if (!isCreatureAlive(creature)) continue;
      if (getDistance(active.position, creature.position) > radius) continue;
      const dist = getDistance(snapshot.playerPosition, creature.position);
      if (dist < bestDist) {
        bestDist = dist;
        target = creature;
      }
    }
    if (target) return engage(snapshot, target, active.label);
    // Sem nada vivo na área: volta ao centro e espera a fauna renascer.
    if (getDistance(snapshot.playerPosition, active.position) > ARRIVAL_RADIUS) {
      return { kind: 'move', to: { ...active.position }, reason: active.label };
    }
    return { kind: 'idle', reason: `${active.label}: aguardando criaturas.` };
  }

  if (active.kind === 'gather_node') {
    const node = snapshot.resources.find(r => r.id === active.targetId);
    if (!node || node.depleted) return { kind: 'idle', reason: 'Recurso indisponível.' };
    if (getDistance(snapshot.playerPosition, node.position) <= GATHER_RANGE) {
      return { kind: 'gather', nodeId: node.id, to: { ...node.position } };
    }
    return { kind: 'move', to: { ...node.position }, reason: active.label };
  }

  if (getDistance(snapshot.playerPosition, active.position) > ARRIVAL_RADIUS) {
    return { kind: 'move', to: { ...active.position }, reason: active.label };
  }
  // 6
  return { kind: 'idle', reason: `${active.label}: chegou ao destino.` };
}
