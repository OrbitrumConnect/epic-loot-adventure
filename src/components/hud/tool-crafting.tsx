import { Hammer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { ITEMS } from '@/game/data/items';
import { RECIPES } from '@/game/data/recipes';
import { ItemSprite } from './item-sprite';
import { canCraft, getMaterialStatus } from '@/game/systems/craftSystem';
import { getItemCount } from '@/game/systems/inventorySystem';
import { isUnlocked, unlockLevel } from '@/game/systems/unlockSystem';
import { isMobilityItem } from '@/game/systems/zonaSulKit';

/**
 * Receitas de campo: tudo que o jogador faz sem bancada, com o que achou no
 * mundo. Fica fora daqui só o que exige a forja.
 */
const FIELD_RECIPES = [
  'axe', 'pickaxe', 'iron_axe', 'iron_pickaxe',
  'cooked_meat', 'sinew_traps', 'hunter_bow',
  // 01/11 (Pedro: "custa recurso — sai da bolsa"): o kit de mobilidade é fabricado (nível trava; 1 por personagem)
  'surfboard', 'hang_glider', 'hover_skate',
];

/** Seção de fabricação das ferramentas de coleta. Mostra materiais, o que o jogador tem e o motivo quando não dá. */
export function ToolCrafting() {
  const inventory = useGameStore(s => s.player.inventory);
  const level = useGameStore(s => s.player.level);
  const craftItem = useGameStore(s => s.craftItem);
  const ids = FIELD_RECIPES.filter(id => RECIPES[id]);

  if (ids.length === 0) {
    return <p className="tool-craft-empty">Nenhuma receita disponível ainda.</p>;
  }

  return (
    <div className="tool-craft">
      <div className="footer-label"><Hammer />FABRICAR NO CAMPO</div>
      {ids.map(id => {
        const recipe = RECIPES[id];
        if (!recipe) return null;
        const item = ITEMS[recipe.result.itemId];
        const mats = getMaterialStatus(inventory, id);
        const missing = mats.filter(m => !m.ok);
        // kit de mobilidade: trava no nível, 1 por personagem, não pesa (não depende de espaço na mochila)
        const kit = isMobilityItem(recipe.result.itemId);
        const locked = kit && !isUnlocked(recipe.result.itemId, level);
        const owned = kit && getItemCount(inventory, recipe.result.itemId) > 0;
        const ok = kit ? !locked && !owned && missing.length === 0 : canCraft(inventory, id);
        const reason = ok ? '' : locked ? `Libera no nível ${unlockLevel(recipe.result.itemId)}` : owned ? 'Você já tem'
          : missing.length > 0
          ? `Falta: ${missing.map(m => `${m.need - m.have} ${m.name}`).join(', ')}`
          : 'Mochila cheia';
        return (
          <div className="tool-craft-row" key={id} data-ok={ok}>
            <ItemSprite itemId={recipe.result.itemId} size={40} className="tool-craft-sprite" />
            <div className="tool-craft-body">
              <strong>{item?.name ?? id}</strong>
              <span className="tool-craft-mats">
                {mats.map(m => (
                  <span key={m.itemId} data-missing={!m.ok} title={`${m.name}: ${m.have} de ${m.need}`}>
                    <ItemSprite itemId={m.itemId} size={16} />{m.name} {m.have}/{m.need}
                  </span>
                ))}
              </span>
              {!ok && <em className="tool-craft-reason">{reason}</em>}
            </div>
            <Button variant="outline" size="sm" disabled={!ok}
              title={ok ? `Fabricar ${item?.name ?? id}` : reason}
              aria-label={ok ? `Fabricar ${item?.name ?? id}` : `Fabricar ${item?.name ?? id} indisponível: ${reason}`}
              onClick={() => craftItem(id)}>
              Fabricar
            </Button>
          </div>
        );
      })}
    </div>
  );
}
