import { beforeEach, describe, expect, it } from 'vitest';
import { useGameStore } from '@/game/state/game-store';
import { damageMultiplier, equippedArmor, effectiveAttributes, mitigateDamage } from '@/game/systems/attributesSystem';
import { effectiveMaxHp, equipmentStats } from '@/game/systems/equipmentStatsSystem';
import { effectiveResistance, luckMultiplier, LUCK_RELATIVE_MAX, RESISTANCE_MAX } from '@/game/systems/equipmentStatsSystem';
import { CREATURES } from '@/game/data/creatures';
import { rollCreatureLoot } from '@/game/systems/lootSystem';

describe('stats de armadura por slot', () => {
  const basePlayer = () => useGameStore.getState().player;
  beforeEach(() => {
    useGameStore.setState(state => ({
      player: {
        ...state.player,
        hp: 100,
        maxHp: 100,
        inventory: {
          ...state.player.inventory,
          equipment: {
            ...state.player.inventory.equipment,
            armor: null, head: null, gloves: null, legs: null, boots: null, amulet: null, ring1: null, ring2: null,
          },
        },
      },
    }));
  });

  it('soma stats, gera teto HP e liga dano/velocidade', () => {
    const player = { ...basePlayer(), inventory: { ...basePlayer().inventory, equipment: { ...basePlayer().inventory.equipment, head: 'head_common', amulet: 'amulet_common', ring1: 'ring1_common' } } };
    const stats = equipmentStats(player);
    expect(stats.defense).toBeGreaterThan(0);
    expect(stats.health).toBeGreaterThan(0);
    expect(stats.damage).toBeGreaterThan(0);
    expect(stats.speed).toBeGreaterThan(0);
    expect(effectiveMaxHp(player)).toBe(100 + stats.health);
    expect(damageMultiplier(player)).toBeGreaterThan(1);
    expect(effectiveAttributes(player).moveSpeed).toBe(stats.speed);
  });

  it('mapeia armor legado em defesa uma vez e aplica resistência', () => {
    const player = { ...basePlayer(), inventory: { ...basePlayer().inventory, equipment: { ...basePlayer().inventory.equipment, armor: 'leather_armor', amulet: 'amulet_common' } } };
    expect(equippedArmor(player)).toBe(10);
    expect(mitigateDamage(40, player)).toBeLessThan(40 * (1 - 10 / 60));
  });

  it('store real limita HP ao desequipar sem alterar maxHp persistido', () => {
    useGameStore.getState().equipItem('chest_rare');
    const equipped = useGameStore.getState().player;
    expect(equipped.maxHp).toBe(100);
    expect(effectiveMaxHp(equipped)).toBeGreaterThan(100);
    useGameStore.setState(state => ({ player: { ...state.player, hp: effectiveMaxHp(state.player) } }));
    useGameStore.getState().unequipSlot('armor');
    expect(useGameStore.getState().player.hp).toBe(100);
    expect(useGameStore.getState().player.maxHp).toBe(100);
  });

  it('aplica tetos de luck/resistance e luck altera drop com RNG fixo', () => {
    expect(luckMultiplier(100)).toBe(1 + LUCK_RELATIVE_MAX);
    expect(luckMultiplier(1000)).toBe(1 + LUCK_RELATIVE_MAX);
    expect(effectiveResistance(1000)).toBe(RESISTANCE_MAX);
    const neutral = rollCreatureLoot(CREATURES['wolf']!, () => 0.5, 0);
    const lucky = rollCreatureLoot(CREATURES['wolf']!, () => 0.5, 100);
    expect(neutral).not.toContainEqual(expect.objectContaining({ itemId: 'wolf_pelt' }));
    expect(lucky).toContainEqual(expect.objectContaining({ itemId: 'wolf_pelt' }));
  });
});
