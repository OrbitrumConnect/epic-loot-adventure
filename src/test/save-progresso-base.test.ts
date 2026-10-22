import { describe, expect, it } from 'vitest';
import { useGameStore } from '../game/state/game-store';
import { createLocalSave, parseLocalSave, restoreLocalSave, type PersistState } from '../game/systems/persistenceSystem';
import { createHarvestNodes } from '../game/systems/harvestSystem';
import { createInitialBase } from '../game/systems/baseSystem';
import { cellCenter, worldToCell } from '../game/systems/playerBaseSystem';
import type { PlayerBaseState } from '../game/types/playerbase';

/* O save não gravava onda / casa de pedra / casa de metal / cartas / estatísticas → recarregar
   zerava tudo e a casa de METAL (onda ≥ 8) ficava impossível (Pedro, 21–22/10). */

function base(): PlayerBaseState {
  const origin = worldToCell(createHarvestNodes()[0]!.position);
  return {
    id: 'b', owner: { kind: 'player', id: 'player', name: 'T' }, origin, size: 1, worldPosition: cellCenter(origin),
    stage: 'enclosed', enclosed: true, claimedAt: 1, lastDamagedAt: null,
    pieces: [{ id: 'core', kind: 'core', cell: origin, tier: 1, rotation: 0, hp: 100, maxHp: 100 }],
  };
}
function state(over: Partial<PersistState>): PersistState {
  const s = useGameStore.getState();
  return {
    base: createInitialBase(1000), player: structuredClone(s.player), playerBase: base(), towerLastShotAt: {},
    harvestNodes: createHarvestNodes(), resources: structuredClone(s.resources),
    wave: { phase: 'peace', wave: 9, phaseEndsAt: 10_000_000, spawnPending: 0 },
    baseLevel: 2, baseEvolved: true, baseMetal: false,
    stats: { basesEvolved: 1, basesLost: 2, survivalStart: 123 },
    baseUpgrades: { tower_damage: 2, wall_hp: 1, base_repair: 0, core_hp: 0, orbit_boomerang: 1, tornado: 0 },
    orbitExpiresWave: 11, tornadoExpiresWave: 0,
    ...over,
  };
}
/** Mesmo caminho do jogo: grava → texto (localStorage / player_saves) → valida → restaura. */
function roundTrip(s: PersistState, now = 1_000_000) {
  const parsed = parseLocalSave(JSON.stringify(createLocalSave(s)));
  expect(parsed).not.toBeNull();
  return restoreLocalSave(parsed!, s, now);
}

describe('save grava o progresso da base e das hordas', () => {
  it('onda, casa de pedra, cartas e estatísticas sobrevivem ao recarregar', () => {
    const r = roundTrip(state({}));
    expect(r.wave).toEqual({ phase: 'peace', wave: 9, phaseEndsAt: 10_000_000, spawnPending: 0 });
    expect(r.baseEvolved).toBe(true);
    expect(r.baseMetal).toBe(false);
    expect(r.baseLevel).toBe(2);
    expect(r.baseUpgrades).toMatchObject({ tower_damage: 2, wall_hp: 1, orbit_boomerang: 1 });
    expect(r.stats).toEqual({ basesEvolved: 1, basesLost: 2, survivalStart: 123 });
    expect(r.orbitExpiresWave).toBe(11);
  });

  it('casa de METAL fica de metal', () => {
    expect(roundTrip(state({ baseMetal: true })).baseMetal).toBe(true);
  });

  it('recarregar em COMBATE: volta pra paz da MESMA onda (horda não é salva, sem carta grátis)', () => {
    const r = roundTrip(state({ wave: { phase: 'combat', wave: 8, phaseEndsAt: 0, spawnPending: 3 } }), 1_000_000);
    expect(r.wave!.phase).toBe('peace');
    expect(r.wave!.wave).toBe(7); // a próxima a vir é a 8 de novo
    expect(r.wave!.phaseEndsAt).toBeGreaterThan(1_000_000);
    expect(r.wave!.spawnPending).toBe(0);
  });

  it('paz que já venceu enquanto estava fora: dá 1 min antes da próxima', () => {
    const r = roundTrip(state({ wave: { phase: 'peace', wave: 4, phaseEndsAt: 5, spawnPending: 0 } }), 1_000_000);
    expect(r.wave).toEqual({ phase: 'peace', wave: 4, phaseEndsAt: 1_060_000, spawnPending: 0 });
  });

  it('sem base no chão: evolução não volta (regra da base caída) e onda zera', () => {
    const r = roundTrip(state({ playerBase: null, baseMetal: true }));
    expect(r.baseEvolved).toBe(false);
    expect(r.baseMetal).toBe(false);
    expect(r.wave!.phase).toBe('idle');
  });

  it('save ANTIGO (sem progresso) continua abrindo e não mexe nesses campos', () => {
    const old = createLocalSave(state({}));
    delete (old as { progress?: unknown }).progress;
    const parsed = parseLocalSave(JSON.stringify(old));
    expect(parsed).not.toBeNull();
    const r = restoreLocalSave(parsed!, state({}), 1);
    expect('baseMetal' in r).toBe(false);
    expect('wave' in r).toBe(false);
  });
});
