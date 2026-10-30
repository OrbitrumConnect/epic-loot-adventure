import { describe, expect, it } from 'vitest';
import { computeZsZones } from '@/game/data/zs-zones';
import { createZsWildlife, SURF, ZONE_SPREAD, ZS_FAUNA, type ZsQuery } from '@/game/systems/zsSpawnSystem';

const q: ZsQuery = {
  bounds: { minX: 0, maxX: 1000, minZ: 0, maxZ: 700 },
  surf: (x, z) => {
    if (x >= 300 && x <= 500) return SURF.land;
    if (x < 300) return SURF.lagoon;
    if (x >= 700 && x <= 900 && z >= 120 && z <= 380) return SURF.land;
    return SURF.forest;
  },
  height: () => 5,
  slope: () => 0,
};

describe('Zona Sul — clusters compactos por bioma', () => {
  it('mantém cada bioma em cluster compacto e separa lagoa/campo', () => {
    const rules = ZS_FAUNA.filter((rule) => ['boar', 'goose', 'wolf_alpha', 'bear'].includes(rule.speciesId));
    const wild = createZsWildlife(q, 7, rules);
    expect(wild).toHaveLength(36);
    const zones = computeZsZones(wild);
    const lagoon = zones.find((zone) => zone.biome === 'lagoon')!;
    const field = zones.find((zone) => zone.biome === 'field')!;
    expect(lagoon.radius).toBeLessThanOrEqual(ZONE_SPREAD * 1.1);
    expect(field.radius).toBeLessThanOrEqual(ZONE_SPREAD * 1.1);
    expect(Math.hypot(lagoon.center.x - field.center.x, lagoon.center.z - field.center.z)).toBeGreaterThan(ZONE_SPREAD * 1.5);
  });
});
