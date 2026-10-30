import { describe, expect, it } from 'vitest';
import { decideIntent } from '@/game/systems/objectiveSystem';
import type { AutoSnapshot } from '@/game/types';

const snapshot = (extra: Partial<AutoSnapshot>): AutoSnapshot => ({
  playerPosition: { x: 0, z: 0 }, playerHp: 100, playerMaxHp: 100, playerDead: false, healSlot: null,
  creatures: [], camps: [], resources: [], objectives: { items: [], mode: 'idle', repeat: false, seq: 0 },
  homePosition: { x: 0, z: 0 }, autoAnchor: { x: 0, z: 0 }, autoHuntRadius: 45, gatherCapacity: true,
  autoExplore: true, ...extra,
});

describe('modo auto Zona Sul', () => {
  it('explora até hostil fora do raio curto', () => {
    const intent = decideIntent(snapshot({ creatures: [{ id: 'lobo', position: { x: 200, z: 0 }, behavior: 'patrol', hp: 10, hostile: true }] }), 0);
    expect(intent).toMatchObject({ kind: 'move', to: { x: 200, z: 0 }, reason: 'Procurando caça...' });
  });

  it('prioriza recurso distante antes de caça', () => {
    const intent = decideIntent(snapshot({
      resources: [{ id: 'arvore', position: { x: 150, z: 0 }, depleted: false, canCollect: true }],
      creatures: [{ id: 'lobo', position: { x: 100, z: 0 }, behavior: 'patrol', hp: 10, hostile: true }],
    }), 0);
    expect(intent).toMatchObject({ kind: 'move', to: { x: 150, z: 0 }, reason: 'Procurando recurso...' });
  });

  it('sem autoExplore mantém retorno ao anchor', () => {
    const intent = decideIntent(snapshot({ autoExplore: false, playerPosition: { x: 10, z: 0 } }), 0);
    expect(intent).toMatchObject({ kind: 'move', to: { x: 0, z: 0 } });
  });
});
