import { describe, expect, it } from 'vitest';

import type { BaseState, PlacedBuilding } from '@/game/types';
import {
  BASE_BUILDERS, BUILDINGS, BUILDING_IDS, COST_GROWTH, HALL_PLOT_INDEX, MAX_BUILDING_LEVEL,
} from '@/game/data/buildings';
import { EXPEDITIONS, UNITS } from '@/game/data/units';
import {
  cancelQueueItem, collectTools, createInitialBase, depositFromInventory, enqueueUnit,
  getBuilding, getBuildersInUse, getEra, getExpeditionLoot, getIdleScouts, getProductionRates,
  getQueueCapacity, getStorageCap, getStorageCapForHall, getUnitCost, getUpgradeBlockReason,
  getUpgradeCost, getUpgradeDurationMs, getPlaceBlockReason, placeBuilding, sendExpedition,
  startUpgrade, tickBase,
} from '@/game/systems/baseSystem';
import { createInventory, getItemCount } from '@/game/systems/inventorySystem';

const T0 = 1_000_000;
const RICH = { wood: 1e9, stone: 1e9, food: 1e9, essence: 1e9 };

function building(id: string, defId: PlacedBuilding['defId'], level: number, plotIndex: number): PlacedBuilding {
  return { id, defId, level, plotIndex, construction: null, queue: [] };
}

/** Base rica com salão no nível pedido, para testar regras sem depender do estoque inicial. */
function richBase(hallLevel = 5, extra: PlacedBuilding[] = []): BaseState {
  const base = createInitialBase(T0);
  return {
    ...base,
    resources: { ...RICH },
    buildings: [building('b1', 'tribe_hall', hallLevel, HALL_PLOT_INDEX), ...extra],
    seq: 100,
  };
}

describe('baseSystem · custos e tempos', () => {
  it('custo cresce geometricamente por nível', () => {
    const base = BUILDINGS.lumber_camp.baseCost;
    expect(getUpgradeCost('lumber_camp', 1)).toEqual(base);
    expect(getUpgradeCost('lumber_camp', 2).wood).toBe(Math.round(base.wood * COST_GROWTH));
    expect(getUpgradeCost('lumber_camp', 5).wood).toBe(Math.round(base.wood * Math.pow(COST_GROWTH, 4)));
    expect(getUpgradeCost('lumber_camp', 10).wood).toBeGreaterThan(getUpgradeCost('lumber_camp', 9).wood);
  });

  it('tempo cresce por nível e ações de nível 1 levam poucos segundos', () => {
    const state = createInitialBase(T0);
    for (const id of BUILDING_IDS) {
      expect(getUpgradeDurationMs(state, id, 1)).toBeLessThanOrEqual(15_000);
      expect(getUpgradeDurationMs(state, id, 2)).toBeGreaterThan(getUpgradeDurationMs(state, id, 1));
    }
  });

  it('todo custo de melhoria cabe no armazém disponível naquele momento', () => {
    for (const id of BUILDING_IDS) {
      for (let target = 1; target <= MAX_BUILDING_LEVEL; target++) {
        // O salão sobe com o armazém do nível anterior; os demais exigem salão >= nível alvo.
        const hallLevel = id === 'tribe_hall' ? Math.max(1, target - 1) : Math.max(target, BUILDINGS[id].unlockHallLevel);
        const cap = getStorageCapForHall(hallLevel);
        const cost = getUpgradeCost(id, target);
        expect(cost.wood, `${id} ${target} madeira`).toBeLessThanOrEqual(cap.wood);
        expect(cost.stone, `${id} ${target} pedra`).toBeLessThanOrEqual(cap.stone);
        expect(cost.food, `${id} ${target} comida`).toBeLessThanOrEqual(cap.food);
        expect(cost.essence, `${id} ${target} essência`).toBeLessThanOrEqual(cap.essence);
      }
    }
  });

  it('estado inicial: salão nível 1 no centro e primeira obra acessível', () => {
    const state = createInitialBase(T0);
    expect(state.buildings).toHaveLength(1);
    expect(state.buildings[0]).toMatchObject({ defId: 'tribe_hall', level: 1, plotIndex: HALL_PLOT_INDEX });
    expect(getPlaceBlockReason(state, 'lumber_camp', 0)).toBeNull();
    expect(getUpgradeBlockReason(state, 'b1')).toBeNull();
  });

  it('eras seguem as faixas de nível', () => {
    expect(getEra(1).name).toBe('Era da Pele');
    expect(getEra(4).name).toBe('Era da Pele');
    expect(getEra(5).name).toBe('Era da Madeira');
    expect(getEra(12).name).toBe('Era da Pedra');
    expect(getEra(13).name).toBe('Era do Bronze');
    expect(getEra(20).name).toBe('Era do Ferro');
  });
});

describe('baseSystem · construção', () => {
  it('cobra o custo, conclui após o tempo e libera o nível', () => {
    const state = createInitialBase(T0);
    const cost = getUpgradeCost('lumber_camp', 1);
    const placed = placeBuilding(state, 'lumber_camp', 0, T0);
    expect(placed.ok).toBe(true);
    expect(placed.state.resources.wood).toBe(state.resources.wood - cost.wood);

    const site = placed.state.buildings.find(b => b.plotIndex === 0)!;
    expect(site.level).toBe(0);
    expect(site.construction?.startedAt).toBe(T0);

    const half = tickBase(placed.state, T0 + site.construction!.durationMs / 2);
    expect(getBuilding(half, site.id)?.level).toBe(0);

    const done = tickBase(placed.state, T0 + site.construction!.durationMs);
    expect(getBuilding(done, site.id)).toMatchObject({ level: 1, construction: null });
  });

  it('recusa terreno ocupado, falta de recursos e limite de instâncias', () => {
    const state = createInitialBase(T0);
    expect(placeBuilding(state, 'quarry', HALL_PLOT_INDEX, T0).ok).toBe(false);

    const poor = { ...state, resources: { wood: 0, stone: 0, food: 0, essence: 0 } };
    const denied = placeBuilding(poor, 'quarry', 0, T0);
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain('Faltam');
    expect(denied.state.buildings).toHaveLength(1);

    const full = richBase(5, [building('w1', 'war_camp', 1, 0)]);
    expect(getPlaceBlockReason(full, 'war_camp', 1)).toBe('Já construído.');
  });

  it('construções exigem nível mínimo do salão para serem erguidas', () => {
    const state = { ...createInitialBase(T0), resources: { ...RICH } };
    expect(getPlaceBlockReason(state, 'forge', 0)).toContain('Salão da Tribo nível 3');
    expect(getPlaceBlockReason(richBase(3), 'forge', 0)).toBeNull();
  });

  it('nível das construções é limitado pelo nível do salão', () => {
    const state = richBase(2, [building('l1', 'lumber_camp', 2, 0)]);
    expect(getUpgradeBlockReason(state, 'l1')).toBe('Requer Salão da Tribo nível 3.');
    expect(startUpgrade(state, 'l1', T0).ok).toBe(false);
    // O próprio salão não é limitado por si mesmo.
    expect(getUpgradeBlockReason(state, 'b1')).toBeNull();

    const higher = richBase(3, [building('l1', 'lumber_camp', 2, 0)]);
    expect(startUpgrade(higher, 'l1', T0).ok).toBe(true);
  });

  it('respeita o nível máximo', () => {
    const state = richBase(MAX_BUILDING_LEVEL);
    expect(getUpgradeBlockReason(state, 'b1')).toBe('Nível máximo alcançado.');
  });

  it('limite de construtores: pedidos extras esperam e iniciam em ordem', () => {
    let state = richBase(5);
    state = placeBuilding(state, 'lumber_camp', 0, T0).state;
    state = placeBuilding(state, 'quarry', 1, T0).state;
    state = placeBuilding(state, 'hunting_lodge', 2, T0).state;
    state = placeBuilding(state, 'war_camp', 3, T0).state;

    const at = (plot: number, s: BaseState) => s.buildings.find(b => b.plotIndex === plot)!;
    expect(getBuildersInUse(state)).toBe(BASE_BUILDERS);
    expect(at(2, state).construction?.startedAt).toBeNull();
    expect(at(3, state).construction?.startedAt).toBeNull();

    // lumber_camp e quarry levam 5s; ao terminar, os dois em espera começam naquele instante.
    const firstEnd = at(0, state).construction!.endsAt!;
    const mid = tickBase(state, firstEnd + 10);
    expect(at(0, mid).level).toBe(1);
    expect(at(1, mid).level).toBe(1);
    expect(at(2, mid).construction?.startedAt).toBe(firstEnd);
    expect(at(3, mid).construction?.startedAt).toBe(firstEnd);
    expect(getBuildersInUse(mid)).toBe(BASE_BUILDERS);
  });

  it('salto grande de tempo encadeia a fila de construtores inteira', () => {
    let state = richBase(5);
    const plots = [0, 1, 2, 3, 4];
    const ids = ['lumber_camp', 'lumber_camp', 'quarry', 'quarry', 'hunting_lodge'] as const;
    plots.forEach((plot, i) => { state = placeBuilding(state, ids[i]!, plot, T0).state; });

    const done = tickBase(state, T0 + 3_600_000);
    expect(done.buildings.filter(b => b.level === 1 && b.defId !== 'tribe_hall')).toHaveLength(5);
    expect(done.buildings.every(b => b.construction === null)).toBe(true);
    expect(getBuildersInUse(done)).toBe(0);
  });
});

describe('baseSystem · fila de produção', () => {
  const camp = () => richBase(5, [building('w1', 'war_camp', 1, 0)]);

  it('capacidade cresce com o nível da construção', () => {
    const low = richBase(10, [building('w1', 'war_camp', 1, 0)]);
    const high = richBase(10, [building('w1', 'war_camp', 9, 0)]);
    expect(getQueueCapacity(low, low.buildings[1]!)).toBe(2);
    expect(getQueueCapacity(high, high.buildings[1]!)).toBe(5);
  });

  it('só o primeiro item progride e a fila cheia recusa novos itens', () => {
    let state = camp();
    const first = enqueueUnit(state, 'w1', 'warrior', T0);
    expect(first.ok).toBe(true);
    state = enqueueUnit(first.state, 'w1', 'warrior', T0).state;

    const queue = getBuilding(state, 'w1')!.queue;
    expect(queue).toHaveLength(2);
    expect(queue[0]!.startedAt).toBe(T0);
    expect(queue[1]!.startedAt).toBeNull();

    const full = enqueueUnit(state, 'w1', 'warrior', T0);
    expect(full.ok).toBe(false);
    expect(full.message).toBe('Fila cheia.');
  });

  it('respeita o nível mínimo da construção para cada unidade', () => {
    const denied = enqueueUnit(camp(), 'w1', 'archer', T0);
    expect(denied.ok).toBe(false);
    expect(denied.message).toContain('nível 5');
  });

  it('salto grande de tempo conclui vários itens em sequência', () => {
    let state = richBase(10, [building('w1', 'war_camp', 9, 0)]);
    for (let i = 0; i < 4; i++) state = enqueueUnit(state, 'w1', 'warrior', T0).state;
    state = enqueueUnit(state, 'w1', 'spearman', T0).state;
    expect(getBuilding(state, 'w1')!.queue).toHaveLength(5);

    const warriorMs = UNITS['warrior']!.durationSeconds * 1000;
    // Logo após o 2º guerreiro: 2 prontos, o 3º em andamento desde o fim do 2º.
    const partial = tickBase(state, T0 + warriorMs * 2 + 500);
    expect(partial.troops['warrior']).toBe(2);
    expect(getBuilding(partial, 'w1')!.queue).toHaveLength(3);
    expect(getBuilding(partial, 'w1')!.queue[0]!.startedAt).toBe(T0 + warriorMs * 2);

    const done = tickBase(state, T0 + 86_400_000);
    expect(done.troops['warrior']).toBe(4);
    expect(done.troops['spearman']).toBe(1);
    expect(getBuilding(done, 'w1')!.queue).toHaveLength(0);
  });

  it('cancelar devolve o custo e o próximo item assume a frente', () => {
    const before = camp();
    let state = enqueueUnit(before, 'w1', 'warrior', T0).state;
    state = enqueueUnit(state, 'w1', 'warrior', T0).state;
    const cost = getUnitCost(before, 'warrior');
    expect(state.resources.food).toBe(before.resources.food - cost.food * 2);

    const headId = getBuilding(state, 'w1')!.queue[0]!.id;
    const cancelled = cancelQueueItem(state, 'w1', headId, T0 + 1000);
    expect(cancelled.ok).toBe(true);
    expect(cancelled.state.resources.food).toBe(before.resources.food - cost.food);
    expect(cancelled.state.resources.wood).toBe(before.resources.wood - cost.wood);

    const queue = getBuilding(cancelled.state, 'w1')!.queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]!.startedAt).toBe(T0 + 1000);
    expect(cancelled.state.troops['warrior'] ?? 0).toBe(0);
  });

  it('pesquisa concluída sobe de nível, encarece e aplica o bônus', () => {
    const base = richBase(5, [building('s1', 'shaman_circle', 1, 0), building('l1', 'lumber_camp', 1, 1)]);
    const rateBefore = getProductionRates(base).wood;
    const costBefore = getUnitCost(base, 'fertile_lands');

    const queued = enqueueUnit(base, 's1', 'fertile_lands', T0);
    expect(queued.ok).toBe(true);
    expect(enqueueUnit(queued.state, 's1', 'fertile_lands', T0).message).toBe('Pesquisa já está na fila.');

    const done = tickBase(queued.state, T0 + 600_000);
    expect(done.research['fertile_lands']).toBe(1);
    expect(getProductionRates(done).wood).toBeCloseTo(rateBefore * 1.1, 5);
    expect(getUnitCost(done, 'fertile_lands').food).toBeGreaterThan(costBefore.food);
  });

  it('ferramentas da forja vão para a mochila do jogador', () => {
    const base = richBase(5, [building('f1', 'forge', 1, 0)]);
    const queued = enqueueUnit(base, 'f1', 'tool_torch', T0).state;
    const done = tickBase(queued, T0 + 60_000);
    expect(done.toolStash['torch']).toBe(1);

    const delivery = collectTools(done, createInventory());
    expect(delivery.moved).toEqual([{ itemId: 'torch', quantity: 1 }]);
    expect(getItemCount(delivery.inventory, 'torch')).toBe(1);
    expect(delivery.state.toolStash['torch']).toBeUndefined();

    // Mochila sem slots livres: a ferramenta fica guardada na forja.
    const fullInventory = createInventory(Array.from({ length: 24 }, () => ({ itemId: 'wolf_fang', quantity: 1 })));
    const held = collectTools(done, fullInventory);
    expect(held.moved).toHaveLength(0);
    expect(held.state.toolStash['torch']).toBe(1);
  });
});

describe('baseSystem · produção de recursos', () => {
  it('acumula pelo tempo decorrido', () => {
    const base = { ...createInitialBase(T0), buildings: [building('b1', 'tribe_hall', 1, HALL_PLOT_INDEX), building('l1', 'lumber_camp', 1, 0)] };
    const rate = getProductionRates(base).wood;
    expect(rate).toBe(BUILDINGS.lumber_camp.produces!.basePerMinute);

    const later = tickBase(base, T0 + 120_000);
    expect(later.resources.wood).toBeCloseTo(base.resources.wood + rate * 2, 5);
    expect(later.resources.stone).toBe(base.resources.stone);
    expect(later.lastTickAt).toBe(T0 + 120_000);
  });

  it('para no limite do armazém mesmo após muito tempo', () => {
    const base = { ...createInitialBase(T0), buildings: [building('b1', 'tribe_hall', 1, HALL_PLOT_INDEX), building('l1', 'lumber_camp', 3, 0)] };
    const cap = getStorageCap(base);
    const later = tickBase(base, T0 + 30 * 86_400_000);
    expect(later.resources.wood).toBe(cap.wood);
  });

  it('melhoria concluída no meio do salto muda a taxa a partir daquele instante', () => {
    const start = richBase(5, [building('l1', 'lumber_camp', 1, 0)]);
    const base = { ...start, resources: { wood: 1000, stone: 1000, food: 0, essence: 0 } };
    const upgraded = startUpgrade(base, 'l1', T0);
    const job = getBuilding(upgraded.state, 'l1')!.construction!;
    const woodAfterPay = upgraded.state.resources.wood;
    const rate1 = getProductionRates(upgraded.state).wood;

    const end = T0 + job.durationMs + 60_000;
    const done = tickBase(upgraded.state, end);
    const rate2 = getProductionRates(done).wood;
    expect(rate2).toBeGreaterThan(rate1);
    expect(done.resources.wood).toBeCloseTo(woodAfterPay + rate1 * (job.durationMs / 60_000) + rate2, 5);
  });

  it('tick com relógio parado ou atrasado não altera nada', () => {
    const base = createInitialBase(T0);
    expect(tickBase(base, T0)).toBe(base);
    expect(tickBase(base, T0 - 5000)).toBe(base);
  });
});

describe('baseSystem · expedições', () => {
  const withScouts = (scouts: number) => ({
    ...richBase(5, [building('t1', 'scout_tent', 1, 0)]),
    resources: { wood: 0, stone: 0, food: 0, essence: 0 },
    troops: { scout: scouts },
  });

  it('exige tenda e batedores livres', () => {
    expect(sendExpedition(richBase(5), 'near_trail', 1, T0).ok).toBe(false);
    expect(sendExpedition(withScouts(1), 'near_trail', 2, T0).message).toBe('Batedores livres insuficientes.');
    expect(sendExpedition(withScouts(3), 'deep_valley', 1, T0).message).toContain('nível 3');
  });

  it('batedores ficam ocupados e voltam com recursos e exploração', () => {
    const base = withScouts(3);
    const sent = sendExpedition(base, 'near_trail', 2, T0);
    expect(sent.ok).toBe(true);
    expect(getIdleScouts(sent.state)).toBe(1);
    // Tenda nível 1 permite apenas uma expedição por vez.
    expect(sendExpedition(sent.state, 'near_trail', 1, T0).ok).toBe(false);

    const def = EXPEDITIONS['near_trail']!;
    const during = tickBase(sent.state, T0 + def.durationSeconds * 1000 - 1);
    expect(during.expeditions).toHaveLength(1);
    expect(during.resources.wood).toBe(0);

    const back = tickBase(sent.state, T0 + def.durationSeconds * 1000);
    const loot = getExpeditionLoot(base, 'near_trail', 2);
    expect(loot.wood).toBe(def.lootPerScout.wood * 2);
    expect(back.expeditions).toHaveLength(0);
    expect(getIdleScouts(back)).toBe(3);
    expect(back.resources.wood).toBe(loot.wood);
    expect(back.resources.food).toBe(loot.food);
    expect(back.explored).toBeCloseTo(def.explorePerScout * 2, 5);
  });
});

describe('baseSystem · depósito (Mapa → Base)', () => {
  it('move madeira, pedra e essência arcana da mochila para o estoque', () => {
    const base = createInitialBase(T0);
    const inventory = createInventory([
      { itemId: 'wood', quantity: 12 },
      { itemId: 'stone', quantity: 8 },
      { itemId: 'arcane_essence', quantity: 3 },
      { itemId: 'health_potion', quantity: 5 },
    ]);
    const result = depositFromInventory(base, inventory);
    expect(result.moved).toEqual({ wood: 12, stone: 8, food: 0, essence: 3 });
    expect(result.state.resources.wood).toBe(base.resources.wood + 12);
    expect(result.state.resources.essence).toBe(base.resources.essence + 3);
    expect(getItemCount(result.inventory, 'wood')).toBe(0);
    expect(getItemCount(result.inventory, 'arcane_essence')).toBe(0);
    expect(getItemCount(result.inventory, 'health_potion')).toBe(5);
  });

  it('respeita o limite do armazém e deixa o excedente na mochila', () => {
    const base = createInitialBase(T0);
    const cap = getStorageCap(base);
    const nearlyFull = { ...base, resources: { ...base.resources, wood: cap.wood - 5 } };
    const result = depositFromInventory(nearlyFull, createInventory([{ itemId: 'wood', quantity: 12 }]));
    expect(result.moved.wood).toBe(5);
    expect(result.state.resources.wood).toBe(cap.wood);
    expect(getItemCount(result.inventory, 'wood')).toBe(7);
  });
});
