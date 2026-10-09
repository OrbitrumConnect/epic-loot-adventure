import { beforeEach, describe, expect, it } from 'vitest';

import { useGameStore } from '@/game/state/game-store';
import { grantXp, SKILL_POINTS_PER_LEVEL, xpForLevel } from '@/game/systems/progressionSystem';
import { effectiveAttributes, effectiveMaxWeight } from '@/game/systems/attributesSystem';
import { DEFAULT_ATTRIBUTES } from '@/game/types/player';

const resetPlayer = () =>
  useGameStore.setState(s => ({
    player: { ...s.player, level: 1, xp: 0, xpToNext: xpForLevel(1), totalXp: 0,
      skillPoints: 0, attributes: { ...DEFAULT_ATTRIBUTES } },
  }));

describe('skill points', () => {
  beforeEach(resetPlayer);

  it('subir de nível concede pontos de skill', () => {
    const p0 = useGameStore.getState().player;
    const { player: p1, result } = grantXp(p0, xpForLevel(1) + 5);
    expect(result.levelsGained).toBe(1);
    expect(p1.skillPoints).toBe((p0.skillPoints ?? 0) + SKILL_POINTS_PER_LEVEL);
  });

  it('allocateSkill gasta 1 ponto e sobe o atributo efetivo', () => {
    useGameStore.setState(s => ({ player: { ...s.player, skillPoints: 2 } }));
    const before = effectiveAttributes(useGameStore.getState().player).damage;
    useGameStore.getState().allocateSkill('damage');
    const p = useGameStore.getState().player;
    expect(p.skillPoints).toBe(1);
    expect(effectiveAttributes(p).damage).toBe(before + 1);
  });

  it('sem pontos, não aloca', () => {
    useGameStore.setState(s => ({ player: { ...s.player, skillPoints: 0 } }));
    useGameStore.getState().allocateSkill('dexterity');
    expect(useGameStore.getState().player.attributes?.dexterity ?? 0).toBe(0);
  });

  it('deallocateSkill devolve o ponto e baixa o atributo', () => {
    useGameStore.setState(s => ({ player: { ...s.player, skillPoints: 3 } }));
    useGameStore.getState().allocateSkill('moveSpeed');
    useGameStore.getState().deallocateSkill('moveSpeed');
    const p = useGameStore.getState().player;
    expect(p.skillPoints).toBe(3);
    expect(p.attributes?.moveSpeed ?? 0).toBe(0);
  });

  it('alocar capacidade aumenta o peso máximo da bolsa', () => {
    useGameStore.setState(s => ({ player: { ...s.player, skillPoints: 5,
      inventory: { ...s.player.inventory, maxWeight: effectiveMaxWeight(s.player) } } }));
    const w0 = useGameStore.getState().player.inventory.maxWeight;
    for (let i = 0; i < 5; i++) useGameStore.getState().allocateSkill('carry');
    expect(useGameStore.getState().player.inventory.maxWeight).toBeGreaterThan(w0);
  });
});
