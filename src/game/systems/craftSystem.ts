import type { InventoryState } from '../types';
import { RECIPES, type Recipe } from '../data/recipes';
import { ITEMS } from '../data/items';
import { hasItems, removeItem, addItem, canAddItem } from './inventorySystem';

export function canCraft(inventory: InventoryState, recipeId: string): boolean {
  const recipe = RECIPES[recipeId];
  if (!recipe) return false;

  for (const mat of recipe.materials) {
    if (!hasItems(inventory, mat.itemId, mat.quantity)) return false;
  }

  return canAddItem(inventory, recipe.result.itemId, recipe.result.quantity);
}

export function craft(inventory: InventoryState, recipeId: string): { inventory: InventoryState; recipe: Recipe } | null {
  const recipe = RECIPES[recipeId];
  if (!recipe || !canCraft(inventory, recipeId)) return null;

  let inv = inventory;
  for (const mat of recipe.materials) {
    inv = removeItem(inv, mat.itemId, mat.quantity);
  }
  inv = addItem(inv, recipe.result.itemId, recipe.result.quantity);

  return { inventory: inv, recipe };
}

export function getAvailableRecipes(inventory: InventoryState): { recipe: Recipe; canMake: boolean }[] {
  return Object.values(RECIPES).map(recipe => ({
    recipe,
    canMake: canCraft(inventory, recipe.id),
  }));
}

export function getMaterialStatus(inventory: InventoryState, recipeId: string): { itemId: string; name: string; have: number; need: number; ok: boolean }[] {
  const recipe = RECIPES[recipeId];
  if (!recipe) return [];

  return recipe.materials.map(mat => {
    const item = ITEMS[mat.itemId];
    const have = inventory.slots
      .filter(s => s.itemId === mat.itemId)
      .reduce((sum, s) => sum + s.quantity, 0);
    return {
      itemId: mat.itemId,
      name: item?.name ?? mat.itemId,
      have,
      need: mat.quantity,
      ok: have >= mat.quantity,
    };
  });
}
