/**
 * Rotina do piloto (camada de dados/sistema): tarefas de zona com critério de
 * término escolhido por tarefa (bolsa cheia / tempo / nº de itens), farm_area,
 * ponto de viagem arbitrário e construtores novos do store. Tudo puro onde dá.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { AutoSnapshot, ObjectiveQueueState, ObjectiveUntil, Position } from '@/game/types';
import {
  ARRIVAL_RADIUS, GATHER_RANGE,
  addObjective, createQueue, decideIntent, getActiveObjective, tickObjectives,
} from '@/game/systems/objectiveSystem';
import { useGameStore } from '@/game/state/game-store';
import { INITIAL_WAVE } from '@/game/systems/waveSystem';
import type { ResourceNode } from '@/game/types/world';

const T0 = 3_000_000;
const ORIGIN: Position = { x: 0, z: 0 };

type World = Parameters<typeof tickObjectives>[1];

function world(partial: Partial<World> = {}): World {
  return {
    playerPosition: ORIGIN,
    creatures: [],
    camps: [],
    resources: [],
    ...partial,
  };
}

function farmQueue(until?: ObjectiveUntil, radius = 14): ObjectiveQueueState {
  return addObjective(createQueue(), {
    kind: 'farm_area', targetId: 'area_0_0', position: ORIGIN, label: 'Farmar', radius,
    ...(until ? { until } : {}),
  }, T0);
}

/** Promove o primeiro item a ativo (seta `startedAt`), como o tick faz. */
function activate(queue: ObjectiveQueueState, w: World = world()): ObjectiveQueueState {
  return tickObjectives(queue, w, T0).queue;
}

function snapshot(partial: Partial<AutoSnapshot> = {}): AutoSnapshot {
  return {
    playerPosition: ORIGIN,
    playerHp: 100,
    playerMaxHp: 100,
    playerDead: false,
    healSlot: null,
    creatures: [],
    camps: [],
    resources: [],
    objectives: createQueue(),
    homePosition: { x: 0, z: 1 },
    gatherCapacity: true,
    ...partial,
  };
}

// ---------------------------------------------------------------------------
// judge · farm_area honra `until`
// ---------------------------------------------------------------------------
describe('judge · farm_area termina por bag_full / time / items', () => {
  it('bag_full: conclui quando a bolsa fica cheia', () => {
    const active = activate(farmQueue({ mode: 'bag_full' }), world({ gatherCapacity: true }));
    expect(getActiveObjective(active)?.startedAt).toBe(T0);
    // Bolsa com espaço → segue rodando.
    expect(tickObjectives(active, world({ gatherCapacity: true }), T0 + 1).completed).toHaveLength(0);
    // Bolsa cheia → concluído.
    const done = tickObjectives(active, world({ gatherCapacity: false }), T0 + 2);
    expect(done.completed).toHaveLength(1);
    expect(done.completed[0]!.kind).toBe('farm_area');
  });

  it('time: conclui quando passa durationMs desde startedAt', () => {
    const active = activate(farmQueue({ mode: 'time', durationMs: 5000 }));
    expect(tickObjectives(active, world(), T0 + 4999).completed).toHaveLength(0);
    expect(tickObjectives(active, world(), T0 + 5000).completed).toHaveLength(1);
  });

  it('items: conclui quando progress alcança count', () => {
    const active = activate(farmQueue({ mode: 'items', count: 3 }));
    // progress abaixo do alvo → roda.
    const two = { ...active, items: active.items.map(i => ({ ...i, progress: 2 })) };
    expect(tickObjectives(two, world(), T0 + 1).completed).toHaveLength(0);
    // progress alcança → conclui.
    const three = { ...active, items: active.items.map(i => ({ ...i, progress: 3 })) };
    expect(tickObjectives(three, world(), T0 + 1).completed).toHaveLength(1);
  });

  it('farm_area SEM until nunca é eterno: padrão = bag_full', () => {
    const active = activate(farmQueue(undefined), world({ gatherCapacity: true }));
    expect(tickObjectives(active, world({ gatherCapacity: true }), T0 + 1).completed).toHaveLength(0);
    expect(tickObjectives(active, world({ gatherCapacity: false }), T0 + 2).completed).toHaveLength(1);
  });
});

describe('judge · hunt_area honra until, sem until segue eterno', () => {
  it('hunt_area com until time termina; sem until continua rodando', () => {
    const withUntil = activate(addObjective(createQueue(), {
      kind: 'hunt_area', targetId: 'area_0_0', position: ORIGIN, label: 'Caçar', radius: 14,
      until: { mode: 'time', durationMs: 2000 },
    }, T0));
    expect(tickObjectives(withUntil, world(), T0 + 2000).completed).toHaveLength(1);

    const legacy = activate(addObjective(createQueue(), {
      kind: 'hunt_area', targetId: 'area_1_1', position: ORIGIN, label: 'Caçar', radius: 14,
    }, T0));
    // Eterno: nunca conclui sozinho (bolsa cheia não encerra caça).
    expect(tickObjectives(legacy, world({ gatherCapacity: false }), T0 + 99999).completed).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// decideIntent · farm_area colhe o nó dentro da zona
// ---------------------------------------------------------------------------
describe('decideIntent · farm_area', () => {
  const objectives = activate(farmQueue({ mode: 'bag_full' }, 14));

  it('coleta o nó colhível mais próximo DENTRO da zona', () => {
    const intent = decideIntent(snapshot({
      objectives,
      resources: [{ id: 'n1', position: { x: 1, z: 0 }, depleted: false, canCollect: true, range: GATHER_RANGE }],
    }), T0);
    expect(intent).toMatchObject({ kind: 'gather', nodeId: 'n1' });
  });

  it('nó fora do alcance mas dentro da zona: move até ele', () => {
    const intent = decideIntent(snapshot({
      objectives,
      resources: [{ id: 'n1', position: { x: 10, z: 0 }, depleted: false, canCollect: true, range: GATHER_RANGE }],
    }), T0);
    expect(intent).toMatchObject({ kind: 'move' });
  });

  it('nó fora da zona não conta: volta ao centro / idle', () => {
    const intent = decideIntent(snapshot({
      playerPosition: { x: 20, z: 0 },
      objectives,
      resources: [{ id: 'n1', position: { x: 40, z: 0 }, depleted: false, canCollect: true, range: GATHER_RANGE }],
    }), T0);
    // Fora da zona (raio 14 em torno da origem) → o piloto volta pro centro.
    expect(intent.kind).toBe('move');
    if (intent.kind === 'move') {
      expect(intent.to).toEqual(ORIGIN);
    }
  });
});

// ---------------------------------------------------------------------------
// store · construtores novos + opts + backwards-compat
// ---------------------------------------------------------------------------
const INITIAL_PLAYER = structuredClone(useGameStore.getState().player);

function resetWorld() {
  useGameStore.setState({
    player: { ...structuredClone(INITIAL_PLAYER), position: { x: 0, z: 0 } },
    creatures: [],
    resources: [],
    harvestNodes: [],
    camps: [],
    objectives: createQueue(),
    wave: INITIAL_WAVE,
    pilotLastIntent: null,
  });
}

beforeEach(resetWorld);
afterEach(resetWorld);

function resource(id: string, position: Position): ResourceNode {
  return { id, resourceId: 'wood', position, quantity: 10, maxQuantity: 10, respawnAt: null, depleted: false };
}

describe('store · rotina do piloto', () => {
  it('addFarmArea produz um farm_area com raio, label e until', () => {
    const until: ObjectiveUntil = { mode: 'items', count: 5 };
    useGameStore.getState().addFarmArea(12, 34, 20, until);
    const items = useGameStore.getState().objectives.items;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'farm_area', targetId: 'area_12_34', radius: 20, until, status: 'queued',
    });
    expect(items[0]!.position).toEqual({ x: 12, z: 34 });
    expect(items[0]!.label).toContain('Farmar na região');
  });

  it('addTravelPoint produz um travel pro ponto arbitrário', () => {
    useGameStore.getState().addTravelPoint(40, -15);
    const obj = useGameStore.getState().objectives.items[0]!;
    expect(obj).toMatchObject({ kind: 'travel', targetId: 'point_40_-15', label: 'Ir até o ponto' });
    expect(obj.position).toEqual({ x: 40, z: -15 });
  });

  it('addObjective com opts.position cria travel pra ponto arbitrário', () => {
    useGameStore.getState().addObjective('travel', null, { position: { x: 8, z: 9 } });
    const obj = useGameStore.getState().objectives.items[0]!;
    expect(obj).toMatchObject({ kind: 'travel', label: 'Ir até o ponto' });
    expect(obj.position).toEqual({ x: 8, z: 9 });
  });

  it('addHuntArea aceita until opcional sem quebrar o legado', () => {
    useGameStore.getState().addHuntArea(0, 0); // legado: sem until
    expect(useGameStore.getState().objectives.items[0]!.until).toBeUndefined();
    resetWorld();
    useGameStore.getState().addHuntArea(0, 0, 30, { mode: 'time', durationMs: 60000 });
    expect(useGameStore.getState().objectives.items[0]!.until).toEqual({ mode: 'time', durationMs: 60000 });
  });

  it('backwards-compat: addObjective(kind, targetId) antigo ainda funciona', () => {
    useGameStore.setState({ camps: [{
      id: 'camp_a', name: 'Acampamento A', position: { x: 5, z: 0 },
    } as never] });
    useGameStore.getState().addObjective('clear_camp', 'camp_a');
    expect(useGameStore.getState().objectives.items[0]).toMatchObject({
      kind: 'clear_camp', targetId: 'camp_a',
    });
  });

  it('coletar incrementa progress do farm_area ativo com until.items', () => {
    // farm_area ativo com término por itens.
    let objectives = addObjective(createQueue(), {
      kind: 'farm_area', targetId: 'area_0_0', position: ORIGIN, label: 'Farmar',
      radius: 14, until: { mode: 'items', count: 10 },
    }, T0);
    objectives = tickObjectives(objectives, world(), T0).queue;
    useGameStore.setState({ objectives, resources: [resource('n1', { x: 1, z: 0 })] });

    useGameStore.getState().collect('n1'); // colhe 2 de madeira
    const active = getActiveObjective(useGameStore.getState().objectives);
    expect(active?.progress).toBe(2);
  });
});
