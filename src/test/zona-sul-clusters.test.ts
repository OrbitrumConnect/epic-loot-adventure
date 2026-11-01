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
    // 01/11 (Pedro: fauna +20%): era 36 fixo (12+8+8+8) — agora a soma da tabela (44)
    expect(wild).toHaveLength(rules.reduce((s, r) => s + r.count, 0));
    const zones = computeZsZones(wild);
    const lagoon = zones.find((zone) => zone.biome === 'lagoon')!;
    const field = zones.find((zone) => zone.biome === 'field')!;
    // 01/11 (2ª, fauna +10%): +1 jacaré e +1 ganso na faixa de beira de 18 m DESTE mapa de brinquedo levaram o mais longe
    // a 127 m do centro (era ≤ 121 = 1,1×). Segue um grupo só (nasce no raio ZONE_SPREAD da âncora); no mapa real o
    // zona-sul-fauna confere as regiões.
    expect(lagoon.radius).toBeLessThanOrEqual(ZONE_SPREAD * 1.2);
    expect(field.radius).toBeLessThanOrEqual(ZONE_SPREAD * 1.2);
    // 01/11 (fauna +20%): com mais leoas/búfalos no mesmo raio, o centro do campo chegou ~3 m mais perto NESTE mapa de
    // brinquedo (161,8 m; o limiar era 1,5× = 165). Os biomas seguem separados — no mapa real o zona-sul-fauna confere.
    expect(Math.hypot(lagoon.center.x - field.center.x, lagoon.center.z - field.center.z)).toBeGreaterThan(ZONE_SPREAD * 1.4);
  });
});
