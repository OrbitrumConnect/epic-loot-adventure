import { afterEach, describe, expect, it } from 'vitest';
import { BASE_PIECES, BASE_TOWER_HEIGHT } from '../game/data/base-pieces';
import { BASE_TYPES } from '../game/data/base-types';
import { towerDamageMult } from '../game/data/base-upgrades';
import { resolveTowerLevel, towerHeight, towerLevelStats, towerUpgradeCost } from '../game/systems/towerLevelSystem';
import { placePieces, upgradeTower } from '../game/systems/playerBaseSystem';
import { createInventory, getItemCount } from '../game/systems/inventorySystem';
import { createLocalSave, parseLocalSave, restoreLocalSave } from '../game/systems/persistenceSystem';
import { selectTowerTarget, towerDamage } from '../game/systems/towerSystem';
import { useGameStore } from '../game/state/game-store';
import type { PlayerBaseState } from '../game/types/playerbase';
import type { CreatureState } from '../game/types';

const rich = () => createInventory(['wood', 'stone', 'iron_ore'].map(itemId => ({ itemId, quantity: 999 })));
const base = (): PlayerBaseState => ({
  id: 'b', owner: { kind: 'player', id: 'p', name: 'Teste' }, origin: { gx: 0, gz: 0 }, size: 5,
  worldPosition: { x: 5, z: 5 }, stage: 'towers', enclosed: false, claimedAt: 0, lastDamagedAt: null,
  pieces: [{ id: 'tower', kind: 'tower', cell: { gx: 0, gz: 0 }, tier: 1, rotation: 0,
    hp: BASE_PIECES.tower.hp[0] - 10, maxHp: BASE_PIECES.tower.hp[0] }],
});
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

describe('níveis de torre', () => {
  it('preserva âncoras e deriva níveis legados do tier', () => {
    for (const tier of [1, 2, 3] as const) {
      expect(resolveTowerLevel(tier)).toBe([1, 8, 15][tier - 1]);
      expect(towerLevelStats(tier)).toEqual({ hp: BASE_PIECES.tower.hp[tier - 1], ...BASE_PIECES.tower.combat![tier - 1] });
      expect(towerLevelStats(tier)).toBe(towerLevelStats(tier));
    }
  });
  it('interpola entre âncoras, extrapola até 20 e limita entradas', () => {
    const a = towerLevelStats(1, 8), b = towerLevelStats(1, 15);
    for (const level of [9, 12, 16, 20]) {
      const stats = towerLevelStats(1, level);
      for (const key of ['hp', 'range', 'damage'] as const) expect(stats[key]).toBeCloseTo(a[key] + (b[key] - a[key]) * (level - 8) / 7);
      expect(stats.cooldownMs).toBeCloseTo(Math.max(1, a.cooldownMs + (b.cooldownMs - a.cooldownMs) * (level - 8) / 7));
    }
    expect(resolveTowerLevel(2, NaN)).toBe(8);
    expect(resolveTowerLevel(1, -1)).toBe(1);
    expect(resolveTowerLevel(1, 99)).toBe(20);
    expect(resolveTowerLevel(1, 4.9)).toBe(4);
    expect(towerHeight(1)).toBe(BASE_TOWER_HEIGHT);
    expect(towerHeight(1, 20)).toBe(BASE_TOWER_HEIGHT * 1.5);
  });
  it('constrói nos níveis 1/8/15 mantendo custo, HP e tier', () => {
    for (const tier of [1, 2, 3] as const) {
      const state = { ...base(), pieces: [] };
      const result = placePieces(state, { cells: [{ gx: 1, gz: 1 }], kind: 'tower', cost: [], blocked: [], affordable: true }, rich(), 0, tier);
      expect(result.placed[0]).toMatchObject({ tier, level: resolveTowerLevel(tier), hp: BASE_PIECES.tower.hp[tier - 1] });
    }
  });
  it('upgrade cobra recursos, conserva dano, tipo e estágio; não altera original', () => {
    const state = base();
    state.baseType = 'fortress';
    state.pieces[0]!.maxHp = Math.round(BASE_PIECES.tower.hp[0] * BASE_TYPES.fortress.hp);
    state.pieces[0]!.hp = state.pieces[0]!.maxHp - 10;
    const inv = rich(), result = upgradeTower(state, 'tower', inv);
    expect(result.ok).toBe(true);
    const upgraded = result.base.pieces[0]!;
    expect(upgraded.maxHp).toBe(Math.round(towerLevelStats(1, 2).hp * BASE_TYPES.fortress.hp));
    expect(upgraded.maxHp - upgraded.hp).toBe(10);
    expect(upgraded).toMatchObject({ level: 2, tier: 1 });
    expect(result.base.stage).toBe(state.stage);
    expect(state.pieces[0]!.level).toBeUndefined();
    for (const cost of towerUpgradeCost(1, undefined, 'fortress')) expect(getItemCount(result.inventory, cost.itemId)).toBe(getItemCount(inv, cost.itemId) - cost.quantity);
    const normal = towerUpgradeCost(1, 7), discounted = towerUpgradeCost(1, 7, 'workshop');
    expect(discounted).toEqual(normal.map(c => ({ ...c, quantity: Math.max(1, Math.floor(c.quantity * BASE_TYPES.workshop.cost)) })));
  });
  it('recusa sem recursos, nível máximo, torre morta e peça errada sem cobrar', () => {
    for (const variant of ['poor', 'max', 'dead', 'wall', 'missing']) {
      const state = base();
      if (variant === 'max') state.pieces[0]!.level = 20;
      if (variant === 'dead') state.pieces[0]!.hp = 0;
      if (variant === 'wall') state.pieces[0]!.kind = 'wall';
      const inv = variant === 'poor' ? createInventory() : rich();
      const result = upgradeTower(state, variant === 'missing' ? 'absent' : 'tower', inv);
      expect(result.ok).toBe(false);
      expect(result.base).toBe(state);
      expect(result.inventory).toBe(inv);
    }
    expect(towerUpgradeCost(1, 20)).toEqual([]);
  });
  it('store aplica melhoria uma vez e mantém cartas', () => {
    useGameStore.setState({ playerBase: base(), player: { ...initial.player, inventory: rich() } });
    useGameStore.getState().upgradeTower('tower');
    expect(useGameStore.getState().playerBase!.pieces[0]!.level).toBe(2);
    expect(useGameStore.getState().baseUpgrades).toBe(initial.baseUpgrades);
  });
  it('save antigo continua carregando e novo preserva level validado', () => {
    const state = { ...initial, playerBase: base() };
    const old = parseLocalSave(JSON.stringify(createLocalSave(state)))!;
    expect(old).not.toBeNull();
    const restored = restoreLocalSave(old, initial, 100);
    expect(resolveTowerLevel(restored.playerBase!.pieces[0]!.tier, restored.playerBase!.pieces[0]!.level)).toBe(1);
    state.playerBase.pieces[0]!.level = 12;
    expect(parseLocalSave(JSON.stringify(createLocalSave(state)))!.playerBase!.pieces[0]!.level).toBe(12);
    state.playerBase.pieces[0]!.level = 21;
    expect(parseLocalSave(JSON.stringify(createLocalSave(state)))).toBeNull();
  });
  it('combate usa alcance, cooldown, dano do nível, bônus e origem elevada', () => {
    const tower = { id: 't', tier: 1 as const, level: 12, hp: 100, x: 0, z: 0, baseType: 'watchpost' as const };
    const stats = towerLevelStats(1, 12);
    const target: CreatureState = { id: 'wolf', speciesId: 'wolf', name: 'Lobo', hp: 1000, maxHp: 1000,
      armor: 0, attackPower: 1, attackCooldown: 1, lastAttackAt: 0, position: { x: stats.range * BASE_TYPES.watchpost.range, z: 0 }, behavior: 'idle', lootTable: [], respawnAt: null };
    expect(selectTowerTarget(tower, [target], 0, stats.cooldownMs - 1)).toBe(-1);
    expect(selectTowerTarget(tower, [target], 0, stats.cooldownMs)).toBe(0);
    useGameStore.setState({ creatures: [target], feedback: [], towerLastShotAt: {}, baseUpgrades: { ...initial.baseUpgrades, tower_damage: 2 } });
    useGameStore.getState().tickTowers([tower], 5000, () => 0.5);
    const result = useGameStore.getState();
    expect(result.creatures[0]!.hp).toBe(target.hp - towerDamage(tower, target, () => 0.5) * towerDamageMult(2));
    expect(result.feedback.find(e => e.kind === 'shot')!.sourceHeight).toBe(towerHeight(1, 12));
  });
});
