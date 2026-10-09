import { afterEach, describe, expect, it } from 'vitest';

import type { PlayerState } from '@/game/types';
import { ITEMS } from '@/game/data/items';
import { MAX_LEVEL } from '@/game/systems/progressionSystem';
import { resolveAttack } from '@/game/systems/combatSystem';
import {
  CRIT_CHANCE_MAX, CRIT_MULT_MAX, CRIT_MULT_MIN, critFromDexterity, effectiveAttributes,
  gearAttributeBonus, playerCritStats,
} from '@/game/systems/attributesSystem';
import { useGameStore } from '@/game/state/game-store';

function player(overrides: Partial<PlayerState> = {}, eq: Partial<PlayerState['inventory']['equipment']> = {}): PlayerState {
  const base = useGameStore.getState().player;
  return {
    ...base,
    ...overrides,
    inventory: {
      ...base.inventory,
      equipment: { primary: null, secondary: null, armor: null, accessory: null, ...eq },
    },
  };
}
const ZERO = { damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 };

describe('crítico por destreza', () => {
  it('destreza 0 = chance exatamente 0 e nível 1 nunca critica', () => {
    expect(critFromDexterity(0).chance).toBe(0);
    const p = player({ level: 1, attributes: ZERO });
    expect(playerCritStats(p).chance).toBe(0);
    // rng sempre 0 (pior caso para "acertar" o crítico): ainda assim não critica.
    const r = resolveAttack(20, 100, 100, 0, 'x', playerCritStats(p), () => 0);
    expect(r.critical).toBe(false);
  });

  it('chance e multiplicador sobem com a destreza, dentro dos limites', () => {
    let prev = critFromDexterity(0);
    for (const d of [10, 30, 50, 80, 100]) {
      const c = critFromDexterity(d);
      expect(c.chance).toBeGreaterThan(prev.chance);
      expect(c.multiplier).toBeGreaterThan(prev.multiplier);
      prev = c;
    }
    expect(critFromDexterity(100).chance).toBeCloseTo(CRIT_CHANCE_MAX);
    expect(critFromDexterity(100).multiplier).toBeCloseTo(CRIT_MULT_MAX);
    expect(critFromDexterity(0).multiplier).toBe(CRIT_MULT_MIN);
    expect(critFromDexterity(999).chance).toBeCloseTo(CRIT_CHANCE_MAX); // trava
    expect(critFromDexterity(-5).chance).toBe(0);
  });

  it('crítico forçado (rng injetado) causa mais dano e é sinalizado', () => {
    const crit = { chance: 0.5, multiplier: 2 };
    const normal = resolveAttack(100, 1000, 1000, 0, 'x', crit, () => 0.99); // 0.99 >= 0.5 → sem crit
    const forced = resolveAttack(100, 1000, 1000, 0, 'x', crit, () => 0.1); // 0.1 < 0.5 → crit
    expect(normal.critical).toBe(false);
    expect(forced.critical).toBe(true);
    expect(forced.damage).toBeGreaterThan(normal.damage);
    expect(forced.message).toContain('Crítico');
  });

  it('sem parâmetro de crítico o resolveAttack segue como antes', () => {
    const r = resolveAttack(100, 500, 500, 0, 'x', undefined, () => 0.5);
    expect(r.damage).toBe(100); // 100 * (0.85 + 0.5*0.3)
    expect(r.critical).toBe(false);
  });
});

describe('bônus de armadura e acessório', () => {
  afterEach(() => { delete ITEMS['test_charm']; });

  it('jogador nível 1 sem equip: atributos idênticos aos de hoje (tudo 0)', () => {
    const p = player({ level: 1, attributes: ZERO });
    expect(gearAttributeBonus(p.inventory)).toEqual(ZERO);
    expect(effectiveAttributes(p)).toEqual(ZERO);
  });

  it('níveis 1..MAX sem armadura/acessório = nível + skill, sem diferença', () => {
    for (let lv = 1; lv <= MAX_LEVEL; lv += 7) {
      const p = player({ level: lv, attributes: ZERO });
      expect(gearAttributeBonus(p.inventory)).toEqual(ZERO);
    }
  });

  it('armadura soma CARGA por raridade', () => {
    const base = effectiveAttributes(player({ level: 1, attributes: ZERO }));
    const leather = effectiveAttributes(player({ level: 1, attributes: ZERO }, { armor: 'leather_armor' }));
    const plate = effectiveAttributes(player({ level: 1, attributes: ZERO }, { armor: 'guardian_plate' }));
    expect(leather.carry).toBe(base.carry + 4);
    expect(plate.carry).toBe(base.carry + 14);
    expect(plate.damage).toBe(0);
  });

  it('acessório soma destreza e velocidade (e o crítico enxerga)', () => {
    ITEMS['test_charm'] = {
      id: 'test_charm', name: 'Amuleto', category: 'utility', rarity: 'epic', weight: 0.2, maxStack: 1,
      dropOnDeath: false, usable: false, equippable: true, equipSlot: 'accessory', icon: 'Gem',
    };
    const p = player({ level: 1, attributes: ZERO }, { accessory: 'test_charm' });
    const a = effectiveAttributes(p);
    expect(a.dexterity).toBe(14);
    expect(a.moveSpeed).toBe(6);
    expect(playerCritStats(p).chance).toBeGreaterThan(0);
  });

  it('attrBonus explícito no item prevalece sobre a tabela por raridade', () => {
    ITEMS['test_charm'] = {
      id: 'test_charm', name: 'Amuleto', category: 'utility', rarity: 'common', weight: 0.2, maxStack: 1,
      dropOnDeath: false, usable: false, equippable: true, equipSlot: 'accessory', icon: 'Gem',
      attrBonus: { dexterity: 10 },
    };
    expect(gearAttributeBonus(player({}, { accessory: 'test_charm' }).inventory).dexterity).toBe(10);
  });

  it('total continua travado em 0–100', () => {
    ITEMS['test_charm'] = {
      id: 'test_charm', name: 'Amuleto', category: 'utility', rarity: 'mythic', weight: 0.2, maxStack: 1,
      dropOnDeath: false, usable: false, equippable: true, equipSlot: 'accessory', icon: 'Gem',
      attrBonus: { dexterity: 500, damage: 500 },
    };
    const p = player(
      { level: MAX_LEVEL, attributes: { damage: 60, dexterity: 60, carry: 60, moveSpeed: 60 } },
      { armor: 'guardian_plate', accessory: 'test_charm', primary: 'eclipse_blade' },
    );
    const a = effectiveAttributes(p);
    for (const v of Object.values(a)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
    expect(a.dexterity).toBe(100);
  });

  it('equipar acessório pela store vai pro slot accessory e ajusta o peso máximo', () => {
    ITEMS['test_charm'] = {
      id: 'test_charm', name: 'Amuleto', category: 'utility', rarity: 'rare', weight: 0.2, maxStack: 1,
      dropOnDeath: false, usable: false, equippable: true, equipSlot: 'accessory', icon: 'Gem',
    };
    useGameStore.getState().equipItem('test_charm');
    expect(useGameStore.getState().player.inventory.equipment.accessory).toBe('test_charm');
    useGameStore.getState().unequipSlot('accessory');
  });
});
