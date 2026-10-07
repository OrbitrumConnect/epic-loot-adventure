import type { Position } from './player';

/** O que o jogador precisa ter na mão para colher o nó. */
export type HarvestTool = 'hand' | 'axe' | 'pickaxe';

export type HarvestNodeKind =
  | 'tree'          // madeira, precisa de machado (ou rende pouco na mão)
  | 'pebble'        // pedra pequena, cata com a mão
  | 'rock'          // rocha, precisa de picareta
  | 'iron_vein'     // veio de ferro, picareta
  | 'gold_vein'     // veio de ouro, picareta
  | 'crystal';      // essência arcana

export type HarvestNodeDefinition = {
  kind: HarvestNodeKind;
  name: string;
  /** Item entregue ao colher. */
  resourceId: string;
  /** Ferramenta mínima. `hand` significa que qualquer um colhe. */
  tool: HarvestTool;
  /** Quantidade por golpe com a ferramenta certa. */
  yieldPerHit: number;
  /** Quantidade por golpe só com a mão, quando permitido. 0 = impossível. */
  handYield: number;
  /** Total disponível antes de esgotar. */
  capacity: number;
  respawnMs: number;
  /** Alcance em metros para colher. */
  range: number;
  /** XP por golpe que colhe. */
  xp: number;
  icon: string;
};

export type HarvestResult = {
  ok: boolean;
  harvested: number;
  xp: number;
  /** Mensagem pronta para o HUD, em português. */
  message: string;
  /** Preenchido quando falta ferramenta, para a UI sugerir o craft. */
  missingTool: HarvestTool | null;
};

/** Nó de recurso tal como existe no mundo. */
export type HarvestNodeState = {
  id: string;
  kind: HarvestNodeKind;
  position: Position;
  quantity: number;
  maxQuantity: number;
  depleted: boolean;
  respawnAt: number | null;
  /** Variação visual estável (tamanho, rotação) derivada do id. */
  seed: number;
};
