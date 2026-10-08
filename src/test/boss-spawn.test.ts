import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';

const aliveBosses = () =>
  useGameStore.getState().creatures.filter(c => c.speciesId === 'raider_warlord' && c.behavior !== 'dead');

describe('mini-boss (raider_warlord)', () => {
  beforeEach(() => {
    useGameStore.setState(s => ({ creatures: [], player: { ...s.player, position: { x: 0, z: 0 } } }));
  });

  it('existe na tabela de criaturas com vida muito maior e dano acima do urso', () => {
    const boss = CREATURES['raider_warlord']!;
    const bear = CREATURES['bear']!;
    expect(boss.maxHp).toBeGreaterThan(bear.maxHp * 2);
    expect(boss.attackPower).toBeGreaterThan(bear.attackPower);
  });

  it('spawnBoss faz nascer um colosso vivo perto, dentro do mundo', () => {
    useGameStore.getState().spawnBoss();
    const bosses = aliveBosses();
    expect(bosses).toHaveLength(1);
    const b = bosses[0]!;
    expect(b.hp).toBe(b.maxHp);
    expect(Math.abs(b.position.x)).toBeLessThan(130);
    expect(Math.abs(b.position.z)).toBeLessThan(130);
  });

  it('um por vez: chamar de novo não cria um segundo enquanto o primeiro vive', () => {
    useGameStore.getState().spawnBoss();
    useGameStore.getState().spawnBoss();
    expect(aliveBosses()).toHaveLength(1);
  });

  it('se o colosso morreu, um novo pode nascer', () => {
    useGameStore.getState().spawnBoss();
    useGameStore.setState(s => ({
      creatures: s.creatures.map(c =>
        c.speciesId === 'raider_warlord' ? { ...c, hp: 0, behavior: 'dead' as const, respawnAt: null } : c),
    }));
    useGameStore.getState().spawnBoss();
    expect(aliveBosses()).toHaveLength(1);
  });
});
