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

  const missing = (kind: typeof sel.kind, tier: BuildTier) =>
    pieceCost(kind, tier).filter(c => (have[c.itemId] ?? 0) < c.quantity)
      .map(c => `${c.quantity - (have[c.itemId] ?? 0)} ${itemName(c.itemId).toLowerCase()}`);

  return (
    <div className="build-picker" role="toolbar" aria-label="Modo de construção">
      <div className="build-kinds" role="group" aria-label="Tipo de peça">
        {BUILD_PIECE_KINDS.map(kind => (
          <button key={kind} type="button" className="build-kind" data-active={sel.kind === kind}
            aria-pressed={sel.kind === kind} title={`${BASE_PIECES[kind].name} — clique para escolher`}
            aria-label={BASE_PIECES[kind].name} onClick={() => setBuildKind(kind)}>
            {BASE_PIECES[kind].name}
          </button>
        ))}
      </div>
      <div className="build-tiers" role="group" aria-label="Nível da peça">
        {TIERS.map(tier => {
          const lack = missing(sel.kind, tier);
          const blocked = lack.length > 0;
          const cost = pieceCost(sel.kind, tier);
          const name = `${BASE_PIECES[sel.kind].name} nível ${tier} (${TIER_NAME[tier]})`;
          return (
            <button key={tier} type="button" className="build-tier" data-active={sel.tier === tier}
              data-blocked={blocked} aria-pressed={sel.tier === tier} aria-disabled={blocked} disabled={blocked}
              title={blocked ? `${name}: faltam ${lack.join(' e ')}.` : `${name}: ${cost.map(c => `${c.quantity} ${itemName(c.itemId).toLowerCase()}`).join(' + ')} por peça.`}
              aria-label={blocked ? `${name}, indisponível: faltam ${lack.join(' e ')}` : name}
              onClick={() => setBuildTier(tier)}>
              <b>{TIER_NAME[tier]}</b>
              <span className="build-cost">
                {cost.map(c => (
                  <span key={c.itemId} data-short={(have[c.itemId] ?? 0) < c.quantity}>
                    <ItemSprite itemId={c.itemId} size={14} />{have[c.itemId] ?? 0}/{c.quantity}
                  </span>
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {close}
    </div>
  );
}
