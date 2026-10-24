import { afterEach, describe, expect, it } from 'vitest';
import { createInitialBase, tickBase } from '@/game/systems/baseSystem';
import { useGameStore } from '@/game/state/game-store';
import { createLocalSave, parseLocalSave, restoreLocalSave } from '@/game/systems/persistenceSystem';
import type { BaseState } from '@/game/types/base';

/* Pedro, 24/10 (nv 113, sem base no chão): "o armazém continua lá juntando". Regra nova: SEM BASE NO CHÃO a
   cidade NÃO produz — o relógio anda (obra/treino terminam), mas nada acumula pra quando a base voltar.
   Assim a queda da base pesa de verdade: os 25% perdidos não voltam sozinhos em 10 min. */
const T0 = 1_800_000_000_000;
const MIN = 60_000;
function cityWithLumber(at: number): BaseState {
  const b = createInitialBase(at);
  return { ...b, buildings: [...b.buildings, { id: 'b2', defId: 'lumber_camp', level: 3, plotIndex: 6, construction: null, queue: [] }] };
}
const fakeBase = { id: 'pb', pieces: [] } as never;
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

describe('cidade sem base no chão não produz', () => {
  it('tickBase puro: com produção sobe; sem produção fica igual, mas o relógio anda', () => {
    const city = cityWithLumber(T0);
    const on = tickBase(city, T0 + MIN);
    const off = tickBase(city, T0 + MIN, false);
    expect(on.resources.wood).toBeGreaterThan(city.resources.wood);
    expect(off.resources).toEqual(city.resources);
    expect(off.lastTickAt).toBe(T0 + MIN);
  });

  it('sem produção, a obra em andamento TERMINA igual (só o recurso para)', () => {
    const city = cityWithLumber(T0);
    const job = { targetLevel: 4, startedAt: T0, endsAt: T0 + MIN / 2, durationMs: MIN / 2, order: 9 };
    const building = { ...city.buildings[1]!, construction: job };
    const withJob = { ...city, buildings: [city.buildings[0]!, building] } as BaseState;
    const off = tickBase(withJob, T0 + MIN, false);
    expect(off.buildings[1]!.level).toBe(4);
    expect(off.buildings[1]!.construction).toBeNull();
    expect(off.resources.wood).toBe(city.resources.wood);
  });

  it('store: sem base o armazém fica parado; com base volta a produzir', () => {
    const now = Date.now();
    useGameStore.setState({ base: cityWithLumber(now - MIN), playerBase: null });
    useGameStore.getState().tickBase();
    expect(useGameStore.getState().base.resources.wood).toBe(300);
    useGameStore.setState((s) => ({ base: { ...s.base, lastTickAt: Date.now() - MIN }, playerBase: fakeBase }));
    useGameStore.getState().tickBase();
    expect(useGameStore.getState().base.resources.wood).toBeGreaterThan(300);
  });

  it('tempo FORA do jogo (carregar o save): sem base não acumula; com base acumula', () => {
    const st = useGameStore.getState();
    const now = Date.now();
    const blob = createLocalSave({ ...st, base: cityWithLumber(now - 10 * MIN) }) as unknown as Record<string, unknown>;
    const semBase = restoreLocalSave(parseLocalSave(JSON.stringify({ ...blob, playerBase: null }))!, st, now);
    expect(semBase.base.resources.wood).toBe(300);
    const pb = { id: 'base_player_1', size: 11, owner: { id: 'player_1', kind: 'player', name: 'T' }, stage: 'clash',
      origin: { gx: 0, gz: 0 }, pieces: [{ hp: 500, id: 'c', cell: { gx: 5, gz: 5 }, kind: 'core', tier: 1, maxHp: 500, rotation: 0 }],
      baseType: 'fortress', enclosed: true, claimedAt: now - 20 * MIN, lastDamagedAt: null, worldPosition: { x: 0, z: 0 } };
    const comBase = restoreLocalSave(parseLocalSave(JSON.stringify({ ...blob, playerBase: pb }))!, st, now);
    expect(comBase.base.resources.wood).toBeGreaterThan(300);
  });
});
