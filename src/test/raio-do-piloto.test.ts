import { describe, expect, it } from 'vitest';
import type { AutoSnapshot } from '@/game/types';
import { decideIntent } from '@/game/systems/objectiveSystem';

/* Pedro (22/10): o slider de raio do piloto (idle) limita TUDO — "setar 5 m e ele atacar naquele
   range e ficar ali". Escolhe alvo até max(raio, alcance da arma); nunca anda além do raio. */
function snap(partial: Partial<AutoSnapshot>): AutoSnapshot {
  return {
    playerPosition: { x: 0, z: 0 }, playerHp: 100, playerMaxHp: 100, playerDead: false, healSlot: null,
    creatures: [], camps: [], resources: [],
    objectives: { items: [], mode: 'idle', repeat: false, seq: 0 },
    homePosition: { x: 0, z: 1 }, playerLevel: 30,
    ...partial,
  };
}
const foeAt = (x: number) => ({ id: 'foe', position: { x, z: 0 }, behavior: 'patrol' as const, hp: 100, hostile: true, level: 5 });
const nodeAt = (x: number) => ({ id: 'node', kind: 'wood', position: { x, z: 0 }, depleted: false, quantity: 5 });

describe('raio do piloto (slider) no idle', () => {
  it('raio 5 m + espada: inimigo a 20 m é ignorado (fica ali)', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 4, creatures: [foeAt(20)] }), 1);
    expect(i.kind).toBe('idle');
  });

  it('raio 5 m + arma de longe (20 m): atira em quem está no alcance, SEM andar', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 20, creatures: [foeAt(15)] }), 1);
    expect(i.kind).toBe('attack');
  });

  it('raio 5 m: recurso a 12 m não puxa o herói', () => {
    const i = decideIntent(snap({ autoHuntRadius: 5, attackRange: 4, resources: [nodeAt(12)] as never }), 1);
    expect(i.kind).not.toBe('move');
  });

  it('raio padrão: o MESMO recurso a 12 m puxa o herói (prova que o teste acima não é vazio)', () => {
    const i = decideIntent(snap({ autoHuntRadius: 45, attackRange: 4, resources: [nodeAt(12)] as never, gatherCapacity: true }), 1);
    expect(i.kind).toBe('move');
  });

  it('raio padrão (45 m): segue caçando longe como antes', () => {
    const i = decideIntent(snap({ autoHuntRadius: 45, attackRange: 4, creatures: [foeAt(30)] }), 1);
    expect(['move', 'attack']).toContain(i.kind);
  });
});
