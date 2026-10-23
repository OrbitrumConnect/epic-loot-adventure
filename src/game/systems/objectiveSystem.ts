import type {
  AutoIntent, AutoMode, AutoSnapshot, InventoryState, Objective, ObjectiveKind,
  ObjectiveQueueState, Position,
} from '../types';
import { ITEMS } from '../data/items';
import { getDistance } from './combatSystem';
import { pickWeaponFor, type AutoWeapon } from './weaponChoiceSystem';

// ---------------------------------------------------------------------------
// Limiares do piloto automático (expostos para a UI e para os testes)
// ---------------------------------------------------------------------------

/** Abaixo desta fração da vida máxima o piloto cura ou recua. */
export const RETREAT_HP_RATIO = 0.35;
/** Perseguidor dentro deste raio vira alvo imediato, antes da fila. */
export const SELF_DEFENSE_RADIUS = 10;
/** Alcance usado para decidir atacar em vez de andar (a loja exige <= 4). */
export const ATTACK_RANGE = 3.2;
/** Alcance usado para decidir coletar em vez de andar (a loja exige <= 4). */
export const GATHER_RANGE = 3.2;
/** Raio de chegada de um objetivo `travel`. */
export const ARRIVAL_RADIUS = 2.5;
/** Raio padrão de uma área de caça. */
export const HUNT_AREA_RADIUS = 14;
/** Regra do Pedro: o piloto só larga o farm pra lutar se um INIMIGO chegar
 *  pertinho (~10m). Bate nele e VOLTA a farmar. Sem sair caçando longe. */
export const AUTO_ENGAGE_RADIUS = 10;

/** DURANTE A ONDA: o piloto defende a base atacando o hostil mais próximo até
 *  este raio (pedido do Pedro: ~35m, foca o mais perto e NÃO persegue além). */
export const BASE_DEFENSE_RADIUS = 35;

/** Caça ociosa: sem objetivo e sem recurso válido, persegue o hostil de MENOR
 *  nível dentro deste raio (bem maior que AUTO_ENGAGE_RADIUS pra não travar
 *  parado dentro da zona segura quando os inimigos ficam na borda). */
export const IDLE_HUNT_RADIUS = 45;

/** Farm ocioso: o piloto só vai até um recurso dentro deste raio. Sem ele, o
 *  recurso mais próximo (de qualquer lugar do mapa) arrastava o piloto pra longe
 *  e matava a caça. Menor que IDLE_HUNT_RADIUS de propósito: perto farma, longe
 *  caça o que está por perto em vez de atravessar o mundo atrás de um nó. */
export const FARM_RADIUS = 30;

/** Janela (ms) em que o jogador conta como "sob ataque" depois de levar dano.
 *  Dentro dela, combate tem prioridade sobre farm. */
export const RECENT_DAMAGE_WINDOW_MS = 6000;
/** Tomou dano há pouco → o piloto revida no hostil vivo mais próximo até este
 *  raio, ANTES de farmar, mesmo que o bicho não esteja em `chase`/`attack`. */
export const AGGRO_RESPONSE_RADIUS = 20;

/** Histerese do raio de combate: entra num raio R, só desiste quando o alvo
 *  passa de R * este fator. Evita o liga-desliga de combate na borda do raio. */
export const COMBAT_EXIT_FACTOR = 1.4;
/** Alvo pegajoso: o piloto só troca o alvo que já enfrenta por um novo se o novo
 *  estiver a no máximo esta fração da distância do atual (= 25% mais perto). */
export const TARGET_SWITCH_IMPROVEMENT = 0.75;
/** Banda morta de `engage`: uma vez atacando, continua atacando até o alvo
 *  passar do alcance * este fator (senão `attack`/`move` alternavam a cada tique
 *  quando o bicho oscilava na borda do alcance). */
export const ENGAGE_BAND_FACTOR = 1.25;

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

/** Nível da criatura no snapshot. Ausente = 1 (retrocompatível). */
function creatureLevelOf(creature: { level?: number }): number {
  return creature.level ?? 1;
}

/**
 * Alvo da caça AUTÔNOMA: entre os vivos dentro de `radius`, o de MENOR nível;
 * empate desempata pela MENOR distância. Engaja QUALQUER criatura hostil,
 * independentemente do nível dela (não há mais gate de "forte demais").
 *   - `hostileOnly`: ignora pacíficos (cervo/coelho).
 */
function weakestTargetWithin(
  snapshot: AutoSnapshot,
  radius: number,
  hostileOnly: boolean,
): AutoSnapshot['creatures'][number] | null {
  let best: AutoSnapshot['creatures'][number] | null = null;
  let bestLevel = Infinity;
  let bestDist = Infinity;
  for (const creature of snapshot.creatures) {
    if (!isCreatureAlive(creature)) continue;
    if (hostileOnly && creature.hostile === false) continue;
    const dist = getDistance(snapshot.playerPosition, creature.position);
    if (dist > radius) continue;
    const level = creatureLevelOf(creature);
    if (level < bestLevel || (level === bestLevel && dist < bestDist)) {
      bestLevel = level;
      bestDist = dist;
      best = creature;
    }
  }
  return best;
}

/** Entre os ids vivos, o de MENOR nível; empate pela MENOR distância. Obedece a
 *  ordem do jogador (NÃO filtra forte demais) — usado em clear_camp/hunt_area. */
function weakestAmong(
  snapshot: AutoSnapshot,
  eligible: (creature: AutoSnapshot['creatures'][number]) => boolean,
): AutoSnapshot['creatures'][number] | null {
  let best: AutoSnapshot['creatures'][number] | null = null;
  let bestLevel = Infinity;
  let bestDist = Infinity;
  for (const creature of snapshot.creatures) {
    if (!isCreatureAlive(creature) || !eligible(creature)) continue;
    const dist = getDistance(snapshot.playerPosition, creature.position);
    const level = creatureLevelOf(creature);
    if (level < bestLevel || (level === bestLevel && dist < bestDist)) {
      bestLevel = level;
      bestDist = dist;
      best = creature;
    }
  }
  return best;
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

/** Inimigo (hostil) vivo mais próximo dentro de `radius` — pra DEFESA (ignora pacífico). */
function nearestHostileWithin(snapshot: AutoSnapshot, radius: number): AutoSnapshot['creatures'][number] | null {
  let best: AutoSnapshot['creatures'][number] | null = null;
  let bestDist = Infinity;
  for (const creature of snapshot.creatures) {
    if (!isCreatureAlive(creature)) continue;
    if (creature.hostile === false) continue; // pacífico (cervo/coelho) não defende
    const dist = getDistance(snapshot.playerPosition, creature.position);
    if (dist <= radius && dist < bestDist) {
      bestDist = dist;
      best = creature;
    }
  }
  return best;
}

/** Recurso vivo (não esgotado) mais próximo do jogador — pro farm automático.
 *  Só considera nós dentro de `radius` (default FARM_RADIUS): farm não pode
 *  arrastar o piloto pelo mapa inteiro e matar a caça. */
function nearestNode(
  snapshot: AutoSnapshot,
  radius: number = FARM_RADIUS,
): AutoSnapshot['resources'][number] | null {
  let best: AutoSnapshot['resources'][number] | null = null;
  let bestDist = Infinity;
  for (const node of snapshot.resources) {
    if (node.depleted || node.canCollect === false) continue; // não cabe na bolsa / sem ferramenta
    const dist = getDistance(snapshot.playerPosition, node.position);
    if (dist > radius) continue;
    if (dist < bestDist) {
      bestDist = dist;
      best = node;
    }
  }
  return best;
}

/**
 * Alcance de ataque COERENTE com a arma que o piloto vai realmente usar contra
 * um alvo a `dist` metros — não o máximo da hotbar. `pickWeaponFor` (mesma fonte
 * do executor) decide a arma, respeitando o `pilotWeaponStyle`; o alcance dela é
 * o que separa "atacar daqui" de "andar". Sem `weapons` (snapshots de teste
 * antigos), cai no `attackRange`/`ATTACK_RANGE` de antes.
 */
function reachFor(snapshot: AutoSnapshot, dist: number): number {
  const weapons = snapshot.weapons as AutoWeapon[] | undefined;
  if (weapons && weapons.length > 0) {
    const pick = pickWeaponFor(dist, weapons, snapshot.pilotWeaponStyle ?? 'auto');
    if (pick) return pick.range;
  }
  return snapshot.attackRange ?? ATTACK_RANGE;
}

function engage(
  snapshot: AutoSnapshot,
  creature: { id: string; position: Position },
  label: string,
): AutoIntent {
  const dist = getDistance(snapshot.playerPosition, creature.position);
  const range = reachFor(snapshot, dist);
  // Banda morta: se o tique anterior já atacava ESTE alvo, segura o ataque até
  // ele passar de `range * ENGAGE_BAND_FACTOR`. Sem isso `attack`/`move`
  // alternavam a cada tique quando o bicho oscilava na borda do alcance.
  const prev = snapshot.previousIntent;
  const wasAttacking = prev?.kind === 'attack' && prev.creatureId === creature.id;
  const effectiveRange = wasAttacking ? range * ENGAGE_BAND_FACTOR : range;
  if (dist <= effectiveRange) {
    return { kind: 'attack', creatureId: creature.id, to: { ...creature.position } };
  }
  return { kind: 'move', to: { ...creature.position }, reason: label };
}

/**
 * Alvo pegajoso: dá preferência ao alvo que o piloto JÁ enfrentava no tique
 * anterior (via `previousIntent.kind === 'attack'`), pra não ficar trocando de
 * presa quando duas estão quase à mesma distância.
 *   - solta o alvo antigo se ele morreu ou saiu de `exitRadius` (= raio de
 *     entrada * COMBAT_EXIT_FACTOR);
 *   - troca pelo candidato novo só se ele estiver >= 25% mais perto
 *     (TARGET_SWITCH_IMPROVEMENT);
 *   - senão, mantém o antigo (mesmo que o seletor tenha achado outro mais perto
 *     por uma margem pequena).
 * Sem `previousIntent` de ataque, devolve o candidato sem mexer.
 */
function stickTarget(
  snapshot: AutoSnapshot,
  candidate: AutoSnapshot['creatures'][number] | null,
  exitRadius: number,
): AutoSnapshot['creatures'][number] | null {
  const prev = snapshot.previousIntent;
  const prevId = prev?.kind === 'attack' ? prev.creatureId : null;
  if (prevId == null) return candidate;
  const prevCreature = snapshot.creatures.find(c => c.id === prevId);
  if (!prevCreature || !isCreatureAlive(prevCreature)) return candidate;
  const prevDist = getDistance(snapshot.playerPosition, prevCreature.position);
  if (prevDist > exitRadius) return candidate; // saiu da banda de combate: solta.
  if (!candidate || candidate.id === prevCreature.id) return prevCreature;
  const candDist = getDistance(snapshot.playerPosition, candidate.position);
  // O novo só vence se for bem mais perto que o antigo.
  if (candDist <= prevDist * TARGET_SWITCH_IMPROVEMENT) return candidate;
  return prevCreature;
}

/**
 * Prioridade do piloto automático, nesta ordem:
 *   1. jogador morto               -> `idle`
 *   2. vida < RETREAT_HP_RATIO, há cura na hotbar e `autoPotion` ligado -> `heal`
 *   3. vida < RETREAT_HP_RATIO sem cura (ou com `autoPotion` desligado) -> `retreat` para `homePosition`
 *   4. inimigo já perseguindo dentro de SELF_DEFENSE_RADIUS -> `attack` (defesa
 *      própria vem ANTES da fila), SEJA QUAL FOR o nível do perseguidor.
 *   5. objetivo ativo: `move` até entrar no alcance, então `attack`/`gather`
 *      (ordem do jogador: menor nível primeiro)
 *   6. sem objetivo ativo -> loop idle (defesa/farm/caça/bolsa cheia/idle)
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

  const active = getActiveObjective(snapshot.objectives);

  // 4. AUTODEFESA — perseguidor dentro de SELF_DEFENSE_RADIUS vem ANTES da fila.
  // Ataca QUALQUER perseguidor hostil, independentemente do nível dele.
  const threat = nearestThreat(snapshot);
  if (threat) {
    return { kind: 'attack', creatureId: threat.id, to: { ...threat.position } };
  }

  // 4b. DEFESA DE BASE — durante a ONDA (cerco), prioriza o hostil mais próximo
  // até BASE_DEFENSE_RADIUS (35m) ACIMA da fila: na horda, defender vem antes de
  // farmar. Foca o mais perto e não persegue nada além de 35m (pedido do Pedro).
  if (snapshot.baseUnderSiege) {
    const foe = nearestHostileWithin(snapshot, BASE_DEFENSE_RADIUS);
    if (foe) return engage(snapshot, foe, 'Defendendo a base');
  }

  // 4c. SOB ATAQUE — se o jogador levou dano há menos de RECENT_DAMAGE_WINDOW_MS
  // e há hostil vivo dentro de AGGRO_RESPONSE_RADIUS, REVIDA antes de farmar,
  // independe do `behavior` e do NÍVEL do bicho.
  const dmgAt = snapshot.playerLastDamagedAt;
  if (dmgAt != null && now - dmgAt <= RECENT_DAMAGE_WINDOW_MS) {
    const aggressor = nearestHostileWithin(snapshot, AGGRO_RESPONSE_RADIUS);
    if (aggressor) {
      const sticky = stickTarget(snapshot, aggressor, AGGRO_RESPONSE_RADIUS * COMBAT_EXIT_FACTOR);
      return engage(snapshot, sticky ?? aggressor, 'Revidando o ataque');
    }
  }

  // 5
  if (!active) {
    // Prioridade do loop OCIOSO sem fila (nesta ordem):
    //   1. defender: hostil dentro de AUTO_ENGAGE_RADIUS (qualquer nível);
    //   2. farmar: nó colhível mais próximo, se a bolsa cabe;
    //   3. caçar: hostil de MENOR nível dentro de IDLE_HUNT_RADIUS (qualquer nível);
    //   4. caçar pacífico, se o jogador ligou o raio de caça;
    //   5. bolsa cheia → recuar pra base;
    //   6. idle.

    // RAIO DO JOGADOR (slider, Pedro 22/10): limita TUDO no idle. Escolhe alvo até o maior entre
    // o raio e o alcance da arma (com 5 m e arma de longe ele ATIRA de onde está, sem andar além
    // dos 5 m). Sem slider (testes/antigo) = os raios de sempre. Revide e defesa da base na horda
    // (acima) não mudam.
    const playerRadius = snapshot.autoHuntRadius ?? IDLE_HUNT_RADIUS;
    const reachRadius = Math.max(playerRadius, snapshot.attackRange ?? 0);
    const defendRadius = Math.min(AUTO_ENGAGE_RADIUS, reachRadius);
    const huntRadius = Math.min(IDLE_HUNT_RADIUS, reachRadius);

    // 1. DEFESA: inimigo coladinho → ataca. SÓ hostil.
    const foe = weakestTargetWithin(snapshot, defendRadius, true);
    const stickyFoe = stickTarget(snapshot, foe, defendRadius * COMBAT_EXIT_FACTOR);
    if (stickyFoe) return engage(snapshot, stickyFoe, 'Defendendo a base');

    // 2. FARM: coleta o nó mais próximo (alcance da própria definição do nó).
    const node = nearestNode(snapshot, Math.min(FARM_RADIUS, playerRadius));
    if (node && snapshot.gatherCapacity !== false) {
      const reach = node.range ?? GATHER_RANGE;
      if (getDistance(snapshot.playerPosition, node.position) <= reach) {
        return { kind: 'gather', nodeId: node.id, to: { ...node.position } };
      }
      return { kind: 'move', to: { ...node.position }, reason: 'Farmando recurso' };
    }

    // 3. CAÇA AUTÔNOMA: hostil de menor nível até IDLE_HUNT_RADIUS. Engaja
    // qualquer criatura hostil, por mais forte que seja.
    const prey = weakestTargetWithin(snapshot, huntRadius, true);
    const stickyPrey = stickTarget(snapshot, prey, huntRadius * COMBAT_EXIT_FACTOR);
    if (stickyPrey) return engage(snapshot, stickyPrey, 'Caçando por perto');

    // 4. CAÇA PACÍFICA (comida) só se o jogador ligou o raio de caça.
    // Pacífico (comida) segue até 35 m no máximo, como antes do slider ir a 45.
    const huntBase = snapshot.autoHuntRadius === undefined ? 0 : Math.min(snapshot.autoHuntRadius, 35);
    if (huntBase > 0) {
      const quarry = weakestTargetWithin(snapshot, Math.max(huntBase, snapshot.attackRange ?? 0), false);
      if (quarry) return engage(snapshot, quarry, 'Caçando por perto');
    }

    // 5. Bolsa cheia e nada a fazer → FICA onde está (Pedro, 22/10). Antes recuava pro
    // `homePosition` — que é o nascedouro da zona segura, não a base dele — e, como caçar tem
    // prioridade, ficava indo e voltando (vê bicho → caça → lembra da bolsa → volta...). Depósito
    // automático NÃO: a casa de pedra/metal paga com a madeira/pedra da MOCHILA.
    if (snapshot.gatherCapacity === false) {
      return { kind: 'idle', reason: 'Bolsa cheia: sem espaço pra coletar.' };
    }

    // 6
    return { kind: 'idle', reason: 'Nenhum objetivo ativo.' };
  }

  if (active.kind === 'clear_camp') {
    const camp = snapshot.camps.find(c => c.id === active.targetId);
    if (!camp) return { kind: 'idle', reason: 'Acampamento indisponível.' };
    const ids = new Set(camp.creatureIds);
    // Ordem do jogador: NÃO filtra forte demais; só prioriza o de menor nível.
    const target = weakestAmong(snapshot, c => ids.has(c.id));
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
    // Ordem do jogador: menor nível primeiro (empate pela menor distância).
    const target = weakestAmong(
      snapshot,
      c => getDistance(active.position, c.position) <= radius,
    );
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
    const reach = node.range ?? GATHER_RANGE;
    if (getDistance(snapshot.playerPosition, node.position) <= reach) {
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
