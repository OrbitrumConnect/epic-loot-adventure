import { describe, expect, it } from 'vitest';
import { ARMOR_ITEMS } from '@/game/data/armorItems';
import { CREATURES } from '@/game/data/creatures';
import { ITEMS } from '@/game/data/items';
import { RECIPES } from '@/game/data/recipes';
import { BONUS_POOLS } from '@/game/systems/lootEconomySystem';
import { rollCreatureLoot } from '@/game/systems/lootSystem';

describe('cobertura de drops e fabricação de armaduras', () => {
  it('distribui 48 itens em caça e pools bônus', () => {
    const commonUncommonDrops = Object.values(CREATURES).flatMap(creature => creature.lootTable.map(drop => drop.itemId));
    const bonusDrops = Object.values(BONUS_POOLS).flat();
    const expected = [...Object.keys(ARMOR_ITEMS), 'leather_armor'];
    for (const id of expected) {
      const item = ITEMS[id]!;
      expect(item).toBeTruthy();
      expect(item.rarity === 'common' || item.rarity === 'uncommon' ? commonUncommonDrops : bonusDrops, id).toContain(id);
    }
  });

  it('rolagem determinística confirma drops de caça e luck default neutro', () => {
    const creature = Object.values(CREATURES).find(entry => entry.lootTable.some(drop => drop.itemId === 'head_common'))!;
    expect(rollCreatureLoot(creature, () => 0).some(drop => drop.itemId === 'head_common')).toBe(true);
    expect(rollCreatureLoot(creature, () => 0.5, 0)).not.toContainEqual(expect.objectContaining({ itemId: 'head_common' }));
  });

  it('tem receita common/uncommon por slot exceto leather_armor, sem tiers raros', () => {
    const crafted = Object.values(RECIPES).map(recipe => recipe.result.itemId).filter(id => /_(common|uncommon)$/.test(id));
    expect(crafted).toHaveLength(15);
    expect(crafted).not.toContain('leather_armor');
    expect(Object.values(RECIPES).some(recipe => /_(rare|epic|legendary|ancestral)$/.test(recipe.result.itemId))).toBe(false);
  });
});
