import { describe, expect, it } from 'vitest';
import { farmZsZone, zsRadiusToPct, zsWorldToPct, ZS_MAP_BOUNDS } from '@/components/hud/zs-map';
import { useGameStore } from '@/game/state/game-store';
import { HUNT_AREA_RADIUS } from '@/game/systems/objectiveSystem';
import type { ZsZone } from '@/game/data/zs-zones';

const zone = (over: Partial<ZsZone> = {}): ZsZone => ({
  id: 'lagoon',
  biome: 'lagoon',
  name: 'Beira da Lagoa',
  description: 'teste',
  speciesIds: ['boar'],
  center: { x: 12, z: -8 },
  radius: 40,
  levelMin: 1,
  levelMax: 3,
  creatureCount: 5,
  ...over,
});

describe('mapeamento mundo → fundo (Zona Sul)', () => {
  it('canto noroeste = 0%, canto sudeste = 100%, centro = 50%', () => {
    expect(zsWorldToPct(ZS_MAP_BOUNDS.minX, ZS_MAP_BOUNDS.minZ)).toEqual({ left: 0, top: 0 });
    expect(zsWorldToPct(ZS_MAP_BOUNDS.maxX, ZS_MAP_BOUNDS.maxZ)).toEqual({ left: 100, top: 100 });
    const mid = zsWorldToPct(0, 0);
    expect(mid.left).toBeCloseTo(50, 1);
    expect(mid.top).toBeCloseTo(50, 1);
  });

  it('prende fora dos limites em 0..100', () => {
    expect(zsWorldToPct(-99999, -99999)).toEqual({ left: 0, top: 0 });
    expect(zsWorldToPct(99999, 99999)).toEqual({ left: 100, top: 100 });
  });

  it('raio vira elipse em % (X mais largo que Z)', () => {
    const { rx, ry } = zsRadiusToPct(100);
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(rx); // Z é mais curto, então mesma distância ocupa mais %
  });
});

describe('farmar zona manda o piloto pro centro com o raio da zona', () => {
  it('cria hunt_area no centro, com o raio da zona, e liga o modo idle', () => {
    farmZsZone(zone({ center: { x: 12, z: -8 }, radius: 40 }));
    const st = useGameStore.getState();
    expect(st.objectives.mode).toBe('idle');
    const area = st.objectives.items.find(o => o.kind === 'hunt_area');
    expect(area).toBeTruthy();
    expect(area!.position).toEqual({ x: 12, z: -8 });
    expect(area!.radius).toBe(Math.max(HUNT_AREA_RADIUS, 40 + 8));
  });

  it('zona pequena ainda garante ao menos HUNT_AREA_RADIUS', () => {
    farmZsZone(zone({ id: 'field', biome: 'field', center: { x: 30, z: 30 }, radius: 1 }));
    const area = useGameStore.getState().objectives.items.find(o => o.targetId === 'area_30_30');
    expect(area).toBeTruthy();
    expect(area!.radius).toBeGreaterThanOrEqual(HUNT_AREA_RADIUS);
  });
});
