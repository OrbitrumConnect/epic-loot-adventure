import type { InventorySlot } from './inventory';
import type { Position } from './player';

export type ResourceNode = {
  id: string;
  resourceId: string;
  position: Position;
  quantity: number;
  maxQuantity: number;
  respawnAt: number | null;
  depleted: boolean;
};

export type DeathBag = {
  id: string;
  ownerId: string;
  ownerName: string;
  position: Position;
  items: InventorySlot[];
  createdAt: number;
  expiresAt: number;
};

export type GameMode = 'world' | 'home' | 'raid';

export type UIState = {
  mode: GameMode;
  panel: string | null;
  selectedHotbar: number;
  message: string;
  panelMessage: string;
  chatOpen: boolean;
  sidebarCollapsed: boolean;
};
