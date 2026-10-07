import type { InventorySlot, ResourceNode, DeathBag, Position } from '../types';
import type { CreatureDefinition } from '../types';

let bagCounter = 0;
let nodeCounter = 0;

export function createResourceNode(
  resourceId: string,
  position: Position,
  quantity: number,
): ResourceNode {
  return {
    id: `node_${++nodeCounter}`,
    resourceId,
    position,
    quantity,
    maxQuantity: quantity,
    respawnAt: null,
    depleted: false,
  };
}

export function harvestNode(node: ResourceNode, amount: number): { node: ResourceNode; harvested: number } {
  const harvested = Math.min(amount, node.quantity);
  const remaining = node.quantity - harvested;
  return {
    node: {
      ...node,
      quantity: remaining,
      depleted: remaining <= 0,
      respawnAt: remaining <= 0 ? Date.now() + 60_000 : null,
    },
    harvested,
  };
}

export function rollCreatureLoot(
  creature: Pick<CreatureDefinition, 'lootTable'>,
  rng: () => number = Math.random,
): InventorySlot[] {
  const loot: InventorySlot[] = [];
  for (const entry of creature.lootTable) {
    if (rng() <= entry.chance) {
      loot.push({ itemId: entry.itemId, quantity: entry.quantity });
    }
  }
  return loot;
}

export function createDeathBag(
  ownerId: string,
  ownerName: string,
  position: Position,
  items: InventorySlot[],
): DeathBag {
  return {
    id: `bag_${++bagCounter}`,
    ownerId,
    ownerName,
    position: { ...position },
    items: items.map(i => ({ ...i })),
    createdAt: Date.now(),
    expiresAt: Date.now() + 300_000,
  };
}

export function isExpired(bag: DeathBag): boolean {
  return Date.now() > bag.expiresAt;
}
