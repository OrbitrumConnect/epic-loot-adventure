import { describe, expect, it } from 'vitest';

import type { AutoSnapshot, ObjectiveKind, ObjectiveQueueState, Position } from '@/game/types';
import {
  ARRIVAL_RADIUS, ATTACK_RANGE, GATHER_RANGE, RETREAT_HP_RATIO, SELF_DEFENSE_RADIUS,
  addObjective, clearObjectives, createQueue, decideIntent, findHealHotbarIndex,
  getActiveObjective, hasPendingObjective, removeObjective, reorderObjective, setMode, setRepeat,
  tickObjectives,
} from '@/game/systems/objectiveSystem';
import { createInventory } from '@/game/systems/inventorySystem';

const T0 = 3_000_000;
const ORIGIN: Position = { x: 0, z: 0 };

function queueWith(
  entries: { kind: ObjectiveKind; targetId: string | null; position?: Position; label?: string }[],
): ObjectiveQueueState {
  let queue = createQueue();
  entries.forEach((entry, i) => {
    queue = addObjective(queue, {
      kind: entry.kind,
      targetId: entry.targetId,
      position: entry.position ?? ORIGIN,
      label: entry.label ?? `obj ${i}`,
    }, T0);
  });
  return queue;
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
    ...partial,
  };
}

/** Promove o primeiro item da fila para ativo, como o tick faria. */
function activated(queue: ObjectiveQueueState, world: Parameters<typeof tickObjectives>[1]): ObjectiveQueueState {
  return tickObjectives(queue, world, T0).queue;
}

const emptyWorld = {
  playerPosition: ORIGIN,
  creatures: [] as { id: string; behavior: string; hp: number }[],
  camps: [] as { id: string; cleared: boolean; creatureIds: string[] }[],
  resources: [] as { id: string; depleted: boolean }[],
};

describe('objectiveSystem · fila', () => {
  it('ids vêm do contador, nunca aleatórios', () => {
    const queue = queueWith([
      { kind: 'clear_camp', targetId: 'camp_a' },
      { kind: 'clear_camp', targetId: 'camp_b' },
    ]);
    expect(queue.items.map(i => i.id)).toEqual(['obj_1', 'obj_2']);
    expect(queue.seq).toBe(2);
    expect(queue.items.every(i => i.status === 'queued')).toBe(true);
  });

  it('recusa duplicata de objetivo não finalizado para o mesmo alvo', () => {
    const queue = queueWith([{ kind: 'clear_camp', targetId: 'camp_a' }]);
    expect(hasPendingObjective(queue, 'clear_camp', 'camp_a')).toBe(true);
    const again = addObjective(queue, {
      kind: 'clear_camp', targetId: 'camp_a', position: ORIGIN, label: 'x',
    }, T0 + 1);
    expect(again).toBe(queue);

    // Outro tipo para o mesmo id é permitido.
    const travel = addObjective(queue, {
      kind: 'travel', targetId: 'camp_a', position: ORIGIN, label: 'ir',
    }, T0 + 1);
    expect(travel.items).toHaveLength(2);
  });

  it('remover, esvaziar, modo e repetição', () => {
    const queue = queueWith([
      { kind: 'clear_camp', targetId: 'camp_a' },
      { kind: 'clear_camp', targetId: 'camp_b' },
    ]);
    expect(removeObjective(queue, 'obj_1').items.map(i => i.id)).toEqual(['obj_2']);
    expect(removeObjective(queue, 'nao_existe')).toBe(queue);
    expect(clearObjectives(queue).items).toHaveLength(0);
    expect(setMode(queue, 'idle').mode).toBe('idle');
    expect(setMode(queue, 'manual')).toBe(queue);
    expect(setRepeat(queue, true).repeat).toBe(true);
    expect(setRepeat(queue, false)).toBe(queue);
  });

  it('reordena trocando com o vizinho e ignora as pontas', () => {
    const queue = queueWith([
      { kind: 'clear_camp', targetId: 'a' },
      { kind: 'clear_camp', targetId: 'b' },
      { kind: 'clear_camp', targetId: 'c' },
    ]);
    expect(reorderObjective(queue, 'obj_2', -1).items.map(i => i.id)).toEqual(['obj_2', 'obj_1', 'obj_3']);
    expect(reorderObjective(queue, 'obj_2', 1).items.map(i => i.id)).toEqual(['obj_1', 'obj_3', 'obj_2']);
    expect(reorderObjective(queue, 'obj_1', -1)).toBe(queue);
    expect(reorderObjective(queue, 'obj_3', 1)).toBe(queue);
    expect(reorderObjective(queue, 'obj_9', 1)).toBe(queue);
  });
});

describe('objectiveSystem · tick', () => {
  const campWorld = (cleared: boolean) => ({
    ...emptyWorld,
    camps: [{ id: 'camp_a', cleared, creatureIds: ['e1'] }],
  });

  it('promove o primeiro da fila para ativo, um por vez', () => {
    const queue = queueWith([
      { kind: 'clear_camp', targetId: 'camp_a' },
      { kind: 'clear_camp', targetId: 'camp_b' },
    ]);
    const result = tickObjectives(queue, campWorld(false), T0 + 5);
    expect(result.queue.items[0]).toMatchObject({ id: 'obj_1', status: 'active', startedAt: T0 + 5 });
    expect(result.queue.items[1]!.status).toBe('queued');
    expect(result.completed).toHaveLength(0);

    // Segundo tick sem mudança no mundo não altera nada.
    const again = tickObjectives(result.queue, campWorld(false), T0 + 10);
    expect(again.queue).toBe(result.queue);
  });

  it('conclui o ativo quando o acampamento fica limpo e promove o próximo', () => {
    const queue = activated(queueWith([
      { kind: 'clear_camp', targetId: 'camp_a' },
      { kind: 'travel', targetId: null, position: { x: 30, z: 0 } },
    ]), campWorld(false));

    const done = tickObjectives(queue, campWorld(true), T0 + 100);
    expect(done.completed.map(i => i.id)).toEqual(['obj_1']);
    expect(done.queue.items[0]).toMatchObject({ id: 'obj_1', status: 'done', completedAt: T0 + 100 });
    expect(done.queue.items[1]).toMatchObject({ id: 'obj_2', status: 'active' });
  });

  it('conclui caça quando a criatura morre e coleta quando o nó esgota', () => {
    const hunt = activated(queueWith([{ kind: 'hunt_creature', targetId: 'c1' }]), {
      ...emptyWorld, creatures: [{ id: 'c1', behavior: 'chase', hp: 10 }],
    });
    const hunted = tickObjectives(hunt, {
      ...emptyWorld, creatures: [{ id: 'c1', behavior: 'dead', hp: 0 }],
    }, T0 + 1);
    expect(hunted.completed).toHaveLength(1);

    const gather = activated(queueWith([{ kind: 'gather_node', targetId: 'n1' }]), {
      ...emptyWorld, resources: [{ id: 'n1', depleted: false }],
    });
    const gathered = tickObjectives(gather, {
      ...emptyWorld, resources: [{ id: 'n1', depleted: true }],
    }, T0 + 1);
    expect(gathered.completed).toHaveLength(1);
  });

  it('conclui travel ao chegar no raio de chegada', () => {
    const far = { ...emptyWorld, playerPosition: { x: 0, z: 0 } };
    const queue = activated(queueWith([
      { kind: 'travel', targetId: null, position: { x: 10, z: 0 } },
    ]), far);
    expect(tickObjectives(queue, far, T0 + 1).completed).toHaveLength(0);

    const arrived = { ...emptyWorld, playerPosition: { x: 10 - ARRIVAL_RADIUS + 0.1, z: 0 } };
    expect(tickObjectives(queue, arrived, T0 + 1).completed).toHaveLength(1);
  });

  it('falha quando o alvo deixa de existir', () => {
    const queue = activated(queueWith([{ kind: 'clear_camp', targetId: 'camp_a' }]), campWorld(false));
    const lost = tickObjectives(queue, emptyWorld, T0 + 2);
    expect(lost.failed.map(i => i.id)).toEqual(['obj_1']);
    expect(lost.queue.items[0]).toMatchObject({ status: 'failed' });
    expect(lost.queue.items[0]!.failedReason).toContain('Acampamento');

    const hunt = activated(queueWith([{ kind: 'hunt_creature', targetId: 'c1' }]), {
      ...emptyWorld, creatures: [{ id: 'c1', behavior: 'idle', hp: 10 }],
    });
    expect(tickObjectives(hunt, emptyWorld, T0 + 2).failed).toHaveLength(1);

    const gather = activated(queueWith([{ kind: 'gather_node', targetId: 'n1' }]), {
      ...emptyWorld, resources: [{ id: 'n1', depleted: false }],
    });
    expect(tickObjectives(gather, emptyWorld, T0 + 2).failed).toHaveLength(1);
  });

  it('com repeat, o concluído volta para o fim da fila em vez de sair', () => {
    let queue = setRepeat(queueWith([
      { kind: 'clear_camp', targetId: 'camp_a', label: 'limpar A' },
      { kind: 'travel', targetId: null, position: { x: 50, z: 0 }, label: 'ir' },
    ]), true);
    queue = activated(queue, campWorld(false));

    const looped = tickObjectives(queue, campWorld(true), T0 + 10);
    expect(looped.completed.map(i => i.label)).toEqual(['limpar A']);
    expect(looped.queue.items.map(i => i.label)).toEqual(['ir', 'limpar A']);
    expect(looped.queue.items.map(i => i.status)).toEqual(['active', 'queued']);
    expect(looped.queue.items[1]!.id).toBe('obj_3');
    expect(looped.queue.items).toHaveLength(2);
    // Sem histórico acumulado: a fila não cresce a cada volta.
    expect(looped.queue.items.some(i => i.status === 'done')).toBe(false);
  });

  it('sem repeat, o concluído fica no histórico', () => {
    const queue = activated(queueWith([{ kind: 'clear_camp', targetId: 'camp_a' }]), campWorld(false));
    const done = tickObjectives(queue, campWorld(true), T0 + 10);
    expect(done.queue.items.map(i => i.status)).toEqual(['done']);
    expect(getActiveObjective(done.queue)).toBeNull();
  });
});

describe('objectiveSystem · cura na hotbar', () => {
  it('acha o primeiro slot de hotbar com consumível de cura', () => {
    const inventory = createInventory([
      { itemId: 'iron_sword', quantity: 1 },
      { itemId: 'wood', quantity: 5 },
      { itemId: 'health_potion', quantity: 3 },
    ]);
    expect(findHealHotbarIndex(inventory)).toBe(2);

    const empty = createInventory([{ itemId: 'iron_sword', quantity: 1 }]);
    expect(findHealHotbarIndex(empty)).toBeNull();

    const zeroed = createInventory([{ itemId: 'health_potion', quantity: 0 }]);
    expect(findHealHotbarIndex(zeroed)).toBeNull();
  });
});

describe('objectiveSystem · decideIntent', () => {
  const campSnapshotBase = (enemyPos: Position, playerPos: Position = ORIGIN) => {
    const queue = activated(
      setMode(queueWith([{ kind: 'clear_camp', targetId: 'camp_a', label: 'limpar A' }]), 'idle'),
      { ...emptyWorld, camps: [{ id: 'camp_a', cleared: false, creatureIds: ['e1'] }] },
    );
    return snapshot({
      playerPosition: playerPos,
      objectives: queue,
      camps: [{ id: 'camp_a', position: { x: 20, z: 14 }, radius: 7, creatureIds: ['e1', 'e2'], cleared: false }],
      creatures: [{ id: 'e1', position: enemyPos, behavior: 'idle', hp: 45 }],
    });
  };

  it('1. morto -> idle', () => {
    const intent = decideIntent(snapshot({ playerDead: true, playerHp: 0 }), T0);
    expect(intent.kind).toBe('idle');
  });

  it('2. vida baixa com cura -> heal', () => {
    const intent = decideIntent(snapshot({
      playerHp: Math.floor(100 * RETREAT_HP_RATIO) - 1,
      healSlot: 3,
    }), T0);
    expect(intent).toEqual({ kind: 'heal', hotbarIndex: 3 });
  });

  it('3. vida baixa sem cura -> retreat para a base', () => {
    const intent = decideIntent(snapshot({
      playerHp: 10,
      healSlot: null,
      homePosition: { x: 0, z: 1 },
    }), T0);
    expect(intent.kind).toBe('retreat');
    if (intent.kind === 'retreat') expect(intent.to).toEqual({ x: 0, z: 1 });
  });

  it('vida acima do limiar não dispara cura nem recuo', () => {
    const intent = decideIntent(snapshot({
      playerHp: Math.ceil(100 * RETREAT_HP_RATIO) + 1,
      healSlot: 3,
    }), T0);
    expect(intent.kind).toBe('idle');
  });

  it('4. defesa própria vem antes da fila', () => {
    const base = campSnapshotBase({ x: 20, z: 14 });
    const underAttack = snapshot({
      ...base,
      creatures: [
        ...base.creatures,
        { id: 'wolf_1', position: { x: 2, z: 0 }, behavior: 'chase', hp: 80 },
      ],
    });
    const intent = decideIntent(underAttack, T0);
    expect(intent).toMatchObject({ kind: 'attack', creatureId: 'wolf_1' });

    // Perseguidor longe não interrompe: volta a servir a fila.
    const farChaser = snapshot({
      ...base,
      creatures: [
        ...base.creatures,
        { id: 'wolf_1', position: { x: SELF_DEFENSE_RADIUS + 3, z: 0 }, behavior: 'chase', hp: 80 },
      ],
    });
    expect(decideIntent(farChaser, T0).kind).toBe('move');

    // Criatura perto mas parada não é ameaça.
    const idleNeighbour = snapshot({
      ...base,
      creatures: [
        ...base.creatures,
        { id: 'wolf_1', position: { x: 1, z: 0 }, behavior: 'patrol', hp: 80 },
      ],
    });
    expect(decideIntent(idleNeighbour, T0).kind).toBe('move');

    // Perseguidor morto também não é ameaça.
    const deadChaser = snapshot({
      ...base,
      creatures: [
        ...base.creatures,
        { id: 'wolf_1', position: { x: 1, z: 0 }, behavior: 'chase', hp: 0 },
      ],
    });
    expect(decideIntent(deadChaser, T0).kind).toBe('move');
  });

  it('4b. entre dois perseguidores escolhe o mais próximo', () => {
    const base = campSnapshotBase({ x: 20, z: 14 });
    const intent = decideIntent(snapshot({
      ...base,
      creatures: [
        ...base.creatures,
        { id: 'far', position: { x: 5, z: 0 }, behavior: 'chase', hp: 80 },
        { id: 'near', position: { x: 2, z: 0 }, behavior: 'attack', hp: 80 },
      ],
    }), T0);
    expect(intent).toMatchObject({ kind: 'attack', creatureId: 'near' });
  });

  it('5. clear_camp: longe -> move, perto -> attack no inimigo vivo mais próximo', () => {
    const far = decideIntent(campSnapshotBase({ x: 20, z: 14 }), T0);
    expect(far.kind).toBe('move');
    if (far.kind === 'move') expect(far.to).toEqual({ x: 20, z: 14 });

    const near = decideIntent(campSnapshotBase({ x: ATTACK_RANGE - 0.2, z: 0 }), T0);
    expect(near).toMatchObject({ kind: 'attack', creatureId: 'e1' });

    const twoEnemies = campSnapshotBase({ x: 20, z: 14 });
    const chooseNearest = decideIntent(snapshot({
      ...twoEnemies,
      creatures: [
        { id: 'e1', position: { x: 25, z: 14 }, behavior: 'idle', hp: 45 },
        { id: 'e2', position: { x: 18, z: 12 }, behavior: 'idle', hp: 95 },
      ],
    }), T0);
    expect(chooseNearest.kind).toBe('move');
    if (chooseNearest.kind === 'move') expect(chooseNearest.to).toEqual({ x: 18, z: 12 });

    // Todos mortos: nada a atacar.
    const wiped = decideIntent(snapshot({
      ...twoEnemies,
      creatures: [{ id: 'e1', position: { x: 20, z: 14 }, behavior: 'dead', hp: 0 }],
    }), T0);
    expect(wiped.kind).toBe('idle');
  });

  it('5b. hunt_creature: move até o alcance e então ataca', () => {
    const makeSnapshot = (pos: Position) => {
      const queue = activated(queueWith([{ kind: 'hunt_creature', targetId: 'c1', label: 'caçar' }]), {
        ...emptyWorld, creatures: [{ id: 'c1', behavior: 'idle', hp: 80 }],
      });
      return snapshot({ objectives: queue, creatures: [{ id: 'c1', position: pos, behavior: 'idle', hp: 80 }] });
    };
    expect(decideIntent(makeSnapshot({ x: 12, z: 0 }), T0).kind).toBe('move');
    expect(decideIntent(makeSnapshot({ x: ATTACK_RANGE - 0.1, z: 0 }), T0))
      .toMatchObject({ kind: 'attack', creatureId: 'c1' });
    // Alvo morto: sem intenção de ataque.
    const dead = snapshot({
      objectives: makeSnapshot(ORIGIN).objectives,
      creatures: [{ id: 'c1', position: ORIGIN, behavior: 'dead', hp: 0 }],
    });
    expect(decideIntent(dead, T0).kind).toBe('idle');
  });

  it('5c. gather_node: move até o alcance e então coleta', () => {
    const makeSnapshot = (pos: Position, depleted = false) => {
      const queue = activated(queueWith([{ kind: 'gather_node', targetId: 'n1', label: 'coletar' }]), {
        ...emptyWorld, resources: [{ id: 'n1', depleted: false }],
      });
      return snapshot({ objectives: queue, resources: [{ id: 'n1', position: pos, depleted }] });
    };
    expect(decideIntent(makeSnapshot({ x: 9, z: 0 }), T0).kind).toBe('move');
    expect(decideIntent(makeSnapshot({ x: GATHER_RANGE - 0.1, z: 0 }), T0))
      .toMatchObject({ kind: 'gather', nodeId: 'n1' });
    expect(decideIntent(makeSnapshot({ x: 0.5, z: 0 }, true), T0).kind).toBe('idle');
  });

  it('5d. travel: move enquanto longe, idle ao chegar', () => {
    const makeSnapshot = (playerPos: Position) => {
      const queue = activated(queueWith([
        { kind: 'travel', targetId: null, position: { x: 20, z: 0 }, label: 'ir' },
      ]), emptyWorld);
      return snapshot({ objectives: queue, playerPosition: playerPos });
    };
    expect(decideIntent(makeSnapshot(ORIGIN), T0).kind).toBe('move');
    expect(decideIntent(makeSnapshot({ x: 20, z: 0 }), T0).kind).toBe('idle');
  });

  it('6. sem objetivo ativo -> idle', () => {
    expect(decideIntent(snapshot(), T0).kind).toBe('idle');
    // Fila só com itens enfileirados (nenhum promovido ainda) também é idle.
    expect(decideIntent(snapshot({ objectives: queueWith([{ kind: 'clear_camp', targetId: 'camp_a' }]) }), T0).kind)
      .toBe('idle');
  });

  it('é determinística: mesma entrada, mesma saída, independente de now', () => {
    const snap = campSnapshotBase({ x: 20, z: 14 });
    const a = decideIntent(snap, T0);
    const b = decideIntent(snap, T0 + 999_999);
    expect(a).toEqual(b);
    expect(decideIntent(snap, T0)).toEqual(a);
  });
});
