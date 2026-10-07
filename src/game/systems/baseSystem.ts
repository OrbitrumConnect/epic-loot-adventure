import type {
  BaseResourceId, BaseResources, BaseResult, BaseState, BaseUnitDefinition, BuildingId,
  EraDefinition, InventoryState, PlacedBuilding, QueueItem, ResearchEffectKind,
} from '../types';
import {
  BASE_BUILDERS, BASE_RESOURCE_IDS, BASE_RESOURCE_NAMES, BASE_TIME_SCALE, BUILDINGS, COST_GROWTH,
  DEPOSIT_ITEMS, ERAS, HALL_PLOT_INDEX, PLOT_COUNT, PRODUCTION_GROWTH, QUEUE_BASE_CAPACITY,
  QUEUE_LEVELS_PER_SLOT, STARTING_RESOURCES, STORAGE_BASE, STORAGE_GROWTH, TIME_GROWTH,
} from '../data/buildings';
import {
  EXPEDITIONS, EXPEDITION_LEVELS_PER_SLOT, EXPEDITION_LOOT_PER_TENT_LEVEL, RESEARCH_COST_GROWTH,
  RESEARCH_TIME_GROWTH, SCOUT_UNIT_ID, UNITS,
} from '../data/units';
import { addItem, canAddItem, getItemCount, removeItem } from './inventorySystem';

// ---------------------------------------------------------------------------
// Recursos
// ---------------------------------------------------------------------------

export function emptyResources(): BaseResources {
  return { wood: 0, stone: 0, food: 0, essence: 0 };
}

function mapResources(fn: (id: BaseResourceId) => number): BaseResources {
  return { wood: fn('wood'), stone: fn('stone'), food: fn('food'), essence: fn('essence') };
}

export function scaleCost(cost: BaseResources, factor: number): BaseResources {
  return mapResources(id => Math.round(cost[id] * factor));
}

export function canAfford(resources: BaseResources, cost: BaseResources): boolean {
  return BASE_RESOURCE_IDS.every(id => resources[id] >= cost[id]);
}

export function subtractResources(resources: BaseResources, cost: BaseResources): BaseResources {
  return mapResources(id => resources[id] - cost[id]);
}

export function addResources(resources: BaseResources, gain: BaseResources): BaseResources {
  return mapResources(id => resources[id] + gain[id]);
}

/** Soma `gain` respeitando o teto, sem nunca reduzir um estoque que já esteja acima dele. */
export function addResourcesCapped(resources: BaseResources, gain: BaseResources, cap: BaseResources): BaseResources {
  return mapResources(id => Math.max(resources[id], Math.min(cap[id], resources[id] + gain[id])));
}

export function getMissingText(resources: BaseResources, cost: BaseResources): string {
  const parts = BASE_RESOURCE_IDS
    .filter(id => resources[id] < cost[id])
    .map(id => `${Math.ceil(cost[id] - resources[id])} ${BASE_RESOURCE_NAMES[id].toLowerCase()}`);
  return parts.length > 0 ? `Faltam ${parts.join(', ')}.` : '';
}

// ---------------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------------

export function getEra(level: number): EraDefinition {
  const clamped = Math.max(1, level);
  return ERAS.find(e => clamped >= e.minLevel && clamped <= e.maxLevel) ?? ERAS[ERAS.length - 1]!;
}

export function getBuilding(state: BaseState, instanceId: string): PlacedBuilding | null {
  return state.buildings.find(b => b.id === instanceId) ?? null;
}

export function getBuildingAtPlot(state: BaseState, plotIndex: number): PlacedBuilding | null {
  return state.buildings.find(b => b.plotIndex === plotIndex) ?? null;
}

export function getBuildingLevel(state: BaseState, defId: BuildingId): number {
  return state.buildings.reduce((max, b) => (b.defId === defId ? Math.max(max, b.level) : max), 0);
}

export function getHallLevel(state: BaseState): number {
  return getBuildingLevel(state, 'tribe_hall');
}

export function countBuildings(state: BaseState, defId: BuildingId): number {
  return state.buildings.filter(b => b.defId === defId).length;
}

/** Soma do efeito de todas as pesquisas concluídas de um tipo. */
export function getResearchBonus(state: BaseState, kind: ResearchEffectKind): number {
  let total = 0;
  for (const unit of Object.values(UNITS)) {
    if (unit.effect?.kind !== kind) continue;
    total += unit.effect.perRank * (state.research[unit.id] ?? 0);
  }
  return total;
}

export function getStorageCapForHall(hallLevel: number): BaseResources {
  const factor = Math.pow(STORAGE_GROWTH, Math.max(1, hallLevel) - 1);
  return scaleCost(STORAGE_BASE, factor);
}

export function getStorageCap(state: BaseState): BaseResources {
  return getStorageCapForHall(getHallLevel(state));
}

export function getProductionPerMinute(defId: BuildingId, level: number): number {
  const produces = BUILDINGS[defId].produces;
  if (!produces || level < 1) return 0;
  return produces.basePerMinute * level * Math.pow(PRODUCTION_GROWTH, level - 1);
}

/** Produção total da cidade por minuto real, já com bônus de pesquisa e escala de tempo. */
export function getProductionRates(state: BaseState): BaseResources {
  const rates = emptyResources();
  const multiplier = (1 + getResearchBonus(state, 'production_pct')) / BASE_TIME_SCALE;
  for (const building of state.buildings) {
    const produces = BUILDINGS[building.defId].produces;
    if (!produces) continue;
    rates[produces.resource] += getProductionPerMinute(building.defId, building.level) * multiplier;
  }
  return rates;
}

export function getBuildersInUse(state: BaseState): number {
  return state.buildings.filter(b => b.construction?.startedAt != null).length;
}

export function getWaitingConstructions(state: BaseState): number {
  return state.buildings.filter(b => b.construction != null && b.construction.startedAt == null).length;
}

export function getTroopCount(state: BaseState): number {
  return Object.values(state.troops).reduce((sum, n) => sum + n, 0);
}

export function getScoutsAway(state: BaseState): number {
  return state.expeditions.reduce((sum, e) => sum + e.scouts, 0);
}

export function getIdleScouts(state: BaseState): number {
  return Math.max(0, (state.troops[SCOUT_UNIT_ID] ?? 0) - getScoutsAway(state));
}

/** Progresso 0..1 de um trabalho com início e fim; 0 se ainda não começou. */
export function getProgress(job: { startedAt: number | null; endsAt: number | null }, now: number): number {
  if (job.startedAt == null || job.endsAt == null) return 0;
  const total = job.endsAt - job.startedAt;
  if (total <= 0) return 1;
  return Math.min(1, Math.max(0, (now - job.startedAt) / total));
}

export function getRemainingMs(job: { endsAt: number | null; durationMs?: number }, now: number): number {
  if (job.endsAt == null) return job.durationMs ?? 0;
  return Math.max(0, job.endsAt - now);
}

// ---------------------------------------------------------------------------
// Custos e tempos de construção
// ---------------------------------------------------------------------------

/** Custo para alcançar `targetLevel` (1 = construir no terreno). */
export function getUpgradeCost(defId: BuildingId, targetLevel: number): BaseResources {
  return scaleCost(BUILDINGS[defId].baseCost, Math.pow(COST_GROWTH, targetLevel - 1));
}

export function getUpgradeDurationMs(state: BaseState, defId: BuildingId, targetLevel: number): number {
  const seconds = BUILDINGS[defId].baseBuildSeconds * Math.pow(TIME_GROWTH, targetLevel - 1);
  const reduction = Math.min(0.9, getResearchBonus(state, 'build_time_pct'));
  return Math.max(1000, Math.round(seconds * 1000 * BASE_TIME_SCALE * (1 - reduction)));
}

export function getUpgradeBlockReason(state: BaseState, instanceId: string): string | null {
  const building = getBuilding(state, instanceId);
  if (!building) return 'Construção não encontrada.';
  const def = BUILDINGS[building.defId];
  if (building.construction) return 'Já está em obras.';
  if (building.level >= def.maxLevel) return 'Nível máximo alcançado.';
  const target = building.level + 1;
  if (building.defId !== 'tribe_hall' && target > getHallLevel(state)) {
    return `Requer ${BUILDINGS.tribe_hall.name} nível ${target}.`;
  }
  const cost = getUpgradeCost(building.defId, target);
  if (!canAfford(state.resources, cost)) return getMissingText(state.resources, cost);
  return null;
}

export function getPlaceBlockReason(state: BaseState, defId: BuildingId, plotIndex: number): string | null {
  const def = BUILDINGS[defId];
  if (!Number.isInteger(plotIndex) || plotIndex < 0 || plotIndex >= PLOT_COUNT) return 'Terreno inválido.';
  if (getBuildingAtPlot(state, plotIndex)) return 'Terreno ocupado.';
  if (countBuildings(state, defId) >= def.maxInstances) {
    return def.maxInstances === 1 ? 'Já construído.' : `Limite de ${def.maxInstances} construções deste tipo.`;
  }
  if (getHallLevel(state) < def.unlockHallLevel) {
    return `Requer ${BUILDINGS.tribe_hall.name} nível ${def.unlockHallLevel}.`;
  }
  const cost = getUpgradeCost(defId, 1);
  if (!canAfford(state.resources, cost)) return getMissingText(state.resources, cost);
  return null;
}

// ---------------------------------------------------------------------------
// Estado inicial
// ---------------------------------------------------------------------------

export function createInitialBase(now: number): BaseState {
  return {
    resources: { ...STARTING_RESOURCES },
    buildings: [
      { id: 'b1', defId: 'tribe_hall', level: 1, plotIndex: HALL_PLOT_INDEX, construction: null, queue: [] },
    ],
    builders: BASE_BUILDERS,
    troops: {},
    research: {},
    expeditions: [],
    explored: 0,
    toolStash: {},
    lastTickAt: now,
    seq: 1,
  };
}

// ---------------------------------------------------------------------------
// Helpers internos
// ---------------------------------------------------------------------------

function fail(state: BaseState, message: string): BaseResult {
  return { state, ok: false, message };
}

function updateBuilding(state: BaseState, instanceId: string, fn: (b: PlacedBuilding) => PlacedBuilding): BaseState {
  return { ...state, buildings: state.buildings.map(b => (b.id === instanceId ? fn(b) : b)) };
}

/** Entrega construtores livres aos pedidos em espera, em ordem de chegada, iniciando em `at`. */
function assignBuilders(state: BaseState, at: number): BaseState {
  let free = state.builders - getBuildersInUse(state);
  if (free <= 0) return state;
  const waiting = state.buildings
    .filter(b => b.construction != null && b.construction.startedAt == null)
    .sort((a, b) => a.construction!.order - b.construction!.order);
  if (waiting.length === 0) return state;

  const starting = new Set<string>();
  for (const building of waiting) {
    if (free <= 0) break;
    starting.add(building.id);
    free -= 1;
  }
  return {
    ...state,
    buildings: state.buildings.map(b => {
      if (!starting.has(b.id) || !b.construction) return b;
      return { ...b, construction: { ...b.construction, startedAt: at, endsAt: at + b.construction.durationMs } };
    }),
  };
}

/** Garante que apenas o primeiro item da fila esteja em andamento, iniciando em `at`. */
function startQueueHead(queue: QueueItem[], at: number): QueueItem[] {
  const head = queue[0];
  if (!head || head.startedAt != null) return queue;
  return [{ ...head, startedAt: at, endsAt: at + head.durationMs }, ...queue.slice(1)];
}

function accrueProduction(state: BaseState, from: number, to: number): BaseState {
  if (to <= from) return state;
  const minutes = (to - from) / 60_000;
  const rates = getProductionRates(state);
  const gain = mapResources(id => rates[id] * minutes);
  if (BASE_RESOURCE_IDS.every(id => gain[id] === 0)) return state;
  return { ...state, resources: addResourcesCapped(state.resources, gain, getStorageCap(state)) };
}

// ---------------------------------------------------------------------------
// Construção e melhoria
// ---------------------------------------------------------------------------

function queueConstruction(state: BaseState, instanceId: string, defId: BuildingId, targetLevel: number, now: number): BaseState {
  const seq = state.seq + 1;
  const job = {
    targetLevel,
    durationMs: getUpgradeDurationMs(state, defId, targetLevel),
    order: seq,
    startedAt: null,
    endsAt: null,
  };
  const next = updateBuilding({ ...state, seq }, instanceId, b => ({ ...b, construction: job }));
  return assignBuilders(next, now);
}

export function placeBuilding(state: BaseState, defId: BuildingId, plotIndex: number, now: number): BaseResult {
  const current = tickBase(state, now);
  const reason = getPlaceBlockReason(current, defId, plotIndex);
  if (reason) return fail(current, reason);

  const seq = current.seq + 1;
  const id = `b${seq}`;
  const paid: BaseState = {
    ...current,
    seq,
    resources: subtractResources(current.resources, getUpgradeCost(defId, 1)),
    buildings: [...current.buildings, { id, defId, level: 0, plotIndex, construction: null, queue: [] }],
  };
  const next = queueConstruction(paid, id, defId, 1, now);
  const waiting = getBuilding(next, id)?.construction?.startedAt == null;
  return {
    state: next,
    ok: true,
    message: waiting
      ? `${BUILDINGS[defId].name}: aguardando construtor livre.`
      : `${BUILDINGS[defId].name}: obra iniciada.`,
  };
}

export function startUpgrade(state: BaseState, instanceId: string, now: number): BaseResult {
  const current = tickBase(state, now);
  const reason = getUpgradeBlockReason(current, instanceId);
  if (reason) return fail(current, reason);

  const building = getBuilding(current, instanceId)!;
  const target = building.level + 1;
  const paid: BaseState = {
    ...current,
    resources: subtractResources(current.resources, getUpgradeCost(building.defId, target)),
  };
  const next = queueConstruction(paid, instanceId, building.defId, target, now);
  const waiting = getBuilding(next, instanceId)?.construction?.startedAt == null;
  const name = BUILDINGS[building.defId].name;
  return {
    state: next,
    ok: true,
    message: waiting
      ? `${name}: melhoria aguardando construtor livre.`
      : `${name}: melhoria para o nível ${target} iniciada.`,
  };
}

// ---------------------------------------------------------------------------
// Filas de produção (tropas, ferramentas, pesquisas)
// ---------------------------------------------------------------------------

export function getQueueCapacityForLevel(state: BaseState, defId: BuildingId, level: number): number {
  if (!BUILDINGS[defId].queueKind || level < 1) return 0;
  return QUEUE_BASE_CAPACITY + Math.floor(level / QUEUE_LEVELS_PER_SLOT) + Math.round(getResearchBonus(state, 'queue_slots'));
}

export function getQueueCapacity(state: BaseState, building: PlacedBuilding): number {
  return getQueueCapacityForLevel(state, building.defId, building.level);
}

export function getUnitsForBuilding(defId: BuildingId): BaseUnitDefinition[] {
  return Object.values(UNITS).filter(u => u.building === defId);
}

export function getUnitCost(state: BaseState, unitId: string): BaseResources {
  const unit = UNITS[unitId];
  if (!unit) return emptyResources();
  if (unit.kind !== 'research') return { ...unit.cost };
  return scaleCost(unit.cost, Math.pow(RESEARCH_COST_GROWTH, state.research[unitId] ?? 0));
}

export function getUnitDurationMs(state: BaseState, unitId: string): number {
  const unit = UNITS[unitId];
  if (!unit) return 0;
  const growth = unit.kind === 'research' ? Math.pow(RESEARCH_TIME_GROWTH, state.research[unitId] ?? 0) : 1;
  return Math.max(1000, Math.round(unit.durationSeconds * growth * 1000 * BASE_TIME_SCALE));
}

export function getEnqueueBlockReason(state: BaseState, instanceId: string, unitId: string): string | null {
  const building = getBuilding(state, instanceId);
  const unit = UNITS[unitId];
  if (!building || !unit || unit.building !== building.defId) return 'Produção indisponível nesta construção.';
  const def = BUILDINGS[building.defId];
  if (building.level < 1) return 'Construção ainda não concluída.';
  if (building.level < unit.minBuildingLevel) return `Requer ${def.name} nível ${unit.minBuildingLevel}.`;
  if (unit.kind === 'research') {
    if ((state.research[unitId] ?? 0) >= (unit.maxRank ?? 1)) return 'Pesquisa no nível máximo.';
    if (building.queue.some(q => q.unitId === unitId)) return 'Pesquisa já está na fila.';
  }
  if (building.queue.length >= getQueueCapacity(state, building)) return 'Fila cheia.';
  const cost = getUnitCost(state, unitId);
  if (!canAfford(state.resources, cost)) return getMissingText(state.resources, cost);
  return null;
}

export function enqueueUnit(state: BaseState, instanceId: string, unitId: string, now: number): BaseResult {
  const current = tickBase(state, now);
  const reason = getEnqueueBlockReason(current, instanceId, unitId);
  if (reason) return fail(current, reason);

  const unit = UNITS[unitId]!;
  const cost = getUnitCost(current, unitId);
  const seq = current.seq + 1;
  const item: QueueItem = {
    id: `q${seq}`,
    unitId,
    durationMs: getUnitDurationMs(current, unitId),
    cost,
    startedAt: null,
    endsAt: null,
  };
  const paid: BaseState = { ...current, seq, resources: subtractResources(current.resources, cost) };
  const next = updateBuilding(paid, instanceId, b => ({ ...b, queue: startQueueHead([...b.queue, item], now) }));
  return { state: next, ok: true, message: `${unit.name} entrou na fila.` };
}

/** Cancela um item da fila devolvendo 100% do custo; o próximo item começa em `now`. */
export function cancelQueueItem(state: BaseState, instanceId: string, itemId: string, now: number): BaseResult {
  const current = tickBase(state, now);
  const building = getBuilding(current, instanceId);
  const item = building?.queue.find(q => q.id === itemId);
  if (!building || !item) return fail(current, 'Item não está mais na fila.');

  const refunded: BaseState = { ...current, resources: addResources(current.resources, item.cost) };
  const next = updateBuilding(refunded, instanceId, b => ({
    ...b,
    queue: startQueueHead(b.queue.filter(q => q.id !== itemId), now),
  }));
  return { state: next, ok: true, message: `${UNITS[item.unitId]?.name ?? 'Item'} cancelado. Recursos devolvidos.` };
}

function completeQueueItem(state: BaseState, item: QueueItem): BaseState {
  const unit = UNITS[item.unitId];
  if (!unit) return state;
  if (unit.kind === 'troop') {
    return { ...state, troops: { ...state.troops, [unit.id]: (state.troops[unit.id] ?? 0) + 1 } };
  }
  if (unit.kind === 'tool') {
    const itemId = unit.itemId ?? unit.id;
    return { ...state, toolStash: { ...state.toolStash, [itemId]: (state.toolStash[itemId] ?? 0) + 1 } };
  }
  const rank = Math.min(unit.maxRank ?? 1, (state.research[unit.id] ?? 0) + 1);
  return { ...state, research: { ...state.research, [unit.id]: rank } };
}

// ---------------------------------------------------------------------------
// Expedições
// ---------------------------------------------------------------------------

export function getMaxExpeditions(state: BaseState): number {
  const level = getBuildingLevel(state, 'scout_tent');
  if (level < 1) return 0;
  return 1 + Math.floor(level / EXPEDITION_LEVELS_PER_SLOT);
}

export function getExpeditionDurationMs(expeditionId: string): number {
  const def = EXPEDITIONS[expeditionId];
  return def ? Math.round(def.durationSeconds * 1000 * BASE_TIME_SCALE) : 0;
}

export function getExpeditionLoot(state: BaseState, expeditionId: string, scouts: number): BaseResources {
  const def = EXPEDITIONS[expeditionId];
  if (!def) return emptyResources();
  const tentLevel = Math.max(1, getBuildingLevel(state, 'scout_tent'));
  const multiplier = scouts
    * (1 + EXPEDITION_LOOT_PER_TENT_LEVEL * (tentLevel - 1))
    * (1 + getResearchBonus(state, 'expedition_loot_pct'));
  return scaleCost(def.lootPerScout, multiplier);
}

export function getExpeditionBlockReason(state: BaseState, expeditionId: string, scouts: number): string | null {
  const def = EXPEDITIONS[expeditionId];
  if (!def) return 'Expedição desconhecida.';
  const tentLevel = getBuildingLevel(state, 'scout_tent');
  if (tentLevel < 1) return `Construa a ${BUILDINGS.scout_tent.name}.`;
  if (tentLevel < def.minTentLevel) return `Requer ${BUILDINGS.scout_tent.name} nível ${def.minTentLevel}.`;
  if (state.expeditions.length >= getMaxExpeditions(state)) return 'Limite de expedições simultâneas atingido.';
  if (!Number.isInteger(scouts) || scouts < 1) return 'Escolha ao menos 1 batedor.';
  if (scouts > getIdleScouts(state)) return 'Batedores livres insuficientes.';
  return null;
}

export function sendExpedition(state: BaseState, expeditionId: string, scouts: number, now: number): BaseResult {
  const current = tickBase(state, now);
  const reason = getExpeditionBlockReason(current, expeditionId, scouts);
  if (reason) return fail(current, reason);

  const def = EXPEDITIONS[expeditionId]!;
  const seq = current.seq + 1;
  const next: BaseState = {
    ...current,
    seq,
    expeditions: [
      ...current.expeditions,
      { id: `e${seq}`, defId: expeditionId, scouts, startedAt: now, endsAt: now + getExpeditionDurationMs(expeditionId) },
    ],
  };
  return { state: next, ok: true, message: `${scouts} batedor(es) partiram: ${def.name}.` };
}

// ---------------------------------------------------------------------------
// Tick: resolve tudo o que terminou até `now`, em ordem cronológica
// ---------------------------------------------------------------------------

type BaseEvent =
  | { at: number; kind: 'construction'; buildingId: string }
  | { at: number; kind: 'queue'; buildingId: string }
  | { at: number; kind: 'expedition'; expeditionId: string };

function findNextEvent(state: BaseState): BaseEvent | null {
  let next: BaseEvent | null = null;
  const consider = (event: BaseEvent) => {
    if (!next || event.at < next.at) next = event;
  };
  for (const building of state.buildings) {
    if (building.construction?.endsAt != null) {
      consider({ at: building.construction.endsAt, kind: 'construction', buildingId: building.id });
    }
    const head = building.queue[0];
    if (head?.endsAt != null) consider({ at: head.endsAt, kind: 'queue', buildingId: building.id });
  }
  for (const expedition of state.expeditions) {
    consider({ at: expedition.endsAt, kind: 'expedition', expeditionId: expedition.id });
  }
  return next;
}

function applyEvent(state: BaseState, event: BaseEvent): BaseState {
  if (event.kind === 'construction') {
    const finished = updateBuilding(state, event.buildingId, b => ({
      ...b,
      level: b.construction ? b.construction.targetLevel : b.level,
      construction: null,
    }));
    return assignBuilders(finished, event.at);
  }

  if (event.kind === 'queue') {
    const building = getBuilding(state, event.buildingId);
    const head = building?.queue[0];
    if (!building || !head) return state;
    const completed = completeQueueItem(state, head);
    return updateBuilding(completed, event.buildingId, b => ({ ...b, queue: startQueueHead(b.queue.slice(1), event.at) }));
  }

  const expedition = state.expeditions.find(e => e.id === event.expeditionId);
  if (!expedition) return state;
  const def = EXPEDITIONS[expedition.defId];
  const loot = getExpeditionLoot(state, expedition.defId, expedition.scouts);
  return {
    ...state,
    resources: addResourcesCapped(state.resources, loot, getStorageCap(state)),
    explored: Math.min(100, state.explored + (def?.explorePerScout ?? 0) * expedition.scouts),
    expeditions: state.expeditions.filter(e => e.id !== expedition.id),
  };
}

/**
 * Avança a base até `now`. Processa os eventos (obras, filas, expedições) em ordem
 * cronológica e acumula a produção entre eles, então saltos grandes de tempo
 * (jogador offline) resolvem vários itens corretamente em uma única chamada.
 */
export function tickBase(state: BaseState, now: number): BaseState {
  if (now <= state.lastTickAt) return state;

  let current = state;
  let cursor = state.lastTickAt;
  for (let guard = 0; guard < 100_000; guard++) {
    const event = findNextEvent(current);
    if (!event || event.at > now) break;
    const at = Math.max(cursor, event.at);
    current = accrueProduction(current, cursor, at);
    current = applyEvent(current, { ...event, at });
    cursor = at;
  }
  current = accrueProduction(current, cursor, now);
  return { ...current, lastTickAt: now };
}

// ---------------------------------------------------------------------------
// Ponte com o inventário do jogador (loop Mapa -> Base e Forja -> jogador)
// ---------------------------------------------------------------------------

/** Move madeira, pedra e essência arcana da mochila para o estoque, até o limite do armazém. */
export function depositFromInventory(
  state: BaseState,
  inventory: InventoryState,
): { state: BaseState; inventory: InventoryState; moved: BaseResources } {
  const cap = getStorageCap(state);
  const moved = emptyResources();
  const resources = { ...state.resources };
  let inv = inventory;

  for (const entry of DEPOSIT_ITEMS) {
    const have = getItemCount(inv, entry.itemId);
    const free = Math.max(0, Math.floor(cap[entry.resource] - resources[entry.resource]));
    const amount = Math.min(have, free);
    if (amount <= 0) continue;
    inv = removeItem(inv, entry.itemId, amount);
    resources[entry.resource] += amount;
    moved[entry.resource] += amount;
  }

  return { state: { ...state, resources }, inventory: inv, moved };
}

/** Entrega ao jogador as ferramentas prontas que couberem na mochila; o resto fica guardado. */
export function collectTools(
  state: BaseState,
  inventory: InventoryState,
): { state: BaseState; inventory: InventoryState; moved: { itemId: string; quantity: number }[] } {
  const stash = { ...state.toolStash };
  const moved: { itemId: string; quantity: number }[] = [];
  let inv = inventory;

  for (const itemId of Object.keys(stash)) {
    let delivered = 0;
    while ((stash[itemId] ?? 0) > 0 && canAddItem(inv, itemId, 1)) {
      inv = addItem(inv, itemId, 1);
      stash[itemId] = (stash[itemId] ?? 0) - 1;
      delivered += 1;
    }
    if ((stash[itemId] ?? 0) <= 0) delete stash[itemId];
    if (delivered > 0) moved.push({ itemId, quantity: delivered });
  }

  if (moved.length === 0) return { state, inventory, moved };
  return { state: { ...state, toolStash: stash }, inventory: inv, moved };
}

export function getToolStashCount(state: BaseState): number {
  return Object.values(state.toolStash).reduce((sum, n) => sum + n, 0);
}

// ---------------------------------------------------------------------------
// Descrições para o painel (o que a construção faz em um dado nível)
// ---------------------------------------------------------------------------

export function describeBuildingLevel(state: BaseState, defId: BuildingId, level: number): string[] {
  const def = BUILDINGS[defId];
  if (level < 1) return ['Em construção.'];
  const lines: string[] = [];

  if (defId === 'tribe_hall') {
    const cap = getStorageCapForHall(level);
    lines.push(`Armazém: ${cap.wood} por recurso · ${cap.essence} essência`);
    lines.push(`Construções até o nível ${level}`);
  }
  if (def.produces) {
    const bonus = 1 + getResearchBonus(state, 'production_pct');
    const rate = (getProductionPerMinute(defId, level) * bonus) / BASE_TIME_SCALE;
    lines.push(`+${Math.round(rate)} ${BASE_RESOURCE_NAMES[def.produces.resource].toLowerCase()} por minuto`);
  }
  if (def.queueKind) {
    lines.push(`Fila com ${getQueueCapacityForLevel(state, defId, level)} vagas`);
    const unlocked = getUnitsForBuilding(defId).filter(u => u.minBuildingLevel === level).map(u => u.name);
    if (unlocked.length > 0) lines.push(`Libera: ${unlocked.join(', ')}`);
  }
  if (defId === 'scout_tent') {
    lines.push(`Expedições simultâneas: ${1 + Math.floor(level / EXPEDITION_LEVELS_PER_SLOT)}`);
    const routes = Object.values(EXPEDITIONS).filter(e => e.minTentLevel === level).map(e => e.name);
    if (routes.length > 0) lines.push(`Nova rota: ${routes.join(', ')}`);
  }
  return lines;
}
