import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowUp, Axe, Castle, Clock, Compass, Crosshair, Flame, Gem, Hammer, Hourglass, Leaf,
  LocateFixed, Minus, Mountain, Package, Pickaxe, Plus, Shield, Sparkles, Swords, Tent,
  TreePine, Utensils, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import type { BaseResourceId, BaseResources, BaseState, BuildingId, PlacedBuilding } from '@/game/types';
import {
  BASE_RESOURCE_IDS, BASE_RESOURCE_NAMES, BUILDINGS, BUILDING_IDS, DEPOSIT_ITEMS, GRID_SIZE,
  MAX_BUILDING_LEVEL, PLOT_COUNT,
} from '@/game/data/buildings';
import { EXPEDITIONS, EXPEDITION_IDS, SCOUT_UNIT_ID, UNITS } from '@/game/data/units';
import {
  describeBuildingLevel, getBuilding, getBuildingAtPlot, getBuildersInUse, getEnqueueBlockReason,
  getEra, getExpeditionBlockReason, getExpeditionDurationMs, getExpeditionLoot, getIdleScouts,
  getMaxExpeditions, getPlaceBlockReason, getProductionRates, getProgress, getQueueCapacity,
  getRemainingMs, getStorageCap, getToolStashCount, getTroopCount, getUnitCost, getUnitDurationMs,
  getUnitsForBuilding, getUpgradeBlockReason, getUpgradeCost, getUpgradeDurationMs,
  getWaitingConstructions,
} from '@/game/systems/baseSystem';
import { getItemCount } from '@/game/systems/inventorySystem';

type IconType = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const ICONS: Record<string, IconType> = {
  Axe, Castle, Compass, Crosshair, Flame, Gem, Hammer, Leaf, Mountain, Package, Pickaxe,
  Shield, Sparkles, Swords, Tent, TreePine, Utensils,
};

const RESOURCE_ICONS: Record<BaseResourceId, IconType> = {
  wood: TreePine,
  stone: Mountain,
  food: Utensils,
  essence: Gem,
};

// --- Geometria isométrica (apenas apresentação) ---
const TILE_W = 220;
const TILE_H = 110;
const MIN_ZOOM = 0.45;
const MAX_ZOOM = 1.9;
const GROUND_W = GRID_SIZE * TILE_W + 260;
const GROUND_H = GRID_SIZE * TILE_H + 130;
const PLOTS = Array.from({ length: PLOT_COUNT }, (_, index) => {
  const col = index % GRID_SIZE;
  const row = Math.floor(index / GRID_SIZE);
  return {
    index,
    depth: col + row,
    x: ((col - row) * TILE_W) / 2,
    y: ((col + row) * TILE_H) / 2 - ((GRID_SIZE - 1) * TILE_H) / 2,
  };
}).sort((a, b) => a.depth - b.depth);

type View = { x: number; y: number; zoom: number };
type Selection = { kind: 'plot'; plotIndex: number } | { kind: 'building'; id: string } | null;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`;
  return `${s}s`;
}

function formatAmount(value: number): string {
  const n = Math.floor(value);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// --- Sprite com degradação: nível pedido -> níveis menores -> ícone ---
const failedSprites = new Set<string>();

function spriteUrl(defId: BuildingId, level: number) {
  return `/assets/city/buildings/${defId}/lvl-${String(level).padStart(2, '0')}.webp`;
}

function nextCandidate(defId: BuildingId, from: number) {
  let level = from;
  while (level >= 1 && failedSprites.has(spriteUrl(defId, level))) level -= 1;
  return Math.max(0, level);
}

function SpriteImage({ defId, level, size }: { defId: BuildingId; level: number; size: number }) {
  const [candidate, setCandidate] = useState(() => nextCandidate(defId, level));
  const [loaded, setLoaded] = useState(false);
  const Icon = ICONS[BUILDINGS[defId].icon] ?? Castle;
  const url = candidate >= 1 ? spriteUrl(defId, candidate) : null;

  return (
    <span className="city-sprite" style={{ width: size, height: size }}>
      {!loaded && <span className="city-sprite-fallback"><Icon /></span>}
      {url && (
        <img
          key={url}
          src={url}
          alt=""
          draggable={false}
          style={{ visibility: loaded ? 'visible' : 'hidden' }}
          onLoad={() => setLoaded(true)}
          onError={() => {
            failedSprites.add(url);
            setLoaded(false);
            setCandidate(nextCandidate(defId, candidate - 1));
          }}
        />
      )}
    </span>
  );
}

function BuildingSprite({ defId, level, size }: { defId: BuildingId; level: number; size: number }) {
  const wanted = clamp(Math.round(level), 1, MAX_BUILDING_LEVEL);
  return <SpriteImage key={`${defId}:${wanted}`} defId={defId} level={wanted} size={size} />;
}

function CostChips({ cost, resources }: { cost: BaseResources; resources: BaseResources }) {
  const ids = BASE_RESOURCE_IDS.filter(id => cost[id] > 0);
  if (ids.length === 0) return <span className="city-cost"><span>Grátis</span></span>;
  return (
    <span className="city-cost">
      {ids.map(id => {
        const Icon = RESOURCE_ICONS[id];
        return (
          <span key={id} title={BASE_RESOURCE_NAMES[id]} data-missing={resources[id] < cost[id]}>
            <Icon />{formatAmount(cost[id])}
          </span>
        );
      })}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="city-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <i style={{ width: `${Math.round(value * 1000) / 10}%` }} />
    </div>
  );
}

function BuildMenu({ base, plotIndex, onClose }: { base: BaseState; plotIndex: number; onClose: () => void }) {
  const placeBuilding = useGameStore(s => s.placeBuilding);
  return (
    <>
      <div className="city-panel-heading">
        <div><small>Terreno livre</small><h2>Construir</h2></div>
        <Button variant="ghost" size="icon" title="Fechar" aria-label="Fechar" onClick={onClose}><X /></Button>
      </div>
      <div className="city-list">
        {BUILDING_IDS.map(defId => {
          const def = BUILDINGS[defId];
          const reason = getPlaceBlockReason(base, defId, plotIndex);
          return (
            <div className="city-row" key={defId} data-disabled={Boolean(reason)}>
              <BuildingSprite defId={defId} level={1} size={64} />
              <div className="city-row-body">
                <strong>{def.name}</strong>
                <small>{def.description}</small>
                <div className="city-row-meta">
                  <CostChips cost={getUpgradeCost(defId, 1)} resources={base.resources} />
                  <span className="city-time"><Clock />{formatDuration(getUpgradeDurationMs(base, defId, 1))}</span>
                </div>
                {reason && <em className="city-reason">{reason}</em>}
              </div>
              <Button variant="outline" size="sm" disabled={Boolean(reason)} title={reason ?? `Construir ${def.name}`}
                onClick={() => { placeBuilding(defId, plotIndex); onClose(); }}>
                Construir
              </Button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function ExpeditionControls({ base, now }: { base: BaseState; now: number }) {
  const sendExpedition = useGameStore(s => s.sendExpedition);
  const [scouts, setScouts] = useState(1);
  const idle = getIdleScouts(base);
  const total = base.troops[SCOUT_UNIT_ID] ?? 0;
  const count = clamp(scouts, 1, Math.max(1, idle));

  return (
    <section className="city-section">
      <h3>Expedições <span>{base.expeditions.length}/{getMaxExpeditions(base)}</span></h3>
      <div className="city-stats">
        <span>Batedores livres: <strong>{idle}/{total}</strong></span>
        <span>Mapa explorado: <strong>{base.explored.toFixed(1)}%</strong></span>
      </div>
      {base.expeditions.map(expedition => (
        <div className="city-queue-item" key={expedition.id}>
          <Compass />
          <div className="city-row-body">
            <strong>{EXPEDITIONS[expedition.defId]?.name ?? 'Expedição'} · {expedition.scouts} batedor(es)</strong>
            <ProgressBar value={getProgress(expedition, now)} />
          </div>
          <span className="city-time">{formatDuration(getRemainingMs(expedition, now))}</span>
        </div>
      ))}
      <div className="city-stepper">
        <span>Enviar</span>
        <Button variant="outline" size="icon" aria-label="Menos batedores" disabled={count <= 1} onClick={() => setScouts(count - 1)}><Minus /></Button>
        <strong>{count}</strong>
        <Button variant="outline" size="icon" aria-label="Mais batedores" disabled={count >= idle} onClick={() => setScouts(count + 1)}><Plus /></Button>
        <span>batedor(es)</span>
      </div>
      <div className="city-list">
        {EXPEDITION_IDS.map(id => {
          const def = EXPEDITIONS[id]!;
          const reason = getExpeditionBlockReason(base, id, count);
          return (
            <div className="city-row" key={id} data-disabled={Boolean(reason)}>
              <div className="city-row-body">
                <strong>{def.name}</strong>
                <div className="city-row-meta">
                  <CostChips cost={getExpeditionLoot(base, id, count)} resources={getExpeditionLoot(base, id, count)} />
                  <span className="city-time"><Clock />{formatDuration(getExpeditionDurationMs(id))}</span>
                </div>
                {reason && <em className="city-reason">{reason}</em>}
              </div>
              <Button variant="outline" size="sm" disabled={Boolean(reason)} title={reason ?? `Enviar para ${def.name}`}
                onClick={() => sendExpedition(id, count)}>
                Enviar
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function QueueSection({ base, building, now }: { base: BaseState; building: PlacedBuilding; now: number }) {
  const enqueueUnit = useGameStore(s => s.enqueueUnit);
  const cancelQueueItem = useGameStore(s => s.cancelQueueItem);
  const def = BUILDINGS[building.defId];
  const title = def.queueKind === 'research' ? 'Pesquisas' : def.queueKind === 'tool' ? 'Fila da forja' : 'Fila de treino';

  return (
    <section className="city-section">
      <h3>{title} <span>{building.queue.length}/{getQueueCapacity(base, building)}</span></h3>
      {building.queue.length === 0 && <p className="city-empty">Fila vazia.</p>}
      {building.queue.map((item, i) => {
        const unit = UNITS[item.unitId];
        const Icon = ICONS[unit?.icon ?? ''] ?? Package;
        return (
          <div className="city-queue-item" key={item.id}>
            <Icon />
            <div className="city-row-body">
              <strong>{unit?.name ?? item.unitId}</strong>
              {i === 0 ? <ProgressBar value={getProgress(item, now)} /> : <small>Aguardando</small>}
            </div>
            <span className="city-time">{formatDuration(getRemainingMs(item, now))}</span>
            <Button variant="ghost" size="icon" title="Cancelar e devolver recursos" aria-label={`Cancelar ${unit?.name ?? 'item'}`}
              onClick={() => cancelQueueItem(building.id, item.id)}><X /></Button>
          </div>
        );
      })}
      <div className="city-list">
        {getUnitsForBuilding(building.defId).map(unit => {
          const Icon = ICONS[unit.icon] ?? Package;
          const reason = getEnqueueBlockReason(base, building.id, unit.id);
          const cost = getUnitCost(base, unit.id);
          const owned = unit.kind === 'troop'
            ? `Na tribo: ${base.troops[unit.id] ?? 0}`
            : unit.kind === 'research'
              ? `Nível ${base.research[unit.id] ?? 0}/${unit.maxRank ?? 1}`
              : null;
          return (
            <div className="city-row" key={unit.id} data-disabled={Boolean(reason)}>
              <span className="city-unit-icon"><Icon /></span>
              <div className="city-row-body">
                <strong>{unit.name}{owned && <span> · {owned}</span>}</strong>
                <small>{unit.description}</small>
                <div className="city-row-meta">
                  <CostChips cost={cost} resources={base.resources} />
                  <span className="city-time"><Clock />{formatDuration(getUnitDurationMs(base, unit.id))}</span>
                </div>
                {reason && <em className="city-reason">{reason}</em>}
              </div>
              <Button variant="outline" size="icon" disabled={Boolean(reason)} title={reason ?? `Adicionar ${unit.name} à fila`}
                aria-label={`Adicionar ${unit.name} à fila`} onClick={() => enqueueUnit(building.id, unit.id)}>
                <Plus />
              </Button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BuildingPanel({ base, building, now, onClose }: { base: BaseState; building: PlacedBuilding; now: number; onClose: () => void }) {
  const upgradeBuilding = useGameStore(s => s.upgradeBuilding);
  const depositToBase = useGameStore(s => s.depositToBase);
  const inventory = useGameStore(s => s.player.inventory);

  const def = BUILDINGS[building.defId];
  const job = building.construction;
  const target = building.level + 1;
  const atMax = building.level >= def.maxLevel;
  const reason = getUpgradeBlockReason(base, building.id);
  const stash = getToolStashCount(base);
  const carried = DEPOSIT_ITEMS.map(entry => ({ ...entry, quantity: getItemCount(inventory, entry.itemId) }));
  const carriedTotal = carried.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <>
      <div className="city-panel-heading">
        <BuildingSprite defId={building.defId} level={building.level} size={84} />
        <div>
          <small>{building.level >= 1 ? getEra(building.level).name : 'Em construção'}</small>
          <h2>{def.name}</h2>
          <span className="city-level">Nível {building.level}</span>
        </div>
        <Button variant="ghost" size="icon" title="Fechar" aria-label="Fechar" onClick={onClose}><X /></Button>
      </div>
      <p className="city-description">{def.description}</p>

      <div className="city-compare">
        <div>
          <small>Agora</small>
          {describeBuildingLevel(base, building.defId, building.level).map(line => <span key={line}>{line}</span>)}
        </div>
        <div>
          <small>{atMax ? 'Nível máximo' : `Nível ${target}`}</small>
          {!atMax && describeBuildingLevel(base, building.defId, target).map(line => <span key={line}>{line}</span>)}
        </div>
      </div>

      {job ? (
        <section className="city-section">
          <h3>{job.targetLevel === 1 ? 'Construindo' : `Melhorando para o nível ${job.targetLevel}`}
            <span>{job.startedAt == null ? 'Na fila' : formatDuration(getRemainingMs(job, now))}</span>
          </h3>
          <ProgressBar value={getProgress(job, now)} />
          {job.startedAt == null && <p className="city-empty">Aguardando um construtor livre ({formatDuration(job.durationMs)} de obra).</p>}
        </section>
      ) : !atMax && (
        <section className="city-section">
          <div className="city-row-meta">
            <CostChips cost={getUpgradeCost(building.defId, target)} resources={base.resources} />
            <span className="city-time"><Clock />{formatDuration(getUpgradeDurationMs(base, building.defId, target))}</span>
          </div>
          <Button className="city-upgrade" disabled={Boolean(reason)} title={reason ?? `Melhorar para o nível ${target}`}
            onClick={() => upgradeBuilding(building.id)}>
            <ArrowUp />Melhorar para o nível {target}
          </Button>
          {reason && <em className="city-reason">{reason}</em>}
        </section>
      )}

      {building.defId === 'tribe_hall' && (
        <section className="city-section">
          <h3>Depósito <span>Mapa → Base</span></h3>
          <p className="city-empty">
            Na mochila: {carried.map(entry => `${entry.quantity} ${BASE_RESOURCE_NAMES[entry.resource].toLowerCase()}`).join(' · ')}
          </p>
          <Button variant="outline" className="city-upgrade" disabled={carriedTotal === 0}
            title={carriedTotal === 0 ? 'Nada para depositar.' : 'Depositar recursos da mochila'} onClick={depositToBase}>
            <Package />Depositar recursos da mochila
          </Button>
        </section>
      )}

      {building.defId === 'forge' && stash > 0 && (
        <p className="city-reason">{stash} ferramenta(s) aguardando espaço na mochila.</p>
      )}

      {def.queueKind && building.level >= 1 && <QueueSection base={base} building={building} now={now} />}
      {building.defId === 'scout_tent' && building.level >= 1 && <ExpeditionControls base={base} now={now} />}
    </>
  );
}

function BuildingBubble({ building, now }: { building: PlacedBuilding; now: number }) {
  const job = building.construction;
  if (job) {
    return (
      <span className="city-bubble" data-kind="build">
        {job.startedAt == null ? <Hourglass /> : <Hammer />}
        {job.startedAt == null ? 'Na fila' : formatDuration(getRemainingMs(job, now))}
      </span>
    );
  }
  const head = building.queue[0];
  if (!head) return null;
  const Icon = ICONS[UNITS[head.unitId]?.icon ?? ''] ?? Package;
  return (
    <span className="city-bubble" data-kind="queue">
      <Icon />{formatDuration(getRemainingMs(head, now))}
      {building.queue.length > 1 && <em>+{building.queue.length - 1}</em>}
    </span>
  );
}

export default function CityView() {
  const base = useGameStore(s => s.base);
  const message = useGameStore(s => s.ui.message);
  const tickBase = useGameStore(s => s.tickBase);

  const rootRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef({ moved: false });
  const [view, setView] = useState<View>({ x: 0, y: 30, zoom: 0.7 });
  const [selection, setSelection] = useState<Selection>(null);

  // A base é resolvida por timestamp: um tick ao montar recupera o tempo fora da cidade.
  useEffect(() => {
    tickBase();
    const id = window.setInterval(tickBase, 1000);
    return () => window.clearInterval(id);
  }, [tickBase]);

  const fitView = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const zoom = clamp(Math.min(el.clientWidth / 1320, el.clientHeight / 760), MIN_ZOOM, 1.2);
    setView({ x: 0, y: 40 * zoom, zoom });
  }, []);

  useEffect(() => { fitView(); }, [fitView]);

  // Zoom com a roda do mouse, ancorado no cursor (listener não passivo para bloquear o scroll).
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.target instanceof Element && e.target.closest('.city-panel')) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;
      setView(v => {
        const zoom = clamp(v.zoom * (e.deltaY < 0 ? 1.12 : 1 / 1.12), MIN_ZOOM, MAX_ZOOM);
        const ratio = zoom / v.zoom;
        return { zoom, x: cx - (cx - v.x) * ratio, y: cy - (cy - v.y) * ratio };
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const zoomBy = (factor: number) => setView(v => {
    const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
    const ratio = zoom / v.zoom;
    return { zoom, x: v.x * ratio, y: v.y * ratio };
  });

  // Arrastar para mover a cidade; um arrasto não conta como clique.
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.moved = false;
    if (e.button !== 0) return;
    if (e.target instanceof Element && e.target.closest('.city-panel, .city-topbar, .city-zoom')) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const origin = { x: view.x, y: view.y };
    const limit = 900 * view.zoom;

    const onMove = (ev: PointerEvent) => {
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragRef.current.moved && Math.hypot(dx, dy) < 5) return;
      dragRef.current.moved = true;
      setView(v => ({ ...v, x: clamp(origin.x + dx, -limit, limit), y: clamp(origin.y + dy, -limit, limit) }));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      // O clique gerado por este arrasto dispara antes do timeout; os seguintes voltam a valer.
      window.setTimeout(() => { dragRef.current.moved = false; }, 0);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  };

  const select = (next: Selection) => {
    if (dragRef.current.moved) return;
    setSelection(next);
  };

  const now = base.lastTickAt;
  const cap = getStorageCap(base);
  const rates = getProductionRates(base);
  const waiting = getWaitingConstructions(base);
  const selectedBuilding = selection?.kind === 'building' ? getBuilding(base, selection.id) : null;
  const selectedPlot = selection?.kind === 'plot' && !getBuildingAtPlot(base, selection.plotIndex) ? selection.plotIndex : null;

  return (
    <div className="city-view" ref={rootRef} onPointerDown={onPointerDown}>
      <div className="city-stage" style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}>
        <svg className="city-ground" width={GROUND_W} height={GROUND_H} viewBox={`0 0 ${GROUND_W} ${GROUND_H}`}
          style={{ left: -GROUND_W / 2, top: -GROUND_H / 2 }} aria-hidden="true">
          <polygon className="city-ground-outer" points={`${GROUND_W / 2},0 ${GROUND_W},${GROUND_H / 2} ${GROUND_W / 2},${GROUND_H} 0,${GROUND_H / 2}`} />
          <polygon className="city-ground-inner" points={`${GROUND_W / 2},34 ${GROUND_W - 68},${GROUND_H / 2} ${GROUND_W / 2},${GROUND_H - 34} 68,${GROUND_H / 2}`} />
        </svg>

        {PLOTS.map(plot => {
          const building = getBuildingAtPlot(base, plot.index);
          const selected = building
            ? selection?.kind === 'building' && selection.id === building.id
            : selection?.kind === 'plot' && selection.plotIndex === plot.index;
          return (
            <button
              key={plot.index}
              type="button"
              className="city-plot"
              data-selected={selected}
              data-occupied={Boolean(building)}
              aria-label={building ? `${BUILDINGS[building.defId].name}, nível ${building.level}` : `Terreno livre ${plot.index + 1}`}
              style={{ left: plot.x - TILE_W / 2, top: plot.y - TILE_H / 2, width: TILE_W, height: TILE_H }}
              onClick={() => select(building ? { kind: 'building', id: building.id } : { kind: 'plot', plotIndex: plot.index })}
            >
              <svg viewBox={`0 0 ${TILE_W} ${TILE_H}`} aria-hidden="true">
                <polygon points={`${TILE_W / 2},5 ${TILE_W - 10},${TILE_H / 2} ${TILE_W / 2},${TILE_H - 5} 10,${TILE_H / 2}`} />
              </svg>
              {!building && <Plus className="city-plot-plus" />}
            </button>
          );
        })}

        {PLOTS.map(plot => {
          const building = getBuildingAtPlot(base, plot.index);
          if (!building) return null;
          const size = 140 + Math.max(1, building.level) * 2;
          const def = BUILDINGS[building.defId];
          return (
            <div key={building.id} className="city-building" data-site={building.level < 1}
              data-selected={selection?.kind === 'building' && selection.id === building.id}
              style={{ left: plot.x, top: plot.y, zIndex: 10 + plot.depth }}>
              <div className="city-building-art" style={{ left: -size / 2, bottom: -size * 0.2, width: size, height: size }}>
                <BuildingSprite defId={building.defId} level={building.level} size={size} />
                <button type="button" className="city-building-hit" tabIndex={-1} aria-hidden="true"
                  onClick={() => select({ kind: 'building', id: building.id })} />
                <BuildingBubble building={building} now={now} />
              </div>
              <span className="city-nameplate">{def.name}<strong>{building.level >= 1 ? `Nv. ${building.level}` : 'Obra'}</strong></span>
            </div>
          );
        })}
      </div>

      <div className="city-topbar">
        {BASE_RESOURCE_IDS.map(id => {
          const Icon = RESOURCE_ICONS[id];
          return (
            <div className="city-resource" key={id} title={BASE_RESOURCE_NAMES[id]} data-full={base.resources[id] >= cap[id]}>
              <Icon />
              <div>
                <strong>{formatAmount(base.resources[id])}<small> / {formatAmount(cap[id])}</small></strong>
                <span>{rates[id] > 0 ? `+${formatAmount(rates[id])}/min` : BASE_RESOURCE_NAMES[id]}</span>
              </div>
            </div>
          );
        })}
        <div className="city-resource" title="Construtores em uso">
          <Hammer />
          <div>
            <strong>{getBuildersInUse(base)}<small> / {base.builders}</small></strong>
            <span>{waiting > 0 ? `${waiting} na fila` : 'Construtores'}</span>
          </div>
        </div>
        <div className="city-resource" title="Tropas da tribo">
          <Swords />
          <div><strong>{getTroopCount(base)}</strong><span>Tropas</span></div>
        </div>
      </div>

      <div className="city-status" role="status">
        <strong>Cidade</strong> · {message}
      </div>

      <div className="city-zoom">
        <Button variant="ghost" className="world-action" aria-label="Aproximar" title="Aproximar" onClick={() => zoomBy(1.2)}><Plus /></Button>
        <Button variant="ghost" className="world-action" aria-label="Afastar" title="Afastar" onClick={() => zoomBy(1 / 1.2)}><Minus /></Button>
        <Button variant="ghost" className="world-action" aria-label="Centralizar cidade" title="Centralizar cidade" onClick={fitView}><LocateFixed /></Button>
      </div>

      {(selectedBuilding || selectedPlot != null) && (
        <aside className="city-panel" aria-label={selectedBuilding ? BUILDINGS[selectedBuilding.defId].name : 'Construir'}>
          {selectedBuilding && <BuildingPanel base={base} building={selectedBuilding} now={now} onClose={() => setSelection(null)} />}
          {!selectedBuilding && selectedPlot != null && <BuildMenu base={base} plotIndex={selectedPlot} onClose={() => setSelection(null)} />}
        </aside>
      )}
    </div>
  );
}
