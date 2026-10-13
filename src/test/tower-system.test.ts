import { describe, expect, it, afterEach } from 'vitest';
import { selectTowerTarget, towerDamage, type TowerSource } from '../game/systems/towerSystem';
import { calculateDamage } from '../game/systems/combatSystem';
import { BASE_PIECES, BASE_TOWER_HEIGHT } from '../game/data/base-pieces';
import { useGameStore } from '../game/state/game-store';
import type { CreatureState } from '../game/types';

const tower: TowerSource = { id: 'tower-1', x: 0, z: 0, tier: 1, hp: 200 };
const creature = (id: string, x: number, hp = 100): CreatureState => ({
  id, speciesId: 'wolf', name: 'Lobo', hp, maxHp: 100, armor: 2,
  attackPower: 8, attackCooldown: 1.5, lastAttackAt: 0, position: { x, z: 0 },
  behavior: 'idle', lootTable: [], respawnAt: null,
});

describe('towerSystem', () => {
  it('prefere o mais próximo e desempata pelo menor HP', () => {
    const enemies = [creature('far', 8, 1), creature('near', 3), creature('weak', -3, 30)];
    expect(selectTowerTarget(tower, enemies, undefined, 0)).toBe(2);
  });
  it('respeita o cooldown inclusive o primeiro disparo no instante zero', () => {
    const enemies = [creature('a', 1)];
    const cd = BASE_PIECES.tower.combat![0].cooldownMs;
    expect(selectTowerTarget(tower, enemies, undefined, 0)).toBe(0);
    expect(selectTowerTarget(tower, enemies, 0, cd - 1)).toBe(-1);
    expect(selectTowerTarget(tower, enemies, 0, cd)).toBe(0);
  });
  it('ignora fora de alcance e inclui exatamente a borda', () => {
    const range = BASE_PIECES.tower.combat![0].range;
    expect(selectTowerTarget(tower, [creature('a', range + 0.01)], undefined, 0)).toBe(-1);
    expect(selectTowerTarget(tower, [creature('a', range)], undefined, 0)).toBe(0);
  });
  it('ignora mortos, respawn, espécies pacíficas/desconhecidas e torre destruída', () => {
    const enemies = [
      { ...creature('a', 1), behavior: 'dead' as const },
      creature('b', 1, 0),
      { ...creature('c', 1), behavior: 'respawning' as const },
      { ...creature('d', 1), respawnAt: 1000 },
      { ...creature('e', 1), speciesId: 'deer' },
      { ...creature('f', 1), speciesId: 'unknown' },
    ];
    expect(selectTowerTarget(tower, enemies, undefined, 0)).toBe(-1);
    expect(selectTowerTarget({ ...tower, hp: 0 }, [creature('a', 1)], undefined, 0)).toBe(-1);
  });
  it('usa calculateDamage por tier sem alterar os argumentos', () => {
    const enemy = creature('a', 1);
    const before = JSON.stringify(enemy);
    for (const tier of [1, 2, 3] as const) {
      expect(towerDamage({ ...tower, tier }, enemy, () => 0.5))
        .toBe(calculateDamage(BASE_PIECES.tower.combat![tier - 1]!.damage, enemy.armor, () => 0.5));
    }
    expect(JSON.stringify(enemy)).toBe(before);
  });
});

describe('torres integradas à store', () => {
  const initial = useGameStore.getState();
  afterEach(() => useGameStore.setState(initial, true));

  it('mata uma vez, cria loot/respawn e emite tiro do topo', () => {
    useGameStore.setState({ creatures: [creature('victim', 2, 1)], deathBags: [], feedback: [], towerLastShotAt: {} });
    useGameStore.getState().tickTowers([tower, { ...tower, id: 'tower-2' }], 5000, () => 0);
    const state = useGameStore.getState();
    expect(state.creatures[0]!.behavior).toBe('dead');
    expect(state.creatures[0]!.respawnAt).toBeGreaterThan(5000);
    expect(state.deathBags).toHaveLength(1);
    expect(state.deathBags[0]!.ownerId).toBe('victim');
    const shots = state.feedback.filter(e => e.kind === 'shot');
    expect(shots).toHaveLength(1);
    expect(shots[0]!.sourceHeight).toBe(BASE_TOWER_HEIGHT);
    expect(state.towerLastShotAt).toEqual({ 'tower-1': 5000 });
  });
  it('cooldown independente e quadros sem tiro não escrevem na store', () => {
    useGameStore.setState({ creatures: [creature('victim', 2, 1000)], feedback: [], towerLastShotAt: {} });
    const pair = [tower, { ...tower, id: 'tower-2' }];
    useGameStore.getState().tickTowers(pair, 5000, () => 0.5);
    const afterShot = useGameStore.getState();
    expect(afterShot.towerLastShotAt).toEqual({ 'tower-1': 5000, 'tower-2': 5000 });
    afterShot.tickTowers(pair, 5001, () => 0.5);
    expect(useGameStore.getState()).toBe(afterShot);
  });
});
