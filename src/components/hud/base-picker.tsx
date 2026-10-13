import { useGameStore } from '@/game/state/game-store';
import { ITEMS } from '@/game/data/items';
import { BASE_PIECES, pieceCost } from '@/game/data/base-pieces';
import { getItemCount } from '@/game/systems/inventorySystem';
import { ItemSprite } from './item-sprite';
import {
  BUILD_MODE_KEY_LABEL, BUILD_PIECE_KINDS, setBuildKind, setBuildMode, setBuildTier, useBuildSelection,
  type BuildTier,
} from './base-build-state';

const TIERS: readonly BuildTier[] = [1, 2, 3];
const TIER_NAME: Record<BuildTier, string> = { 1: 'Madeira', 2: 'Pedra', 3: 'Ferro' };
const itemName = (id: string) => ITEMS[id]?.name ?? id;

/** Cada contador é um seletor que devolve um número: só re-renderiza quando ele muda. */
const useCount = (itemId: string) => useGameStore(s => getItemCount(s.player.inventory, itemId));

/**
 * Barra compacta do modo de construção: peça e nível, com o custo por peça e o que
 * o jogador tem. A seleção vive em `base-build-state.ts` (o mundo lê de lá).
 */
export function PiecePicker() {
  const sel = useBuildSelection();
  const hasBase = useGameStore(s => s.playerBase !== null);
  const wood = useCount('wood');
  const stone = useCount('stone');
  const iron = useCount('iron_ore');
  const have: Record<string, number> = { wood, stone, iron_ore: iron };
  const key = BUILD_MODE_KEY_LABEL;

  if (!sel.active) return null;

  const close = (
    <button type="button" className="build-close" onClick={() => setBuildMode(false)}
      title={`Sair do modo de construção${key ? ` · ${key}` : ''}`} aria-label="Sair do modo de construção">
      Sair
    </button>
  );

  if (!hasBase) {
    return (
      <div className="build-picker" role="toolbar" aria-label="Modo de construção">
        <span className="build-hint">Modo de construção: escolha no mundo o quadrado de terreno para reivindicar.</span>
        {close}
      </div>
    );
  }

  return (
    <div className="build-picker" role="toolbar" aria-label="Modo de construção">
      <span className="build-hint">A construção é automática. Use o martelo ou aperte E perto da base para entregar materiais.</span>
      <div className="build-tiers" role="group" aria-label="Seus materiais">
        <div className="build-tier" data-active="true">
          <span className="build-cost">
            <span><ItemSprite itemId="wood" size={14} /> {wood} Madeira</span>
            <span><ItemSprite itemId="stone" size={14} /> {stone} Pedra</span>
            <span><ItemSprite itemId="iron_ore" size={14} /> {iron} Ferro</span>
          </span>
        </div>
      </div>
      {close}
    </div>
  );
}
