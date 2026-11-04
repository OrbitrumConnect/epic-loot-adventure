import { Car, Hammer, Ship } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { ITEMS } from '@/game/data/items';
import { RECIPES } from '@/game/data/recipes';
import { ItemSprite } from './item-sprite';
import { canCraft, getMaterialStatus } from '@/game/systems/craftSystem';
import { getItemCount } from '@/game/systems/inventorySystem';
import { isUnlocked, unlockLevel } from '@/game/systems/unlockSystem';
import { isMobilityItem } from '@/game/systems/zonaSulKit';
import { VEHICLE_COST } from '@/game/data/vehicle-costs';
import { useZsVehicles, zsVehicleApi } from '@/components/zona-sul/zs-context';

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
      <VehicleRows />
    </div>
  );
}

/**
 * CARRO e NAVIO (03/11, Pedro: "fabricar o carro e o navio não estão no card Minha base igual skate e prancha; ambos
 * sumiram — queria poder construir; no mapa deveria aparecer pra eu saber"). Só na Zona Sul (o mundo registra a
 * construção). Mesmas regras do E na garagem/âncora: nível, recurso da bolsa, 1 de cada. Mostra onde está (mapa — M).
 */
function VehicleRows() {
  const car = useZsVehicles((s) => s.car), ship = useZsVehicles((s) => s.ship);
  const inventory = useGameStore((s) => s.player.inventory);
  const level = useGameStore((s) => s.player.level);
  const [msg, setMsg] = useState<{ kind: string; text: string } | null>(null);
  if (!zsVehicleApi.build) return null;
  const rows = [
    { kind: 'car' as const, name: 'Carro voador', unlockId: 'flying_car', cost: VEHICLE_COST.flying_car, info: car, Icon: Car,
      where: 'nasce do seu lado', lost: 'Explodiu — construa outro' },
    { kind: 'ship' as const, name: 'Navio de guerra', unlockId: 'war_ship', cost: VEHICLE_COST.war_ship, info: ship, Icon: Ship,
      where: 'nasce na âncora (mar fundo)', lost: 'Afundou — construa outro' },
  ];
  return (
    <>
      {rows.map(({ kind, name, unlockId, cost, info, Icon, where, lost }) => {
        const locked = !isUnlocked(unlockId, level);
        const have = info?.state === 'ok';
        const missing = cost.filter((c) => getItemCount(inventory, c.id) < c.n);
        const ok = !locked && !have && missing.length === 0 && !(kind === 'ship' && !info);
        const reason = locked ? `Libera no nível ${unlockLevel(unlockId)}` : have ? 'Você já tem — está no mapa (M)'
          : missing.length > 0 ? `Falta: ${missing.map((m) => `${m.n - getItemCount(inventory, m.id)} ${ITEMS[m.id]?.name ?? m.id}`).join(', ')}`
          : kind === 'ship' && !info ? 'Sem âncora nesta sessão' : '';
        const status = have ? 'No mapa (M)' : info?.state === 'gone' ? lost : where;
        return (
          <div className="tool-craft-row" key={kind} data-ok={ok} data-veh={kind}>
            <span className="tool-craft-sprite tool-craft-veh" aria-hidden="true"><Icon /></span>
            <div className="tool-craft-body">
              <strong>{name} <small className="tool-craft-status" data-have={have || undefined}>· {status}</small></strong>
              <span className="tool-craft-mats">
                {cost.map((c) => { const n = getItemCount(inventory, c.id); return (
                  <span key={c.id} data-missing={n < c.n} title={`${ITEMS[c.id]?.name ?? c.id}: ${n} de ${c.n}`}>
                    <ItemSprite itemId={c.id} size={16} />{ITEMS[c.id]?.name ?? c.id} {Math.min(n, c.n)}/{c.n}
                  </span>
                ); })}
              </span>
              {!ok && reason && <em className="tool-craft-reason">{reason}</em>}
              {msg?.kind === kind && <em className="tool-craft-done">{msg.text}</em>}
            </div>
            <Button variant="outline" size="sm" disabled={!ok}
              title={ok ? `Construir ${name}` : reason}
              aria-label={ok ? `Construir ${name}` : `Construir ${name} indisponível: ${reason}`}
              onClick={() => { const m = zsVehicleApi.build?.(kind) ?? ''; setMsg({ kind, text: m }); if (m) useGameStore.getState().setMessage(m); }}>
              Construir
            </Button>
          </div>
        );
      })}
    </>
  );
}
