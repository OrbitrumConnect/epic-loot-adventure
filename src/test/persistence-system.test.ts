import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { useGameStore } from '../game/state/game-store';
import { connectLocalPersistence } from '../game/state/local-persistence';
import { createLocalSave, parseLocalSave, restoreLocalSave, SAVE_KEY, type PersistState } from '../game/systems/persistenceSystem';
import { createHarvestNodes } from '../game/systems/harvestSystem';
import { cellCenter, worldToCell } from '../game/systems/playerBaseSystem';
import type { PlayerBaseState } from '../game/types/playerbase';
import { weaponFor } from '../game/data/weapons';

function fresh(): PersistState {
  const s = useGameStore.getState();
  return { player: structuredClone(s.player), playerBase: null, towerLastShotAt: {},
    harvestNodes: createHarvestNodes(), resources: structuredClone(s.resources) };
}
function claimFor(state: PersistState): PlayerBaseState {
  const origin = worldToCell(state.harvestNodes[0]!.position);
  return {
    id: 'base-save', owner: { kind: 'player', id: 'player', name: 'Teste' }, origin, size: 1,
    worldPosition: cellCenter(origin), stage: 'towers', enclosed: false, claimedAt: 1, lastDamagedAt: null,
    pieces: [{ id: 'tower-save', kind: 'tower', cell: origin, tier: 2, rotation: 0, hp: 450, maxHp: 450 }],
  };
}
function memoryStorage(raw: string | null = null) {
  const values = new Map<string, string>();
  if (raw !== null) values.set(SAVE_KEY, raw);
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }),
  };
}
afterEach(() => vi.useRealTimers());

describe('save local v1', () => {
  it('reidratação do arco seleciona hotbar 8 e mantém perfil de combate ranged', () => {
    const state = { ...fresh(), ui: { ...useGameStore.getState().ui, selectedHotbar: 0 } };
    state.player.inventory.equipment.primary = 'bow';
    const slot = state.player.inventory.slots.findIndex(s => s.itemId === 'bow');
    expect(slot).toBeGreaterThanOrEqual(0);
    state.player.inventory.hotbar.slots[8] = slot;
    const save = parseLocalSave(JSON.stringify(createLocalSave(state)))!;
    const restored = restoreLocalSave(save, state, 1000);
    expect(restored.ui!.selectedHotbar).toBe(8);
    const selected = restored.player.inventory.hotbar.slots[restored.ui!.selectedHotbar]!;
    const held = restored.player.inventory.slots[selected!]!.itemId;
    const profile = weaponFor(held);
    expect(profile.ranged).toBe(true);
    expect(profile.range).toBe(weaponFor('bow').range);
  });
  it('roundtrip preserva progresso, equipamento, base, cooldown e apenas deltas de colheita', () => {
    const state = fresh();
    state.playerBase = claimFor(state);
    state.towerLastShotAt = { 'tower-save': 1000 };
    state.player.level = 4;
    state.player.xp = 17;
    state.player.attributes = { damage: 5, carry: 3, dexterity: 4, moveSpeed: 2 };
    state.player.inventory.equipment.primary = 'iron_sword';
    const harvested = state.harvestNodes[10]!;
    harvested.quantity = 0;
    harvested.depleted = true;
    harvested.respawnAt = 50000;
    const raw = JSON.stringify(createLocalSave(state));
    expect(raw).not.toContain('creatures');
    expect(raw).not.toContain('lastAttackAt');
    const save = parseLocalSave(raw)!;
    expect(save.harvest).toHaveLength(1);
    const restored = restoreLocalSave(save, fresh(), 2000);
    expect(createLocalSave(restored)).toEqual(save);
  });
  it('versão desconhecida e payload malformado são descartados sem exceção', () => {
    const valid = createLocalSave(fresh());
    for (const raw of [null, '{', 'null', '[]', JSON.stringify({ ...valid, v: 2 }),
      JSON.stringify({ ...valid, player: { ...valid.player, inventory: {} } }),
      JSON.stringify({ ...valid, towerLastShotAt: { broken: 'yesterday' } })]) {
      expect(parseLocalSave(raw)).toBeNull();
    }
    const storage = memoryStorage('{bad');
    const store = createStore(() => fresh());
    const before = store.getState();
    const connection = connectLocalPersistence(store, storage);
    expect(store.getState()).toBe(before);
    expect(storage.removeItem).toHaveBeenCalledWith(SAVE_KEY);
    connection.stop();
  });
  it('recria nós, respeita claim e renasce colheita vencida sem restaurar criaturas', () => {
    const initial = fresh();
    const base = claimFor(initial);
    const saved = createLocalSave({ ...initial, playerBase: base });
    const node = initial.harvestNodes[0]!;
    initial.resources = [{ id: 'inside', position: node.position, resourceId: 'wood',
      quantity: 3, maxQuantity: 3, depleted: false, respawnAt: null }];
    const expired = initial.harvestNodes[10]!;
    saved.harvest = [{ id: expired.id, quantity: 0, depleted: true, respawnAt: 100 }];
    const restored = restoreLocalSave(saved, initial, 2000);
    expect(restored.harvestNodes.some(n => n.id === node.id)).toBe(false);
    expect(restored.resources).toEqual([]);
    expect(restored.harvestNodes.find(n => n.id === expired.id)?.quantity).toBe(expired.maxQuantity);
    expect(restored).not.toHaveProperty('creatures');
  });
  it('hidrata sincronamente e preserva criaturas já recriadas pela inicialização', () => {
    const save = createLocalSave(fresh());
    save.player.gold = 999;
    const creatures = [{ id: 'fresh-creature' }];
    const store = createStore(() => ({ ...fresh(), creatures }));
    const connection = connectLocalPersistence(store, memoryStorage(JSON.stringify(save)));
    expect(store.getState().player.gold).toBe(999);
    expect(store.getState().creatures).toBe(creatures);
    connection.stop();
  });
  it('debounce de 2 s ignora posição/HP e descarrega a última mudança ao sair', () => {
    vi.useFakeTimers();
    const store = createStore(() => fresh());
    const storage = memoryStorage();
    const connection = connectLocalPersistence(store, storage);
    store.setState(s => ({ player: { ...s.player, gold: 500 } }));
    vi.advanceTimersByTime(1500);
    store.setState(s => ({ player: { ...s.player, position: { x: 15, z: 10 }, hp: 40 } }));
    vi.advanceTimersByTime(500);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    store.setState(s => ({ player: { ...s.player, gold: 600 } }));
    vi.advanceTimersByTime(1000);
    store.setState(s => ({ player: { ...s.player, gold: 700 } }));
    vi.advanceTimersByTime(1500);
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    connection.flush();
    expect(parseLocalSave(storage.getItem(SAVE_KEY))?.player.gold).toBe(700);
    connection.stop();
    vi.advanceTimersByTime(20000);
    expect(storage.setItem).toHaveBeenCalledTimes(2);
  });
  it('save contínuo não fica adiado para sempre; quota/storage bloqueado não derruba o jogo', () => {
    vi.useFakeTimers();
    const store = createStore(() => fresh());
    const storage = memoryStorage();
    const connection = connectLocalPersistence(store, storage);
    for (let i = 1; i <= 11; i++) {
      store.setState({ towerLastShotAt: { tower: i } });
      vi.advanceTimersByTime(1000);
    }
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    storage.setItem.mockImplementation(() => { throw new Error('QuotaExceededError'); });
    expect(() => connection.flush()).not.toThrow();
    expect(() => connection.stop()).not.toThrow();
    const blocked = memoryStorage();
    blocked.getItem.mockImplementation(() => { throw new Error('SecurityError'); });
    const second = connectLocalPersistence(store, blocked);
    second.stop();
  });
});
