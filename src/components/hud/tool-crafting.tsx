import { Hammer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { ITEMS } from '@/game/data/items';
import { RECIPES } from '@/game/data/recipes';
import { canCraft, getMaterialStatus } from '@/game/systems/craftSystem';

const TOOL_RECIPES = ['axe', 'pickaxe', 'iron_axe', 'iron_pickaxe'];

/** Seção de fabricação das ferramentas de coleta. Mostra materiais, o que o jogador tem e o motivo quando não dá. */
export function ToolCrafting() {
  const inventory = useGameStore(s => s.player.inventory);
  const craftItem = useGameStore(s => s.craftItem);
  const ids = TOOL_RECIPES.filter(id => RECIPES[id]);

  if (ids.length === 0) {
    return <p className="tool-craft-empty">Nenhuma receita de ferramenta disponível ainda.</p>;
  }

  return (
    <div className="tool-craft">
      <div className="footer-label"><Hammer />FERRAMENTAS DE COLETA</div>
      {ids.map(id => {
        const recipe = RECIPES[id];
        if (!recipe) return null;
        const item = ITEMS[recipe.result.itemId];
        const mats = getMaterialStatus(inventory, id);
        const missing = mats.filter(m => !m.ok);
        const ok = canCraft(inventory, id);
        const reason = ok ? '' : missing.length > 0
          ? `Falta: ${missing.map(m => `${m.need - m.have} ${m.name}`).join(', ')}`
          : 'Mochila cheia';
        return (
          <div className="tool-craft-row" key={id} data-ok={ok}>
            <div className="tool-craft-body">
              <strong>{item?.name ?? id}</strong>
              <span className="tool-craft-mats">
                {mats.map(m => (
                  <span key={m.itemId} data-missing={!m.ok}>{m.name} {m.have}/{m.need}</span>
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
