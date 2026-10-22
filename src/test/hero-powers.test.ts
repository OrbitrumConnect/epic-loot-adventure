import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore, INITIAL_HERO_POWERS } from '../game/state/game-store';
import { CREATURES } from '../game/data/creatures';
import {
  BOOMERANG_R0, BOOMERANG_R1, HERO_POWER_UNLOCK, TORNADO_RANGE, boomerangSpiralRadius,
  heroPowerCooldown, heroTornadoPositions, pushAway,
} from '../game/systems/heroPowersSystem';
import { pendingKnockback } from '../game/systems/knockbackSystem';
import type { CreatureState } from '../game/types';

const hostileTemplate = (): CreatureState => {
  const c = useGameStore.getState().creatures.find((x) => !CREATURES[x.speciesId]?.peaceful && x.behavior !== 'dead');
  if (!c) throw new Error('sem hostil no estado inicial');
  return c;
};

function setup(level: number, foes: { id: string; x: number; z: number }[]) {
  const t = hostileTemplate();
  useGameStore.setState((s) => ({
    heroPowers: INITIAL_HERO_POWERS,
    player: { ...s.player, level, dead: false, position: { x: 0, z: 0 } },
    creatures: foes.map((f) => ({ ...t, id: f.id, hp: 5000, maxHp: 5000, behavior: 'patrol' as const, position: { x: f.x, z: f.z } })),
  }));
}

describe('poderes do herói — regras puras', () => {
  it('desbloqueio: bumerangue 10, furacão 15, raio 20', () => {
    expect(HERO_POWER_UNLOCK).toEqual({ boomerang: 10, tornado: 15, lightning: 20 });
  });
  it('cooldown cai com o nível (igual à Chuva)', () => {
    expect(heroPowerCooldown('tornado', 1)).toBeGreaterThan(heroPowerCooldown('tornado', 200));
  });
  it('bumerangue abre em espiral do corpo (~1,5 m) até ~10 m', () => {
    expect(boomerangSpiralRadius(0)).toBe(BOOMERANG_R0);
    expect(boomerangSpiralRadius(1)).toBe(BOOMERANG_R1);
    expect(boomerangSpiralRadius(0.5)).toBeGreaterThan(BOOMERANG_R0);
  });
  it('furacão: 2 tornados, vão ~12 m na direção do alvo, separados', () => {
    const end = heroTornadoPositions({ x: 0, z: 0 }, { x: 0, z: 1 }, 1);
    expect(end).toHaveLength(2);
    for (const p of end) expect(p.z).toBeCloseTo(TORNADO_RANGE, 0);
    expect(Math.abs(end[0]!.x - end[1]!.x)).toBeGreaterThan(0.5);
  });
  it('empurrão aponta pra LONGE da origem', () => {
    const v = pushAway({ x: 0, z: 0 }, { x: 3, z: 0 }, 1.4);
    expect(v.x).toBeCloseTo(1.4);
    expect(v.z).toBeCloseTo(0);
  });
});

describe('poderes do herói — no jogo', () => {
  beforeEach(() => { useGameStore.setState({ lastArrowRainAt: 0 }); setup(25, [{ id: 'f1', x: 3, z: 0 }, { id: 'f2', x: 6, z: 0 }, { id: 'longe', x: 60, z: 0 }]); });

  it('abaixo do nível NÃO dispara', () => {
    setup(12, [{ id: 'f1', x: 3, z: 0 }]);
    useGameStore.getState().castHeroPower('lightning');
    expect(useGameStore.getState().heroPowers.lastAt.lightning).toBe(0);
  });

  it('raio acerta os hostis mais perto (não o de 60 m) e entra em cooldown', () => {
    useGameStore.getState().castHeroPower('lightning');
    const s = useGameStore.getState();
    const hp = (id: string) => s.creatures.find((c) => c.id === id)!.hp;
    expect(hp('f1')).toBeLessThan(5000);
    expect(hp('f2')).toBeLessThan(5000);
    expect(hp('longe')).toBe(5000);
    expect(s.heroPowers.lastAt.lightning).toBeGreaterThan(0);
    // 2º clique na hora: recarregando, ninguém leva de novo
    const before = hp('f1');
    useGameStore.getState().castHeroPower('lightning');
    expect(useGameStore.getState().creatures.find((c) => c.id === 'f1')!.hp).toBe(before);
  });

  it('furacão causa dano e EMPURRA de verdade (fila do AI)', () => {
    setup(25, [{ id: 'colado', x: 0, z: 2 }]);
    useGameStore.getState().castHeroPower('tornado');
    const c = useGameStore.getState().creatures.find((x) => x.id === 'colado')!;
    expect(c.hp).toBeLessThan(5000);
    expect(pendingKnockback('colado')).not.toBeNull();
  });

  it('um poder de cada vez: 3 s de intervalo entre poderes diferentes (inclui a Chuva)', () => {
    useGameStore.setState({ lastArrowRainAt: 0 });
    useGameStore.getState().castHeroPower('lightning');
    expect(useGameStore.getState().heroPowers.lastAt.lightning).toBeGreaterThan(0);
    useGameStore.getState().castHeroPower('tornado');
    expect(useGameStore.getState().heroPowers.lastAt.tornado).toBe(0); // bloqueado pelo intervalo
    useGameStore.getState().arrowRain();
    expect(useGameStore.getState().lastArrowRainAt).toBe(0);
    // 3 s depois: libera
    useGameStore.setState((s) => ({ heroPowers: { ...s.heroPowers, lastAt: { ...s.heroPowers.lastAt, lightning: Date.now() / 1000 - 3.1 } } }));
    useGameStore.getState().castHeroPower('tornado');
    expect(useGameStore.getState().heroPowers.lastAt.tornado).toBeGreaterThan(0);
  });

  it('bumerangue: lâminas abrem e cortam quem está no caminho', () => {
    useGameStore.getState().castHeroPower('boomerang');
    const hp = useGameStore.getState().heroPowers;
    expect(hp.boomerangUntil).toBeGreaterThan(hp.boomerangStart);
    // varre o tempo do poder: em algum tick a espiral passa pelo hostil a 3 m
    for (let t = hp.boomerangStart; t < hp.boomerangUntil; t += 250) useGameStore.getState().tickHeroPowers(t);
    expect(useGameStore.getState().creatures.find((c) => c.id === 'f1')!.hp).toBeLessThan(5000);
  });
});
