import { describe, expect, it } from 'vitest';
import type { CreatureState } from '@/game/types';
import { computeZsZones } from '@/game/data/zs-zones';

const creature = (id: string, speciesId: string, x: number, z: number, hp = 10): CreatureState => ({
  id,
  speciesId,
  name: speciesId,
  hp,
  maxHp: 10,
  attackPower: 1,
  armor: 0,
  attackCooldown: 1,
  lastAttackAt: 0,
  position: { x, z },
  behavior: hp > 0 ? 'idle' : 'dead',
  lootTable: [],
  respawnAt: null,
});

describe('zonas de monstros da Zona Sul', () => {
  it('agrupa criaturas vivas, calcula geometria e preserva ordem dos biomas', () => {
    const zones = computeZsZones([
      creature('jacare-1', 'boar', 0, 0),
      creature('jacare-2', 'boar', 3, 4),
      creature('leoa-1', 'wolf_alpha', 10, 20),
      creature('saqueador-1', 'raider_scout', 99, 99),
      creature('morto-1', 'rabbit', 50, 50, 0),
    ]);

    expect(zones).toHaveLength(2);
    expect(zones.map((zone) => zone.biome)).toEqual(['lagoon', 'field']);

    expect(zones[0]).toMatchObject({
      id: 'lagoon',
      speciesIds: ['boar'],
      center: { x: 1.5, z: 2 },
      radius: 2.5,
      creatureCount: 2,
    });
    expect(zones[1]).toMatchObject({
      id: 'field',
      speciesIds: ['wolf_alpha'],
      center: { x: 10, z: 20 },
      radius: 0,
      creatureCount: 1,
    });

    for (const zone of zones) expect(zone.levelMin).toBeLessThanOrEqual(zone.levelMax);
    expect(zones.flatMap((zone) => zone.speciesIds)).not.toContain('raider_scout');
    expect(zones.flatMap((zone) => zone.speciesIds)).not.toContain('rabbit');
  });
});
