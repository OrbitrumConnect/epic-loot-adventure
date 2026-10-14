import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '../game/state/game-store';
import { claimBase, checkClaim, cellCenter, placePieces, previewLine } from '../game/systems/playerBaseSystem';
import { createInventory, getItemCount } from '../game/systems/inventorySystem';
import { basePieceCost } from '../game/systems/baseTypeSystem';
import { BASE_PIECES, pieceMaxHp } from '../game/data/base-pieces';
import { baseLv1Layout } from '../game/systems/baseLv1';
import { selectTowerTarget } from '../game/systems/towerSystem';
import { createLocalSave, parseLocalSave, restoreLocalSave } from '../game/systems/persistenceSystem';
import type { BaseType, GridCell } from '../game/types/playerbase';
import type { CreatureState } from '../game/types';

const initial = useGameStore.getState();
const origin = (() => {
  for (let gz = -40; gz <= 30; gz += 2) for (let gx = -40; gx <= 30; gx += 2) {
    if (checkClaim({ gx, gz }, 11, { bases: [] }, 0).ok) return { gx, gz };
  }
  throw new Error('nenhum terreno livre');
})();
const freshBase = (type?: BaseType) => claimBase(origin, 11, { kind: 'player', id: 'p', name: 'Teste' }, { bases: [] }, 0, type).base!;
const rich = () => createInventory([{ itemId: 'wood', quantity: 500 }, { itemId: 'stone', quantity: 500 }]);
afterEach(() => useGameStore.setState(initial, true));

describe('tipos de base', () => {
  it('Fortaleza fortalece cama e peças construídas em 25%', () => {
    const base = freshBase('fortress');
    // Derivado da tabela: o Pedro reequilibra esses numeros, e o teste
    // precisa provar o bonus de 25%, nao decorar o HP da peca.
    expect(base.pieces[0]!.hp).toBe(Math.round(pieceMaxHp('core', 1) * 1.25));
    const at = cellCenter(origin);
    const result = placePieces(base, previewLine(at, at, 'tower', base, rich()), rich(), 0);
    expect(result.placed[0]!.hp).toBe(250);
    expect(result.placed[0]!.maxHp).toBe(250);
  });
  it('Oficina preview e cobrança concordam; cobrança ignora custo adulterado', () => {
    const base = freshBase('workshop');
    const at = cellCenter(origin);
    const inv = createInventory([{ itemId: 'wood', quantity: 4 }, { itemId: 'stone', quantity: 3 }]);
    const preview = previewLine(at, at, 'tower', base, inv);
    expect(preview.affordable).toBe(true);
    expect(preview.cost).toEqual([{ itemId: 'wood', quantity: 4 }, { itemId: 'stone', quantity: 3 }]);
    const placed = placePieces(base, { ...preview, cost: [] }, inv, 0);
    expect(placed.ok).toBe(true);
    expect(getItemCount(placed.inventory, 'wood')).toBe(0);
    expect(getItemCount(placed.inventory, 'stone')).toBe(0);
    expect(placePieces(freshBase(), preview, inv, 0).ok).toBe(false);
    expect(basePieceCost('door', 1, 'workshop')[0]!.quantity).toBe(2);
  });
  it('Atalaia alcança hostil que a torre comum não alcança', () => {
    // Alcance comum do tier 1, lido da tabela. O inimigo fica 1 m alem dele:
    // fora para a torre comum, dentro para a Atalaia (+20%).
    const PLAIN_RANGE = BASE_PIECES.tower.combat![0]!.range;
    const enemy: CreatureState = { id: 'wolf', speciesId: 'wolf', name: 'Lobo', hp: 80, maxHp: 80,
      armor: 2, attackPower: 8, attackCooldown: 1, lastAttackAt: 0, position: { x: PLAIN_RANGE + 1, z: 0 },
      behavior: 'idle', lootTable: [], respawnAt: null };
    const tower = { id: 'tower', x: 0, z: 0, tier: 1 as const, hp: 200 };
    expect(selectTowerTarget(tower, [enemy], undefined, 0)).toBe(-1);
    expect(selectTowerTarget({ ...tower, baseType: 'watchpost' }, [enemy], undefined, 0)).toBe(0);
  });
  it('entrega automática usa os mesmos bônus e cobra cada peça uma vez', () => {
    for (const type of ['fortress', 'workshop'] as const) {
      const base = freshBase(type);
      useGameStore.setState({ playerBase: base, player: { ...initial.player, inventory: rich() } });
      useGameStore.getState().deliverToBase();
      const state = useGameStore.getState();
      const layout = baseLv1Layout(origin, 11);
      const woodCost = layout.reduce((sum, p) => sum + (basePieceCost(p.kind, p.tier, type).find(c => c.itemId === 'wood')?.quantity ?? 0), 0);
      expect(getItemCount(state.player.inventory, 'wood')).toBe(500 - woodCost);
      expect(state.playerBase!.stage).toBe('clash');
      expect(state.playerBase!.pieces.find(p => p.kind === 'tower')!.hp).toBe(type === 'fortress' ? 250 : 200);
    }
  });
  it('seleção vale no claim e fica bloqueada após reivindicar', () => {
    useGameStore.setState({ playerBase: null });
    useGameStore.getState().selectBaseType('watchpost');
    useGameStore.getState().claimBase(origin as GridCell);
    expect(useGameStore.getState().playerBase!.baseType).toBe('watchpost');
    useGameStore.getState().selectBaseType('workshop');
    expect(useGameStore.getState().selectedBaseType).toBe('watchpost');
  });
  it('save mantém tipo e v1 sem tipo conserva custos e HP originais', () => {
    const save = createLocalSave({ ...initial, playerBase: freshBase('workshop') });
    const parsed = parseLocalSave(JSON.stringify(save))!;
    expect(restoreLocalSave(parsed, initial, 1000).playerBase!.baseType).toBe('workshop');
    delete save.playerBase!.baseType;
    const legacy = parseLocalSave(JSON.stringify(save))!;
    const restored = restoreLocalSave(legacy, initial, 1000).playerBase!;
    expect(restored.baseType).toBeUndefined();
    const at = cellCenter(origin);
    const preview = previewLine(at, at, 'tower', restored, rich());
    expect(preview.cost[0]!.quantity).toBe(6);
    expect(placePieces(restored, preview, rich(), 0).placed[0]!.hp).toBe(200);
  });
});
