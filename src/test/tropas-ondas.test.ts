import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import {
  TROOP_FIELD_CAP, TROOP_STATS, deployTroops, stepTroops, troopScale, type TroopFoe,
} from '@/game/systems/troopSystem';

/* Pedro, 23/10 — tropas nas ondas (etapa 1): saem na horda, lutam com as torres, morta sai da contagem. */
const C = { x: 0, z: 0 };
const foe = (id: string, x: number, z = 0, hp = 100): TroopFoe => ({ id, position: { x, z }, hp, attackPower: 20, attackCooldown: 2 });

describe('tropas nas ondas', () => {
  it('Campo de Guerra nível 7 = ×1,48 (vida e dano)', () => {
    expect(troopScale(1)).toBe(1);
    expect(troopScale(7)).toBeCloseTo(1.48, 5);
  });

  it('sai no máximo 12 em campo; tanque (lanceiro) primeiro; vida escalada', () => {
    const { field } = deployTroops({ warrior: 10, spearman: 4, archer: 7 }, [], C, 7, 0);
    expect(field).toHaveLength(TROOP_FIELD_CAP);
    expect(field.slice(0, 4).every(t => t.unitId === 'spearman')).toBe(true);
    expect(field[0]!.maxHp).toBe(Math.round(420 * 1.48));
  });

  it('não sai quem não existe; completa o campo quando uma cai', () => {
    const a = deployTroops({ warrior: 2 }, [], C, 1, 0);
    expect(a.field).toHaveLength(2);
    const b = deployTroops({ warrior: 3 }, a.field.slice(1), C, 1, a.seq);
    expect(b.field).toHaveLength(3);
  });

  it('anda até o inimigo, golpeia no alcance e no ritmo', () => {
    let { field } = deployTroops({ warrior: 1 }, [], C, 1, 0);
    const f = [foe('lobo', 10)];
    for (let i = 0; i < 80; i++) field = stepTroops(field, f, C, 1, 0.05, i * 50).field;
    const t = field[0]!;
    expect(Math.hypot(t.x - 10, t.z)).toBeLessThanOrEqual(TROOP_STATS.warrior.range);
    const r1 = stepTroops(field, f, C, 1, 0.05, 10_000);
    expect(r1.hits).toEqual([{ creatureId: 'lobo', damage: 16 }]);
    const r2 = stepTroops(r1.field, f, C, 1, 0.05, 10_100); // dentro da cadência
    expect(r2.hits).toHaveLength(0);
  });

  it('arqueiro atira de longe (sem chegar perto)', () => {
    const { field } = deployTroops({ archer: 1 }, [], C, 1, 0);
    const t = field[0]!;
    const f = [foe('lobo', t.x + 12, t.z)];
    const r = stepTroops(field, f, C, 1, 0.05, 5000);
    expect(r.hits).toHaveLength(1);
  });

  it('ignora inimigo fora da área da base; sem inimigo volta pro posto', () => {
    const { field } = deployTroops({ warrior: 1 }, [], C, 1, 0);
    const longe = stepTroops(field, [foe('longe', 60)], C, 1, 0.05, 1000);
    expect(longe.hits).toHaveLength(0);
    expect(longe.field[0]!.action).toBe('idle');
  });

  it('bicho colado bate; tropa que zera morre (sai do campo)', () => {
    let { field } = deployTroops({ archer: 1 }, [], C, 1, 0);
    const t = field[0]!;
    const f = [foe('brute', t.x + 1, t.z)];
    let dead = 0;
    for (let i = 0; i < 400 && field.length; i++) {
      const r = stepTroops(field, f, C, 1, 0.05, i * 50);
      field = r.field; dead += r.dead.length;
    }
    expect(dead).toBe(1);
    expect(field).toHaveLength(0);
  });
});


describe('tropas nas ondas — na store', () => {
  const initial = useGameStore.getState();
  afterEach(() => useGameStore.setState(initial, true));
  const base = {
    id: 'b', owner: { kind: 'player', id: 'p', name: 'T' }, worldPosition: { x: 0, z: 0 }, origin: { gx: 0, gz: 0 }, size: 11,
    stage: 'clash', enclosed: true, claimedAt: 0, lastDamagedAt: null,
    pieces: [{ id: 'core', kind: 'core', cell: { gx: 5, gz: 5 }, rotation: 0, hp: 500, maxHp: 500, tier: 1 }],
  } as never;
  const lobo = (hp: number) => ({ id: 'wave1_lobo', speciesId: 'raider_brute', name: 'Brutamonte', hp, maxHp: hp, armor: 0, attackPower: 22,
    attackCooldown: 2.4, lastAttackAt: 0, position: { x: 13, z: 11 }, behavior: 'chase', lootTable: [], respawnAt: null } as never);

  it('horda: sai, bate no bicho (mesmo caminho da torre); acabou a onda: volta (contagem intacta)', () => {
    useGameStore.setState(s => ({
      playerBase: base, wave: { ...s.wave, phase: 'combat' },
      base: { ...s.base, troops: { warrior: 2 } }, creatures: [lobo(100)],
    }));
    let t = 100_000;
    for (let i = 0; i < 200; i++) useGameStore.getState().tickTroops((t += 50), 0.05);
    const st = useGameStore.getState();
    expect(st.fieldTroops.length).toBeGreaterThan(0);
    expect(st.creatures.find(c => c.id === 'wave1_lobo')!.hp).toBeLessThan(100);
    useGameStore.setState(s => ({ wave: { ...s.wave, phase: 'peace' } }));
    useGameStore.getState().tickTroops(t + 50, 0.05);
    expect(useGameStore.getState().fieldTroops).toHaveLength(0);
    expect(useGameStore.getState().base.troops['warrior']).toBe(2);
  });

  it('tropa que morre SAI da contagem', () => {
    useGameStore.setState(s => ({
      playerBase: base, wave: { ...s.wave, phase: 'combat' },
      base: { ...s.base, troops: { archer: 1 } }, creatures: [lobo(1e9)],
    }));
    // põe o bicho colado no arqueiro e deixa bater
    useGameStore.getState().tickTroops(1000, 0.05);
    const a = useGameStore.getState().fieldTroops[0]!;
    useGameStore.setState(s => ({ creatures: s.creatures.map(c => ({ ...c, position: { x: a.x + 1, z: a.z } })) }));
    let t = 1000;
    for (let i = 0; i < 600 && useGameStore.getState().fieldTroops.length; i++) useGameStore.getState().tickTroops((t += 50), 0.05);
    expect(useGameStore.getState().base.troops['archer']).toBe(0);
    expect(useGameStore.getState().ui.message).toMatch(/caiu defendendo a base/);
  });
});
