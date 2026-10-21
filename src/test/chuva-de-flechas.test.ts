import { describe, it, expect, beforeEach } from 'vitest';
import type { CreatureState } from '@/game/types';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES, scaleEnemyHp } from '@/game/data/creatures';

/** Cria uma criatura viva em (x,z) a partir de uma definição real (mesmo shape dos outros testes). */
function creatureAt(speciesId: string, id: string, x: number, z: number): CreatureState {
  const def = CREATURES[speciesId]!;
  return {
    id, speciesId, name: def.name,
    hp: scaleEnemyHp(def.maxHp), maxHp: scaleEnemyHp(def.maxHp),
    attackPower: def.attackPower, armor: def.armor, attackCooldown: def.attackCooldown,
    lastAttackAt: 0, position: { x, z }, behavior: 'chase', lootTable: [], respawnAt: null,
  };
}

describe('Chuva de Flechas (poder de longe, dano em área)', () => {
  beforeEach(() => useGameStore.getState().restartSurvival());

  it('com ARCO na mão e alvos no raio, acerta TODOS os do raio (dano em área)', () => {
    useGameStore.setState(s => ({
      player: { ...s.player, position: { x: 0, z: 0 } },
      lastArrowRainAt: 0,
      creatures: [
        creatureAt('wolf', 'perto1', 3, 0),
        creatureAt('wolf', 'perto2', 0, 4),
        creatureAt('wolf', 'longe', 40, 0),
      ],
      ui: { ...s.ui, selectedHotbar: 8 }, // arco (slot 8 da hotbar = bow)
    }));
    const before = new Map(useGameStore.getState().creatures.map(c => [c.id, c.hp]));
    useGameStore.getState().arrowRain();
    const after = new Map(useGameStore.getState().creatures.map(c => [c.id, c.hp]));
    expect(after.get('perto1')!).toBeLessThan(before.get('perto1')!); // dentro do raio (5m no nv1)
    expect(after.get('perto2')!).toBeLessThan(before.get('perto2')!);
    expect(after.get('longe')!).toBe(before.get('longe')!);            // fora: intacto
  });

  it('melee na mão NÃO dispara (poder é de longe)', () => {
    useGameStore.setState(s => ({
      player: { ...s.player, position: { x: 0, z: 0 } },
      lastArrowRainAt: 0,
      creatures: [creatureAt('wolf', 'alvo', 2, 0)],
      ui: { ...s.ui, selectedHotbar: 0 }, // espada
    }));
    const before = useGameStore.getState().creatures[0]!.hp;
    useGameStore.getState().arrowRain();
    expect(useGameStore.getState().creatures[0]!.hp).toBe(before);
  });

  it('respeita o cooldown (segunda chamada seguida não dá dano)', () => {
    useGameStore.setState(s => ({
      player: { ...s.player, position: { x: 0, z: 0 } },
      lastArrowRainAt: 0,
      creatures: [creatureAt('wolf', 'alvo', 2, 0)],
      ui: { ...s.ui, selectedHotbar: 8 },
    }));
    useGameStore.getState().arrowRain();
    const afterFirst = useGameStore.getState().creatures[0]!.hp;
    useGameStore.getState().arrowRain(); // na trava do cooldown
    expect(useGameStore.getState().creatures[0]!.hp).toBe(afterFirst);
  });
});
