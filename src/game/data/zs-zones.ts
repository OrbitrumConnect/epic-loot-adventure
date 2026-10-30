import { CREATURES } from './creatures';
import { creatureLevel } from '../systems/progressionSystem';
import type { CreatureState } from '../types';

export type ZsBiome = 'lagoon' | 'field' | 'lowforest' | 'highforest' | 'roads';

export const ZS_BIOME_ORDER: readonly ZsBiome[] = [
  'lagoon',
  'field',
  'lowforest',
  'highforest',
  'roads',
];

export const ZS_SPECIES_BIOME: Readonly<Record<string, ZsBiome>> = {
  boar: 'lagoon',
  goose: 'lagoon',
  wolf_alpha: 'field',
  bear: 'field',
  deer: 'lowforest',
  rabbit: 'lowforest',
  pheasant: 'lowforest',
  monster: 'highforest',
  flintmaw: 'highforest',
  pigeon: 'roads',
};

export const ZS_ZONE_METADATA: Readonly<Record<ZsBiome, { name: string; description: string }>> = {
  lagoon: {
    name: 'Beira da Lagoa',
    description: 'Fauna que vive nas margens e arredores da Lagoa.',
  },
  field: {
    name: 'Campo Aberto',
    description: 'Área aberta, com pouca cobertura vegetal e fauna de grande porte.',
  },
  lowforest: {
    name: 'Mata Baixa',
    description: 'Vegetação baixa, trilhas e espécies menores da floresta.',
  },
  highforest: {
    name: 'Mata Alta (Tijuca)',
    description: 'Mata densa e elevada, habitat das criaturas mais perigosas.',
  },
  roads: {
    name: 'Pistas da Cidade',
    description: 'Pistas e áreas urbanas percorridas por aves oportunistas.',
  },
};

export type ZsZone = {
  id: string;
  biome: ZsBiome;
  name: string;
  description: string;
  speciesIds: string[];
  center: { x: number; z: number };
  radius: number;
  levelMin: number;
  levelMax: number;
  creatureCount: number;
};

export function computeZsZones(creatures: CreatureState[]): ZsZone[] {
  const grouped = new Map<ZsBiome, CreatureState[]>();

  for (const creature of creatures) {
    if (creature.hp <= 0) continue;
    const biome = ZS_SPECIES_BIOME[creature.speciesId];
    if (!biome) continue;
    const group = grouped.get(biome);
    if (group) group.push(creature);
    else grouped.set(biome, [creature]);
  }

  return ZS_BIOME_ORDER.flatMap((biome) => {
    const members = grouped.get(biome);
    if (!members?.length) return [];

    const center = members.reduce(
      (sum, creature) => ({
        x: sum.x + creature.position.x / members.length,
        z: sum.z + creature.position.z / members.length,
      }),
      { x: 0, z: 0 },
    );
    const radius = Math.max(
      ...members.map((creature) => Math.hypot(creature.position.x - center.x, creature.position.z - center.z)),
    );
    const speciesIds = [...new Set(members.map((creature) => creature.speciesId))].sort((a, b) => {
      const levelDiff = creatureLevel(CREATURES[a]!) - creatureLevel(CREATURES[b]!);
      return levelDiff || a.localeCompare(b);
    });
    const levels = speciesIds.map((speciesId) => creatureLevel(CREATURES[speciesId]!));
    const metadata = ZS_ZONE_METADATA[biome];

    return [{
      id: biome,
      biome,
      name: metadata.name,
      description: metadata.description,
      speciesIds,
      center,
      radius,
      levelMin: Math.min(...levels),
      levelMax: Math.max(...levels),
      creatureCount: members.length,
    }];
  });
}
