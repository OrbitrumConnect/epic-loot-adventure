import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { BASE_RESOURCE_IDS, BASE_RESOURCE_NAMES, BUILDINGS } from '@/game/data/buildings';
import { ITEMS } from '@/game/data/items';
import { UNITS } from '@/game/data/units';
import { UnitSprite } from '@/components/hud/unit-sprite';
import type { BaseResources, PlacedBuilding } from '@/game/types';
import { getEnqueueBlockReason, getQueueCapacity, getRemainingMs, getUnitCost, getUnitsForBuilding, getUpgradeBlockReason, getUpgradeCost } from '@/game/systems/baseSystem';
import { basePieceCost } from '@/game/systems/baseTypeSystem';
import { constructTrainingCamp, nextWall } from '@/game/systems/trainingCampSystem';
import { getItemCount } from '@/game/systems/inventorySystem';

const resourceText = (resources: BaseResources) => BASE_RESOURCE_IDS.filter(id => resources[id] > 0).map(id => `${Math.floor(resources[id])} ${BASE_RESOURCE_NAMES[id]}`).join(' · ') || 'Sem custo';
const seconds = (ms: number) => `${Math.ceil(ms / 1000)}s`;

/** Shared administration for the base HUD and a click on the physical camp. */
export function TrainingPanel({ onClose }: { onClose?: () => void }) {
  const base = useGameStore(s => s.base);
  const playerBase = useGameStore(s => s.playerBase);
  const inventory = useGameStore(s => s.player.inventory);
  const enqueueUnit = useGameStore(s => s.enqueueUnit);
  const upgradeBuilding = useGameStore(s => s.upgradeBuilding);
  const buildCamp = useGameStore(s => s.constructTrainingCamp);
  const buildWall = useGameStore(s => s.constructNextWall);
  const deposit = useGameStore(s => s.depositToBase);
  const deliver = useGameStore(s => s.deliverToBase);
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const camp = base.buildings.find(b => b.defId === 'war_camp');
  const hall = base.buildings.find(b => b.defId === 'tribe_hall');
  const physical = playerBase?.pieces.some(p => p.kind === 'training');
  const buildResult = !physical ? constructTrainingCamp(base, playerBase, inventory, now) : null;
  const wall = playerBase ? nextWall(playerBase) : null;
  const physicalCost = (kind: 'training' | 'wall') => basePieceCost(kind, 1, playerBase?.baseType).map(c => `${c.quantity} ${ITEMS[c.itemId]?.name ?? c.itemId} (${getItemCount(inventory, c.itemId)} na mochila)`).join(' · ');
  const wallAffordable = basePieceCost('wall', 1, playerBase?.baseType).every(c => getItemCount(inventory, c.itemId) >= c.quantity);
  const upgrade = (building: PlacedBuilding) => {
    const reason = getUpgradeBlockReason(base, building.id);
    return <div className="space-y-1">
      <p>{BUILDINGS[building.defId].name} · nível {building.level}</p>
      {building.construction ? <p>Obra nível {building.construction.targetLevel} · {building.construction.endsAt == null ? 'aguardando construtor' : seconds(getRemainingMs(building.construction, now))}</p> : <p>Custo cidade: {resourceText(getUpgradeCost(building.defId, building.level + 1))}</p>}
      <Button size="sm" variant="outline" disabled={Boolean(reason)} onClick={() => upgradeBuilding(building.id)}>Evoluir {BUILDINGS[building.defId].name}</Button>
      {reason && <p className="text-muted-foreground">{reason}</p>}
    </div>;
  };
  return <section className="space-y-3 text-xs" aria-label="Administração da base">
    <div className="flex items-center justify-between"><h3 className="font-semibold">Administração · simulação local</h3>{onClose && <Button size="sm" variant="ghost" onClick={onClose}>Fechar</Button>}</div>
    <p>Estoque cidade: {resourceText(base.resources)}</p>
    <Button size="sm" variant="outline" onClick={deposit}>Depositar mochila na cidade</Button>
    <p className="text-muted-foreground">Depósito transfere recursos. Reserve na mochila o material das peças 3D.</p>
    {!physical && <div className="space-y-1">
      <p>Centro 3D · mochila: {physicalCost('training')}</p>
      <p>Cidade: {camp ? 'Campo de Guerra existente — reutilizado sem cobrar novamente.' : resourceText(getUpgradeCost('war_camp', 1))}</p>
      <Button size="sm" disabled={!buildResult?.ok} onClick={buildCamp}>Construir centro de treinamento</Button>
      {buildResult && !buildResult.ok && <p className="text-muted-foreground">{buildResult.message}</p>}
    </div>}
    {camp && <div className="space-y-2">
      {upgrade(camp)}
      <p>Fila {camp.queue.length}/{getQueueCapacity(base, camp)}</p>
      {camp.queue.length === 0 && <p className="text-muted-foreground">Fila vazia.</p>}
      {camp.queue.map(item => <p key={item.id} className="unit-row"><UnitSprite unitId={item.unitId} size={24} /><span>{UNITS[item.unitId]?.name ?? item.unitId} · {item.endsAt == null ? `aguardando · ${seconds(item.durationMs)}` : seconds(getRemainingMs(item, now))}</span></p>)}
      {getUnitsForBuilding('war_camp').map(unit => {
        const reason = getEnqueueBlockReason(base, camp.id, unit.id);
        return <div key={unit.id} className="space-y-1"><p className="unit-row"><UnitSprite unitId={unit.id} size={40} /><span>{unit.name} · nível {unit.minBuildingLevel} · {resourceText(getUnitCost(base, unit.id))}</span></p><Button size="sm" variant="outline" disabled={Boolean(reason)} onClick={() => enqueueUnit(camp.id, unit.id)}>Treinar {unit.name}</Button>{reason && <p className="text-muted-foreground">{reason}</p>}</div>;
      })}
    </div>}
    <p className="unit-row">Tropas prontas:{Object.entries(base.troops).map(([id, n]) => <span key={id} className="unit-row" title={UNITS[id]?.name ?? id}><UnitSprite unitId={id} size={24} />{UNITS[id]?.name ?? id}: {n}</span>)}{Object.keys(base.troops).length === 0 && ' nenhuma'}</p>
    {hall && upgrade(hall)}
    <div className="space-y-1"><p>Próximo muro · mochila: {physicalCost('wall')}</p><Button size="sm" variant="outline" disabled={!wall || !wallAffordable} onClick={buildWall}>Construir próximo muro</Button><p className="text-muted-foreground">{!wall ? 'Muros completos ou terreno não reivindicado.' : !wallAffordable ? 'Material insuficiente na mochila.' : 'Mantém porta e cantos reservados.'}</p></div>
    <Button size="sm" variant="outline" disabled={!playerBase} onClick={deliver}>Entregar materiais ao perímetro</Button>
  </section>;
}
