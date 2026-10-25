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

export type GameMode = 'world' | 'home' | 'raid' | 'city';

export type UIState = {
  mode: GameMode;
  panel: string | null;
  selectedHotbar: number;
  message: string;
  panelMessage: string;
  chatOpen: boolean;
  sidebarCollapsed: boolean;
  /** Base destruída na horda → tela de GAME OVER ("Sobreviver de novo"). */
  baseFell?: boolean;
  /** Níveis perdidos na última queda da base (tela de "Sua base caiu"). */
  baseFellLoss?: number;
  /** Quem te matou (tela de morte). `pvp` = outro jogador ou torre dele. Não vai pro save. */
  deathBy?: { name: string; pvp: boolean } | null;
};
