import { describe, expect, it } from 'vitest';

import type { AutoSnapshot, Position } from '@/game/types';
import { decideIntent, RETREAT_HP_RATIO } from '@/game/systems/objectiveSystem';
import { creatureLevel } from '@/game/systems/progressionSystem';
import { CREATURES } from '@/game/data/creatures';

const T0 = 3_000_000;
const ORIGIN: Position = { x: 0, z: 0 };

// Níveis derivados REAIS (não chutados): vêm de creatureLevel sobre CREATURES.
const SAMURAI_LEVEL = creatureLevel(CREATURES['raider_samurai']!); // ~23
const MUSHROOM_LEVEL = creatureLevel(CREATURES['raider_mushroom']!); // ~20
const PELTER_LEVEL = creatureLevel(CREATURES['pelter']!); // ~4

function snapshot(partial: Partial<AutoSnapshot> = {}): AutoSnapshot {
  return {
    playerPosition: ORIGIN,
    playerHp: 100,
    playerMaxHp: 100,
    playerDead: false,
    healSlot: null,
    creatures: [],
    camps: [],
    resources: [],
    objectives: { items: [], mode: 'idle', repeat: false, seq: 0 },
    homePosition: { x: 0, z: 1 },
    ...partial,
  };
}

/** Criatura forte (nível >> jogador) a ~4 m da base, sem objetivo ativo. */
function withStrongCreature(
  speciesId: string,
  level: number,
  behavior: 'patrol' | 'chase',
  playerLevel: number,
): AutoSnapshot {
  return snapshot({
    playerLevel,
    creatures: [
      { id: speciesId, position: { x: 4, z: 0 }, behavior, hp: 500, hostile: true, level },
    ],
  });
}

describe('idle: o piloto ataca QUALQUER criatura hostil, por mais forte que seja', () => {
  // Sanidade: as criaturas do pedido são mesmo muito mais fortes que o jogador.
  it('níveis derivados confirmam o desnível (samurai/cogumelo >> jogador)', () => {
    expect(SAMURAI_LEVEL).toBeGreaterThan(6);
    expect(MUSHROOM_LEVEL).toBeGreaterThan(6);
    expect(PELTER_LEVEL).toBeGreaterThan(1);
  });

  for (const behavior of ['patrol', 'chase'] as const) {
    it(`Couraça de Espinhos (raider_samurai) em ${behavior}: engaja, nunca idle/retreat`, () => {
      const intent = decideIntent(withStrongCreature('raider_samurai', SAMURAI_LEVEL, behavior, 6), T0);
      expect(['attack', 'move']).toContain(intent.kind);
      expect(intent.kind).not.toBe('idle');
      expect(intent.kind).not.toBe('retreat');
      if (intent.kind === 'move') expect(intent.to).toEqual({ x: 4, z: 0 });
      if (intent.kind === 'attack') expect(intent.creatureId).toBe('raider_samurai');
    });

    it(`Aberração Fúngica (raider_mushroom) em ${behavior}: engaja, nunca idle/retreat`, () => {
      const intent = decideIntent(withStrongCreature('raider_mushroom', MUSHROOM_LEVEL, behavior, 6), T0);
      expect(['attack', 'move']).toContain(intent.kind);
      expect(intent.kind).not.toBe('idle');
      expect(intent.kind).not.toBe('retreat');
    });

    it(`Mecha Pelter (pelter) com jogador nível 1 em ${behavior}: engaja, nunca idle/retreat`, () => {
      const intent = decideIntent(withStrongCreature('pelter', PELTER_LEVEL, behavior, 1), T0);
      expect(['attack', 'move']).toContain(intent.kind);
      expect(intent.kind).not.toBe('idle');
      expect(intent.kind).not.toBe('retreat');
    });
  }

  // Prova de que NÃO removi o recuo por sobrevivência: HP baixo ainda recua.
  it('recuo por HP baixo continua: piloto muito ferido recua mesmo com inimigo por perto', () => {
    const intent = decideIntent(snapshot({
      playerLevel: 6,
      playerHp: Math.floor(100 * RETREAT_HP_RATIO) - 1, // abaixo do limiar
      playerMaxHp: 100,
      autoPotion: false, // sem cura → recua em vez de curar
      homePosition: { x: 0, z: 1 },
      creatures: [
        { id: 'raider_samurai', position: { x: 4, z: 0 }, behavior: 'chase', hp: 500, hostile: true, level: SAMURAI_LEVEL },
      ],
    }), T0);
    expect(intent.kind).toBe('retreat');
    if (intent.kind === 'retreat') expect(intent.to).toEqual({ x: 0, z: 1 });
  });

  // Prova de que NÃO removi a regra `peaceful`: pacífico não é atacado sozinho.
  it('criatura pacífica (hostile:false) NÃO é atacada por conta própria', () => {
    const intent = decideIntent(snapshot({
      playerLevel: 6,
      creatures: [
        { id: 'cervo', position: { x: 4, z: 0 }, behavior: 'patrol', hp: 30, hostile: false, level: 1 },
      ],
    }), T0);
    expect(intent.kind).toBe('idle');
  });
});
