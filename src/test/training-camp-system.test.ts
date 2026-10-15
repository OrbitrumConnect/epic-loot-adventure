import { describe, expect, it } from 'vitest';
import type { BaseState, PlacedBuilding } from '../game/types';
import type { GridCell, PlayerBaseState } from '../game/types/playerbase';
import { createInventory, getItemCount } from '../game/systems/inventorySystem';
import { createInitialBase } from '../game/systems/baseSystem';
import { CLAIM_SIZE } from '../game/data/base-pieces';
import { UNITS } from '../game/data/units';
import { basePieceCost } from '../game/systems/baseTypeSystem';
import { checkClaim, claimBase, type ClaimWorld } from '../game/systems/playerBaseSystem';
import {
  constructTrainingCamp, trainTroop, upgradeTrainingCamp,
} from '../game/systems/trainingCampSystem';

const NOW = 1_000;
const EMPTY: ClaimWorld = { bases: [] };
const OWNER = { kind: 'player' as const, id: 'p1', name: 'Teste' };

/** Varre o mapa pelo primeiro quadrado livre — sem fixar coordenadas no olhômetro. */
function findFreeOrigin(): GridCell {
  for (let gz = -40; gz <= 30; gz += 2) {
    for (let gx = -40; gx <= 30; gx += 2) {
      if (checkClaim({ gx, gz }, CLAIM_SIZE, EMPTY, NOW).ok) return { gx, gz };
    }
  }
  throw new Error('nenhum terreno livre');
}

function freshBase(): PlayerBaseState {
  const r = claimBase(findFreeOrigin(), CLAIM_SIZE, OWNER, EMPTY, NOW);
  if (!r.base) throw new Error(r.message);
  return r.base;
}

/** Cidade inicial já com o Campo de Guerra construído no nível pedido. */
function cityWithWarCamp(level: number): BaseState {
  const base = createInitialBase(NOW);
  const camp: PlacedBuilding = { id: 'camp1', defId: 'war_camp', level, plotIndex: 5, construction: null, queue: [] };
  return { ...base, buildings: [...base.buildings, camp] };
}

/** Bolsa com folga de madeira/pedra para o centro físico. */
function richBag(wood = 99, stone = 99) {
  return createInventory([
    { itemId: 'wood', quantity: wood },
    { itemId: 'stone', quantity: stone },
  ]);
}

describe('trainingCampSystem · construção', () => {
  it('cobra exatamente o custo da peça training na bolsa', () => {
    const playerBase = freshBase();
    const bag = richBag();
    const cost = basePieceCost('training', 1, playerBase.baseType);
    const result = constructTrainingCamp(cityWithWarCamp(1), playerBase, bag, NOW);

    expect(result.ok).toBe(true);
    for (const entry of cost) {
      expect(getItemCount(result.inventory, entry.itemId)).toBe(getItemCount(bag, entry.itemId) - entry.quantity);
    }
    expect(result.playerBase!.pieces.some(p => p.kind === 'training')).toBe(true);
  });

  it('recusa e preserva tudo quando falta material', () => {
    const playerBase = freshBase();
    const poor = createInventory([{ itemId: 'wood', quantity: 1 }, { itemId: 'stone', quantity: 1 }]);
    const city = cityWithWarCamp(1);
    const result = constructTrainingCamp(city, playerBase, poor, NOW);

    expect(result.ok).toBe(false);
    expect(result.playerBase).toBe(playerBase);
    expect(result.inventory).toBe(poor);
    expect(result.base).toBe(city);
  });

  it('não deixa construir dois centros de treinamento', () => {
    const playerBase = freshBase();
    const first = constructTrainingCamp(cityWithWarCamp(1), playerBase, richBag(), NOW);
    expect(first.ok).toBe(true);

    const second = constructTrainingCamp(first.base, first.playerBase, richBag(), NOW);
    expect(second.ok).toBe(false);
    expect(second.playerBase!.pieces.filter(p => p.kind === 'training')).toHaveLength(1);
  });
});

describe('trainingCampSystem · treino', () => {
  const warrior = UNITS['warrior']!;
  const spearman = UNITS['spearman']!;

  it('trainTroop recusa sem o centro físico construído', () => {
    const base = cityWithWarCamp(warrior.minBuildingLevel);
    const result = trainTroop(base, freshBase(), warrior.id, NOW);
    expect(result.ok).toBe(false);
    expect(result.state.buildings.find(b => b.defId === 'war_camp')!.queue).toHaveLength(0);
  });

  it('trainTroop recusa unidade acima do nível do Campo de Guerra', () => {
    const playerBase = freshBase();
    const built = constructTrainingCamp(cityWithWarCamp(warrior.minBuildingLevel), playerBase, richBag(), NOW);
    expect(built.ok).toBe(true);
    // war_camp no nível do guerreiro (abaixo do nível do lanceiro) recusa o lanceiro.
    expect(spearman.minBuildingLevel).toBeGreaterThan(warrior.minBuildingLevel);

    const result = trainTroop(built.base, built.playerBase, spearman.id, NOW);
    expect(result.ok).toBe(false);
    expect(result.state.buildings.find(b => b.defId === 'war_camp')!.queue).toHaveLength(0);
  });

  it('trainTroop coloca a tropa liberada na fila do Campo de Guerra', () => {
    const playerBase = freshBase();
    const built = constructTrainingCamp(cityWithWarCamp(warrior.minBuildingLevel), playerBase, richBag(), NOW);
    expect(built.ok).toBe(true);

    const result = trainTroop(built.base, built.playerBase, warrior.id, NOW);
    expect(result.ok).toBe(true);
    const queue = result.state.buildings.find(b => b.defId === 'war_camp')!.queue;
    expect(queue).toHaveLength(1);
    expect(queue[0]!.unitId).toBe(warrior.id);
  });

  it('upgradeTrainingCamp recusa sem o centro físico construído', () => {
    const base = cityWithWarCamp(1);
    const result = upgradeTrainingCamp(base, freshBase(), NOW);
    expect(result.ok).toBe(false);
    expect(result.state.buildings.find(b => b.defId === 'war_camp')!.construction).toBeNull();
  });
});
