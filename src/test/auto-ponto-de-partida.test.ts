import { afterEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { decideIntent } from '@/game/systems/objectiveSystem';
import type { AutoSnapshot } from '@/game/types';

/* Pedro, 23/10 — lógica do automático:
   liga num ponto → vai "somando" de bicho em bicho (raio a partir de onde ESTÁ) → acabou tudo em volta
   → VOLTA pro ponto de partida e espera renascer. Farm de recurso segue normal. Na HORDA: volta pra
   base e defende lá. */
const initial = useGameStore.getState();
afterEach(() => useGameStore.setState(initial, true));

const P = { x: 60, z: 0 };
const snap = (extra: Partial<AutoSnapshot> = {}) => ({
  playerPosition: P, playerHp: 100, playerMaxHp: 100, playerDead: false, healSlot: null,
  creatures: [], camps: [], resources: [], objectives: { items: [], seq: 0, mode: 'idle', repeat: false },
  homePosition: { x: 7, z: -26 }, autoHuntRadius: 45, gatherCapacity: true,
  ...extra,
}) as unknown as AutoSnapshot;
const lobo = (id: string, x: number, z = 0) => ({ id, position: { x, z }, behavior: 'patrol', hp: 10, hostile: true, level: 1 });

describe('automático: ponto de partida', () => {
  it('acabou tudo em volta → volta pro ponto onde ligou', () => {
    const i = decideIntent(snap({ autoAnchor: { x: 0, z: 0 } }), 0);
    expect(i).toMatchObject({ kind: 'move', to: { x: 0, z: 0 } });
    if (i.kind === 'move') expect(i.reason).toMatch(/ponto de partida/);
  });

  it('tem bicho a até 45 m de ONDE ESTÁ → vai nele ("somando"), não volta', () => {
    const i = decideIntent(snap({ autoAnchor: { x: 0, z: 0 }, creatures: [lobo('frente', 95)] as never }), 0);
    expect(i.kind === 'attack' ? i.creatureId : i.kind === 'move' ? i.reason : i.kind).not.toMatch(/ponto de partida/);
    if (i.kind === 'move') expect(i.to.x).toBe(95);
  });

  it('FARM de recurso com espaço na bolsa segue normal (vem antes da volta)', () => {
    const i = decideIntent(snap({
      autoAnchor: { x: 0, z: 0 },
      resources: [{ id: 'arv', position: { x: 62, z: 0 }, depleted: false, kind: 'tree', range: 3.2, canCollect: true }],
    }), 0);
    expect(i.kind).toBe('gather');
  });

  it('já no ponto de partida e nada em volta → espera ali (idle)', () => {
    expect(decideIntent(snap({ autoAnchor: { x: 61, z: 0 } }), 0).kind).toBe('idle');
  });

  it('sem ponto marcado (comportamento antigo) → fica onde está', () => {
    expect(decideIntent(snap(), 0).kind).toBe('idle');
  });

  it('ligar marca o ponto; desligar esquece', () => {
    useGameStore.setState(s => ({ player: { ...s.player, position: { x: 12, z: 34 } } }));
    useGameStore.getState().setAutoMode('idle');
    expect(useGameStore.getState().pilotAnchor).toEqual({ x: 12, z: 34 });
    expect(useGameStore.getState().buildAutoSnapshot().autoAnchor).toEqual({ x: 12, z: 34 });
    useGameStore.getState().setAutoMode('manual');
    expect(useGameStore.getState().pilotAnchor).toBeNull();
  });
});

describe('automático na HORDA', () => {
  const base = { x: 0, z: 0 };
  it('longe da base e sem inimigo perto → volta pra base', () => {
    const i = decideIntent(snap({ baseUnderSiege: true, baseCenter: base, autoAnchor: { x: 80, z: 0 } }), 0);
    expect(i).toMatchObject({ kind: 'move', to: base });
  });
  it('inimigo atacando a base → vai defender (mesmo longe)', () => {
    const i = decideIntent(snap({ baseUnderSiege: true, baseCenter: base, creatures: [lobo('horda', 5)] as never }), 0);
    expect(i.kind === 'attack' || (i.kind === 'move' && i.reason === 'Defendendo a base')).toBe(true);
  });
  it('na base e sem inimigo → guarda a base (não sai caçando longe)', () => {
    const i = decideIntent(snap({ playerPosition: { x: 2, z: 0 }, baseUnderSiege: true, baseCenter: base, creatures: [lobo('longe', 44)] as never }), 0);
    expect(i.kind).toBe('idle');
  });
  it('sem base (sem núcleo) → igual antes', () => {
    const i = decideIntent(snap({ baseUnderSiege: true }), 0);
    expect(i.kind).toBe('idle');
  });
});
