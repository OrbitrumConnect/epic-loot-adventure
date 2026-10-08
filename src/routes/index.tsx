import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Axe, Backpack, Bot, Camera, Castle, Check, ChevronRight,
  Circle, Coins, Compass, Crosshair, Flame, FlaskConical, Gem, Hammer, Hand,
  Heart, Home, Leaf, ListChecks, Map, Menu, MessageSquare, Mountain, Package,
  PanelLeftClose, Pickaxe, Repeat, Settings, Shield, ShieldCheck, Skull,
  Sparkles, Swords, Target, Tent, Trash2, TreePine, Users, Utensils, Wind, X, Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useGameStore } from '@/game/state/game-store';
import { DEV_INFINITE_POTIONS } from '@/game/config/dev-flags';
import { WorldMap, WorldMapLegend } from '@/components/hud/world-map';
import { ToolCrafting } from '@/components/hud/tool-crafting';
import { ItemSprite, ICON_MAP } from '@/components/hud/item-sprite';
import { RewardFeed, LevelUpBanner } from '@/components/hud/reward-feed';
import { HuntBanner } from '@/components/hud/hunt-banner';
import { ITEMS } from '@/game/data/items';
import { getWeight, getUsedSlots } from '@/game/systems/inventorySystem';
import { canCraft, getMaterialStatus } from '@/game/systems/craftSystem';
import { gameClock } from '@/game/systems/dayNightSystem';
import { specialCooldown } from '@/game/systems/progressionSystem';
import { weaponFor } from '@/game/data/weapons';
import { RECIPES } from '@/game/data/recipes';
import type { ObjectiveKind, ObjectiveStatus } from '@/game/types';
import {
  clearObjectives, removeObjective, reorderObjective, setAutoMode, toggleAutoMode,
  toggleRepeat, useObjectivesState, useTargetIdState,
} from '@/components/world/objective-bridge';
import { INTENT_LABEL, readPilotStatus, type PilotStatus } from '@/components/world/pilot-status';

const GameWorld = lazy(() => import('@/components/game-world'));
const CityView = lazy(() => import('@/components/city-view'));

export const Route = createFileRoute('/')({
  head: () => ({
    meta: [
      { title: 'TRIBOS — Vale dos Ancestrais' },
      { name: 'description', content: 'Explore o Vale dos Ancestrais no TRIBOS. Colete recursos, encontre perigos e volte à sua tribo.' },
      { property: 'og:title', content: 'TRIBOS — Vale dos Ancestrais' },
      { property: 'og:description', content: 'O mundo dá o motivo. Você cria a história. Entre no mundo de TRIBOS.' },
      { property: 'og:type', content: 'website' },
      { name: 'twitter:card', content: 'summary_large_image' },
    ],
  }),
  component: Index,
});

const OBJECTIVE_ICON: Record<ObjectiveKind, React.ComponentType<React.SVGProps<SVGSVGElement>>> = {
  clear_camp: Tent,
  hunt_creature: Swords,
  gather_node: Pickaxe,
  hunt_area: Crosshair,
  travel: Compass,
};

const OBJECTIVE_STATUS: Record<ObjectiveStatus, string> = {
  queued: 'Na fila',
  active: 'Em curso',
  done: 'Concluído',
  failed: 'Falhou',
  cancelled: 'Cancelado',
};

const navigation = [
  { id: 'world', name: 'Explorar', icon: Compass },
  { id: 'objectives', name: 'Objetivos', icon: ListChecks },
  { id: 'home', name: 'Home · Base', icon: Home },
  { id: 'city', name: 'Cidade', icon: Castle },
  { id: 'map', name: 'Mapa', icon: Map },
  { id: 'raid', name: 'Raids', icon: Swords },
  { id: 'loot', name: 'Loot', icon: Package },
  { id: 'inventory', name: 'Inventário', icon: Backpack },
];

function Index() {
  const [ready, setReady] = useState(false);
  const [cameraMode, setCameraMode] = useState<'iso' | 'third'>('iso');
  const [deathCountdown, setDeathCountdown] = useState(0);
  const toggleCamera = useCallback(() => setCameraMode(m => (m === 'iso' ? 'third' : 'iso')), []);
  useEffect(() => setReady(true), []);

  // Level-up: destaque breve quando o nível sobe (sem sistema novo de mensagens).
  const [levelUpFlash, setLevelUpFlash] = useState(false);
  const prevLevel = useRef<number | null>(null);

  const player = useGameStore(s => s.player);
  const ui = useGameStore(s => s.ui);
  const attackTick = useGameStore(s => s.attackTick);

  const objectives = useObjectivesState();
  const targetId = useTargetIdState();
  const idleMode = objectives.mode === 'idle';

  // O piloto escreve o estado fora do React (laço de quadro). Polling leve.
  const [pilot, setPilot] = useState<PilotStatus>(() => ({ ...readPilotStatus() }));
  useEffect(() => {
    const id = setInterval(() => {
      const next = readPilotStatus();
      setPilot(prev => (prev.label === next.label && prev.detail === next.detail && prev.kind === next.kind
        ? prev
        : { ...next }));
    }, 250);
    return () => clearInterval(id);
  }, []);

  // Relógio do jogo (ciclo dia/noite de 30 min). Atualiza a cada segundo.
  const [clock, setClock] = useState(() => gameClock());
  useEffect(() => {
    const id = setInterval(() => setClock(gameClock()), 1000);
    return () => clearInterval(id);
  }, []);

  // Cooldown do especial (Q/R compartilham). `clock` tica a cada 1s e força o recompute.
  void clock;
  const specialLeft = Math.max(0, Math.ceil(specialCooldown(player.level) - (Date.now() / 1000 - (player.lastSpecialAt ?? 0))));

  const activeObjective = objectives.items.find(o => o.status === 'active')
    ?? objectives.items.find(o => o.status === 'queued')
    ?? null;

  useEffect(() => {
    if (prevLevel.current !== null && player.level > prevLevel.current) {
      setLevelUpFlash(true);
      const id = setTimeout(() => setLevelUpFlash(false), 3500);
      prevLevel.current = player.level;
      return () => clearTimeout(id);
    }
    prevLevel.current = player.level;
    return undefined;
  }, [player.level]);

  const autoPotion = useGameStore(s => s.autoPotion);
  const toggleAutoPotion = useGameStore(s => s.toggleAutoPotion);
  const autoHuntRadius = useGameStore(s => s.autoHuntRadius);
  const setAutoHuntRadius = useGameStore(s => s.setAutoHuntRadius);
  const drinkPotion = useGameStore(s => s.drinkPotion);
  const xpPct = player.xpToNext > 0 ? Math.min(100, Math.round((player.xp / player.xpToNext) * 100)) : 0;

  const attack = useGameStore(s => s.attack);
  const collectNearest = useGameStore(s => s.collectNearest);
  const specialAttack = useGameStore(s => s.specialAttack);
  const useHotbarSlot = useGameStore(s => s.useHotbarSlot);
  const craftItem = useGameStore(s => s.craftItem);
  const rest = useGameStore(s => s.rest);
  const setPanel = useGameStore(s => s.setPanel);
  const setMode = useGameStore(s => s.setMode);
  const toggleSidebar = useGameStore(s => s.toggleSidebar);
  const toggleChat = useGameStore(s => s.toggleChat);
  const updatePosition = useGameStore(s => s.updatePosition);
  const startRaid = useGameStore(s => s.startRaid);
  const exitToWorld = useGameStore(s => s.exitToWorld);
  const setPanelMessage = useGameStore(s => s.setPanelMessage);

  useEffect(() => {
    if (!player.dead) { setDeathCountdown(0); return; }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((player.respawnAt - Date.now()) / 1000));
      setDeathCountdown(remaining);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [player.dead, player.respawnAt]);

  const weight = getWeight(player.inventory);
  const usedSlots = getUsedSlots(player.inventory);

  const woodCount = useGameStore(s => s.getItemCount)('wood');
  const stoneCount = useGameStore(s => s.getItemCount)('stone');
  const essenceCount = useGameStore(s => s.getItemCount)('arcane_essence');
  const potionCount = useGameStore(s => s.getItemCount)('health_potion');
  const hasCraftedSword = player.inventory.slots.some(s => s.itemId === 'iron_sword');
  const totalResources = woodCount + stoneCount + essenceCount;
  const position = [player.position.x, player.position.z];

  const hitNearest = useCallback(() => {
    const state = useGameStore.getState();
    const creatures = state.creatures;
    const p = state.player.position;
    const dist = (c: { position: { x: number; z: number } }) => {
      const dx = c.position.x - p.x;
      const dz = c.position.z - p.z;
      return Math.sqrt(dx * dx + dz * dz);
    };

    // Alcance vem da arma na mão (melee ~4 m, ranged até 22 m).
    const selSlot = state.player.inventory.hotbar.slots[state.ui.selectedHotbar];
    const heldId = selSlot != null ? state.player.inventory.slots[selSlot]?.itemId ?? null : null;
    const range = weaponFor(heldId).range;

    // Alvo selecionado tem prioridade sobre o mais próximo.
    const selectedId = (state as unknown as { targetId?: string | null }).targetId ?? null;
    if (selectedId) {
      const selected = creatures.find(c => c.id === selectedId && c.behavior !== 'dead');
      if (selected && dist(selected) <= range) { attack(selected.id); return; }
    }

    let nearest: string | null = null;
    let bestDist = Infinity;
    for (const c of creatures) {
      if (c.behavior === 'dead') continue;
      const d = dist(c);
      if (d < bestDist) { bestDist = d; nearest = c.id; }
    }
    if (nearest && bestDist <= range) attack(nearest);
    else useGameStore.getState().setMessage('Nenhum inimigo próximo.');
  }, [attack]);

  const inCity = ui.mode === 'city';

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      // 1–9 → slots 0–8; 0 → slot 9. Demais slots (ex.: rifle) por clique.
      if (/^[0-9]$/.test(e.key)) useHotbarSlot(e.key === '0' ? 9 : Number(e.key) - 1);
      if (e.code === 'KeyE' && !inCity) collectNearest();
      if (e.code === 'KeyQ' && !inCity) specialAttack('jump');
      if (e.code === 'KeyR' && !inCity) specialAttack('spin');
      if (e.code === 'Space') { e.preventDefault(); /* jump handled in game-world */ }
      if (e.code === 'KeyV' && !inCity) toggleCamera();
      if (e.code === 'KeyG' && !inCity) toggleAutoMode();
      if (e.code === 'KeyB') { setPanel(null); setMode(inCity ? 'world' : 'city'); }
      if (e.code === 'KeyI') setPanel(ui.panel === 'inventory' ? null : 'inventory');
      if (e.code === 'Escape') setPanel(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [collectNearest, specialAttack, hitNearest, useHotbarSlot, setPanel, setMode, toggleCamera, ui.panel, inCity]);

  function open(id: string) {
    setPanelMessage('');
    if (id === 'world') { setPanel(null); setMode('world'); }
    else if (id === 'city') { setPanel(null); setMode('city'); }
    else setPanel(id);
  }

  const hotbarItems = player.inventory.hotbar.slots.map(slotIdx => {
    if (slotIdx == null) return null;
    const slot = player.inventory.slots[slotIdx];
    if (!slot?.itemId) return null;
    const item = ITEMS[slot.itemId];
    if (!item) return null;
    return { ...item, quantity: slot.quantity, invSlot: slotIdx };
  });

  const panel = ui.panel;
  const title = panel === 'inventory' ? 'Inventário' : panel === 'loot' ? 'Loot da expedição' : panel === 'home' ? 'Base da tribo' : panel === 'map' ? 'Vale dos Ancestrais' : panel === 'raid' ? 'Operações' : panel === 'objectives' ? 'Fila de objetivos' : panel === 'settings' ? 'Preferências' : 'Tribo dos Guardiões';

  return (
    <div className={`game-shell ${ui.sidebarCollapsed ? 'shell-collapsed' : ''}`}>
      <aside className="game-sidebar" aria-label="Navegação do jogo">
        <div className="brand"><ShieldCheck strokeWidth={1.3} /><span className="brand-name">TRIBOS</span></div>
        <div className="sidebar-label">SEU MUNDO</div>
        <nav className="sidebar-nav">
          {navigation.map(item => (
            <Button key={item.id} variant="ghost" className="nav-item" title={item.name}
              data-active={panel === item.id || (!panel && item.id === ui.mode)} onClick={() => open(item.id)}>
              <item.icon strokeWidth={1.5} /><span>{item.name}</span>
              {item.id === 'loot' && <span className="nav-count">{totalResources}</span>}
            </Button>
          ))}
        </nav>
        <div className="sidebar-label">COMUNIDADE</div>
        <nav className="sidebar-nav">
          <Button variant="ghost" className="nav-item" title="Minha tribo" data-active={panel === 'tribe'} onClick={() => open('tribe')}>
            <Users strokeWidth={1.5} /><span>Minha tribo</span>
          </Button>
          <Button variant="ghost" className="nav-item" title="Chat" onClick={toggleChat}>
            <MessageSquare strokeWidth={1.5} /><span>Chat</span>
          </Button>
        </nav>
        <div className="sidebar-bottom">
          <div className="tribe-emblem"><Shield strokeWidth={1.2} /><div><strong>Os Guardiões</strong><small>Era do Ferro · Nível 1</small></div></div>
          <div className="server-status"><i className="status-dot" /> Protótipo local <span className="ml-auto">v0.2</span></div>
        </div>
      </aside>

      <main className="game-main">
        <header className="game-header">
          <Button variant="ghost" size="icon" className="icon-control"
            title={ui.sidebarCollapsed ? 'Expandir navegação' : 'Recolher navegação'}
            aria-label={ui.sidebarCollapsed ? 'Expandir navegação' : 'Recolher navegação'}
            onClick={toggleSidebar}>
            {ui.sidebarCollapsed ? <Menu /> : <PanelLeftClose />}
          </Button>
          <div className="player-profile">
            <div className="portrait"><ShieldCheck strokeWidth={1.2} /></div>
            <div>
              <div className="player-name" data-levelup={levelUpFlash}>
                {player.name} <span className="text-primary">· {String(player.level).padStart(2, '0')}</span>
                {levelUpFlash && <span className="levelup-chip" role="status">NÍVEL {player.level}!</span>}
              </div>
              <div className="player-class">Guerreiro · Era do Ferro</div>
              <div className="xp-bar" data-levelup={levelUpFlash} title={`Experiência: ${player.xp} de ${player.xpToNext} (total ${player.totalXp})`}>
                <progress value={player.xp} max={Math.max(1, player.xpToNext)} aria-label="Experiência" />
                <span>XP {player.xp} / {player.xpToNext} <em>{xpPct}%</em></span>
              </div>
            </div>
          </div>
          <div className="vitals">
            {[
              { name: 'Vida', val: player.hp, max: player.maxHp, icon: Heart, kind: 'health' },
              { name: 'Mana', val: player.mana, max: player.maxMana, icon: Sparkles, kind: 'mana' },
              { name: 'Vigor', val: player.stamina, max: player.maxStamina, icon: Zap, kind: 'energy' },
            ].map(v => (
              <div className={`vital vital-${v.kind}`} key={v.kind}>
                <div className="vital-label"><span><v.icon />{v.name}</span><strong>{v.val} / {v.max}</strong></div>
                <progress value={v.val} max={v.max} aria-label={v.name} />
              </div>
            ))}
          </div>
          <div className="header-currency"><Coins />{player.gold}</div>
          <Button variant="ghost" size="icon" className="icon-control" aria-label="Preferências" title="Preferências" onClick={() => open('settings')}><Settings /></Button>
        </header>

        <section className="world-viewport" aria-label="Mundo de TRIBOS">
          {ready && inCity && (
            <Suspense fallback={<div className="world-loading">Abrindo a cidade…</div>}>
              <CityView />
            </Suspense>
          )}
          {ready && !inCity && (
            <Suspense fallback={<div className="world-loading">Entrando no vale…</div>}>
              <GameWorld mode={ui.mode} attack={attackTick} onCollect={collectNearest} onPosition={updatePosition} paused={Boolean(panel)} onAttack={hitNearest} cameraMode={cameraMode} />
            </Suspense>
          )}
          {player.dead && !inCity && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 50,
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              background: 'radial-gradient(ellipse at center, rgba(80,0,0,0.7) 0%, rgba(0,0,0,0.85) 100%)',
              color: '#fff', pointerEvents: 'none',
            }}>
              <Skull style={{ width: 64, height: 64, color: '#ef4444', marginBottom: 16 }} />
              <h2 style={{ fontSize: 32, fontWeight: 700, margin: 0, color: '#ef4444', textShadow: '0 0 20px rgba(239,68,68,0.5)' }}>Você morreu!</h2>
              <p style={{ fontSize: 18, marginTop: 12, opacity: 0.9 }}>
                {deathCountdown > 0
                  ? <>Renascendo em <strong style={{ fontSize: 28, color: '#fbbf24' }}>{deathCountdown}s</strong></>
                  : 'Renascendo...'}
              </p>
              <p style={{ fontSize: 14, marginTop: 8, opacity: 0.6 }}>Você reaparecerá na sua base</p>
            </div>
          )}
          {!inCity && (<>
          <div className="zone-heading">
            <small><i className="status-dot" />{ui.mode === 'raid' ? 'Zona de conflito' : 'Território livre'}</small>
            <h1>{ui.mode === 'raid' ? 'Fortaleza Esquecida' : 'Vale dos Ancestrais'}</h1>
            <div className="zone-meta"><span><TreePine />Floresta temperada</span><span><Shield />Nv. 1 — 10</span></div>
          </div>

          <div className="world-right">
            <div className="minimap"><WorldMap size="mini" /><span className="minimap-north">N</span></div>
            <div className="map-coordinate">
              <span>{Math.round((position[0] ?? 0) + 124)}, {Math.round((position[1] ?? 0) + 86)}</span>
              <span>Dia {clock.day} · {clock.time}</span>
            </div>
            <div className="quest">
              <div className="quest-caption"><Target />SUA EXPEDIÇÃO</div>
              <h2>O primeiro passo</h2>
              <div className="quest-step">{woodCount >= 10 ? <Check /> : <Circle />}<ItemSprite itemId="wood" size={16} />Coletar madeira <strong>{Math.min(woodCount, 10)}/10</strong></div>
              <div className="quest-step">{essenceCount >= 2 ? <Check /> : <Circle />}<ItemSprite itemId="arcane_essence" size={16} />Essências Arcanas <strong>{Math.min(essenceCount, 2)}/2</strong></div>
              <div className="quest-step">{hasCraftedSword ? <Check /> : <Circle />}<ItemSprite itemId="iron_sword" size={16} />Forjar equipamento <strong>{hasCraftedSword ? 1 : 0}/1</strong></div>
            </div>
          </div>

          {/* Faixa compacta: deixa o modo idle legível sem abrir painel */}
          <div className="pilot-strip" data-idle={idleMode}>
            <span className="pilot-mode">
              {idleMode ? <Bot /> : <Hand />}
              {idleMode ? 'IDLE' : 'MANUAL'}
            </span>
            <span className="pilot-objective">
              {activeObjective
                ? <>{(() => { const Icon = OBJECTIVE_ICON[activeObjective.kind]; return <Icon />; })()}{activeObjective.label}</>
                : <>{<ListChecks />}Fila vazia</>}
            </span>
            <span className="pilot-doing">
              {idleMode ? (INTENT_LABEL[pilot.kind] ?? pilot.label) : 'Controle manual'}
              {idleMode && pilot.detail ? <em> · {pilot.detail}</em> : null}
            </span>
            {idleMode && (
              <label className="pilot-hunt" title="Raio que o piloto ocioso usa pra caçar o bicho mais próximo">
                <Crosshair />
                <input
                  type="range" min={5} max={35} step={1} value={autoHuntRadius}
                  onChange={e => setAutoHuntRadius(Number(e.target.value))}
                  aria-label="Raio de caça automática"
                />
                <span>{autoHuntRadius} m</span>
              </label>
            )}
            <Button variant="ghost" size="sm" className="pilot-toggle" title="Alternar piloto automático · G"
              onClick={() => setAutoMode(idleMode ? 'manual' : 'idle')}>
              {idleMode ? 'Assumir' : 'Piloto'}
            </Button>
          </div>

          <HuntBanner />
          <LevelUpBanner />
          <RewardFeed />

          <div className="world-bottom">
            <div className="world-message">
              <div><time>08:42</time><strong>Mundo</strong> · {ui.message}</div>
              {ui.chatOpen && <div><time>08:43</time><strong>Tribo</strong> · Canal local aberto. Os Guardiões.</div>}
            </div>
            <div className="world-actions">
              <Button variant="ghost" className="world-action" aria-label="Pegar / colher" title="Pegar / colher · E" onClick={collectNearest}><Package /></Button>
              <Button variant="ghost" className="world-action" aria-label="Atacar" title="Atacar · Clique esquerdo" data-primary="true" onClick={hitNearest}><Swords /></Button>
              <Button variant="ghost" className="world-action" data-cooldown={specialLeft > 0} aria-label="Especial: salto" title="Especial: Salto (área) · Q" onClick={() => specialAttack('jump')}><Zap />{specialLeft > 0 && <span className="cd">{specialLeft}</span>}</Button>
              <Button variant="ghost" className="world-action" data-cooldown={specialLeft > 0} aria-label="Especial: giro" title="Especial: Giro 360° (área) · R" onClick={() => specialAttack('spin')}><Repeat />{specialLeft > 0 && <span className="cd">{specialLeft}</span>}</Button>
              <Button variant="ghost" className="world-action" aria-label="Câmera" title={`Câmera: ${cameraMode === 'iso' ? 'Isométrica' : '3ª Pessoa'} · V`} onClick={toggleCamera}><Camera /></Button>
              <Button variant="ghost" className="world-action" aria-label="Retornar à base" title="Terminal de retorno" onClick={() => open('home')}><Home /></Button>
            </div>
          </div>
          </>)}

          {panel && (
            <div className="modal-backdrop">
              <section className="game-panel" role="dialog" aria-modal="true" aria-label={title}>
                <div className="panel-heading">
                  <div>
                    <small>{panel === 'map' ? 'Território livre' : panel === 'home' ? 'Os Guardiões' : 'TRIBOS'}</small>
                    <h2>{title}</h2>
                  </div>
                  <Button variant="ghost" size="icon" title="Fechar" aria-label="Fechar" onClick={() => setPanel(null)}><X /></Button>
                </div>

                {(panel === 'inventory' || panel === 'loot') && (
                  <>
                    <div className="inventory-grid">
                      {player.inventory.slots.map((slot, i) => {
                        if (!slot.itemId) return (
                          <div className="inventory-item" key={i} style={{ opacity: 0.3 }}>
                            <Package /><strong>Vazio</strong><small>—</small>
                          </div>
                        );
                        const item = ITEMS[slot.itemId];
                        if (!item) return null;
                        return (
                          <div className="inventory-item" key={i} draggable
                            title={`${item.name}${slot.quantity > 1 ? ` × ${slot.quantity}` : ''}`}
                            aria-label={`${item.name}${slot.quantity > 1 ? ` × ${slot.quantity}` : ''}`}
                            onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}>
                            <ItemSprite itemId={slot.itemId} size={44} /><strong>{item.name}</strong><small>{item.category === 'resource' ? 'Recurso' : item.category === 'weapon' ? 'Arma · ' + item.rarity : item.category === 'consumable' ? 'Consumível' : item.category === 'tool' ? 'Ferramenta' : item.category === 'armor' ? 'Armadura' : item.category}</small>
                            <em>{slot.quantity > 1 ? slot.quantity : ''}</em>
                          </div>
                        );
                      })}
                    </div>
                    <div className="panel-stats">
                      <span>Peso: {weight.toFixed(1)} / {player.inventory.maxWeight} kg</span>
                      <span>{usedSlots} / {player.inventory.maxSlots} slots</span>
                      <span>Era do Ferro</span>
                    </div>
                    <div className="panel-actions">
                      <Button variant="outline" onClick={() => open('home')}><Home />Retornar à base</Button>
                    </div>
                  </>
                )}

                {panel === 'objectives' && (
                  <>
                    <div className="obj-toggles">
                      <Button variant={idleMode ? 'default' : 'outline'} size="sm"
                        onClick={() => setAutoMode('idle')} title="Piloto automático executa a fila · G">
                        <Bot />IDLE
                      </Button>
                      <Button variant={idleMode ? 'outline' : 'default'} size="sm"
                        onClick={() => setAutoMode('manual')} title="Você dirige · G">
                        <Hand />MANUAL
                      </Button>
                      <Button variant="outline" size="sm" data-on={objectives.repeat}
                        className="obj-repeat" onClick={toggleRepeat}
                        title="Recomeçar a fila do topo ao terminar">
                        <Repeat />{objectives.repeat ? 'Repetindo' : 'Sem repetir'}
                      </Button>
                      <Button variant="outline" size="sm" onClick={clearObjectives}
                        disabled={objectives.items.length === 0} title="Limpar fila">
                        <Trash2 />limpar fila
                      </Button>
                    </div>

                    <div className="obj-list">
                      {objectives.items.length === 0 && (
                        <p className="obj-empty">
                          Fila vazia. No mundo: clique num acampamento para enfileirar uma limpeza,
                          Shift+clique num inimigo para caçar, Shift+clique num recurso para coletar.
                        </p>
                      )}
                      {objectives.items.map((obj, i) => {
                        const Icon = OBJECTIVE_ICON[obj.kind] ?? Target;
                        return (
                          <div className="obj-row" key={obj.id} data-status={obj.status}>
                            <span className="obj-index">{String(i + 1).padStart(2, '0')}</span>
                            <Icon />
                            <div className="obj-text">
                              <strong>{obj.label}</strong>
                              <small>{OBJECTIVE_STATUS[obj.status]}</small>
                            </div>
                            <div className="obj-actions">
                              <Button variant="ghost" size="icon" title="Subir na fila" aria-label="Subir na fila"
                                disabled={i === 0} onClick={() => reorderObjective(obj.id, -1)}><ArrowUp /></Button>
                              <Button variant="ghost" size="icon" title="Descer na fila" aria-label="Descer na fila"
                                disabled={i === objectives.items.length - 1} onClick={() => reorderObjective(obj.id, 1)}><ArrowDown /></Button>
                              <Button variant="ghost" size="icon" title="Remover" aria-label="Remover"
                                onClick={() => removeObjective(obj.id)}><X /></Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="panel-stats">
                      <span>{objectives.items.length} objetivo(s) na fila</span>
                      <span>Piloto: {idleMode ? (INTENT_LABEL[pilot.kind] ?? pilot.label) : 'manual'}</span>
                      <span>{targetId ? `Alvo: ${useGameStore.getState().creatures.find(cr => cr.id === targetId)?.name ?? targetId}` : 'Sem alvo'}</span>
                    </div>
                    <div className="panel-actions">
                      <Button onClick={() => setPanel(null)}><Compass />Voltar ao vale</Button>
                    </div>
                  </>
                )}

                {panel === 'map' && (
                  <>
                    <div className="map-large"><WorldMap size="large" /></div>
                    <WorldMapLegend />
                    <div className="panel-actions"><Button onClick={() => setPanel(null)}><Compass />Continuar expedição</Button></div>
                  </>
                )}

                {panel === 'raid' && (
                  <>
                    <div className="raid-row"><Castle /><div><h3>Fortaleza Esquecida</h3><p>Uma fortaleza abandonada no norte do vale.<br />Recursos arcanos e suprimentos sob proteção de criaturas.</p></div></div>
                    <div className="raid-info"><div><span>Risco</span><br />Moderado</div><div><span>Duração</span><br />5 — 20 min</div><div><span>Mini-FOB</span><br />Floresta</div></div>
                    <div className="panel-actions"><Button onClick={startRaid}><Swords />Iniciar operação<ChevronRight /></Button></div>
                  </>
                )}

                {panel === 'home' && (
                  <>
                    <div className="home-grid">
                      <div className="home-building"><Castle /><div><strong>Casa da tribo</strong><small>Nível 1 · Era do Ferro</small></div></div>
                      <div className="home-building"><Shield /><div><strong>Defesas</strong><small>Muralha de madeira</small></div></div>
                    </div>
                    <div className="home-building">
                      <Package /><div><strong>Armazém</strong><small className="item-inline">
                        <span title="Madeira"><ItemSprite itemId="wood" size={16} />{woodCount} madeira</span>
                        <span title="Pedra"><ItemSprite itemId="stone" size={16} />{stoneCount} pedra</span>
                        <span title="Essência Arcana"><ItemSprite itemId="arcane_essence" size={16} />{essenceCount} essências</span>
                      </small></div>
                      <Button variant="outline" size="sm" onClick={rest}>Descansar</Button>
                    </div>
                    <div className="home-building">
                      <ItemSprite itemId="iron_sword" size={34} /><div><strong>Forge</strong><small>Espada de ferro · 10 madeira + 8 pedra</small></div>
                      <Button variant="outline" size="sm" disabled={!canCraft(player.inventory, 'iron_sword')} onClick={() => craftItem('iron_sword')}>Forjar</Button>
                    </div>
                    <ToolCrafting />
                    <div className="panel-actions">
                      <Button onClick={exitToWorld}><Compass />Sair para o mundo<ChevronRight /></Button>
                    </div>
                  </>
                )}

                {panel === 'tribe' && (
                  <>
                    <div className="raid-row"><Shield /><div><h3>Os Guardiões</h3><p>Era do Ferro · Base no Vale dos Ancestrais</p></div></div>
                    <div className="home-building"><ShieldCheck /><div><strong>{player.name}</strong><small>Guerreiro · Fundador</small></div><span className="ml-auto text-health text-xs">No vale</span></div>
                    <div className="panel-stats"><span>1 membro · Sessão local</span><span>Armazém: {totalResources} recursos</span></div>
                  </>
                )}

                {panel === 'settings' && (
                  <>
                    <div className="home-building"><Wind /><div><strong>Áudio ambiente</strong><small>Desativado nesta versão</small></div></div>
                    <div className="home-building"><Compass /><div><strong>Controles</strong><small>WASD andar · Espaço pular · Clique esquerdo atacar · Clique no inimigo seleciona · Shift+clique enfileira · V câmera · E coletar · I inventário · B cidade · G piloto automático (idle/manual)</small></div></div>
                    <div className="panel-stats"><span>TRIBOS v0.2 · Protótipo local · Sem multiplayer conectado</span></div>
                  </>
                )}

                {ui.panelMessage && <p className="panel-message" role="status">{ui.panelMessage}</p>}
              </section>
            </div>
          )}
        </section>

        <footer className="game-footer">
          <div className="loot-summary">
            <div className="footer-label"><Package />LOOT DA EXPEDIÇÃO</div>
            <div className="loot-resources">
              <span title="Madeira"><ItemSprite itemId="wood" size={22} />{woodCount}</span>
              <span title="Pedra"><ItemSprite itemId="stone" size={22} />{stoneCount}</span>
              <span title="Essência Arcana"><ItemSprite itemId="arcane_essence" size={22} />{essenceCount}</span>
            </div>
          </div>
          <div>
            <div className="hotbar-row">
            <div className="hotbar" aria-label="Hotbar">
                {hotbarItems.map((item, i) => {
                  return (
                    <Button variant="ghost" key={i} className="hotbar-slot"
                      title={`${i + 1} · ${item?.name ?? 'Vazio'}`}
                      aria-label={`${i + 1} · ${item?.name ?? 'Vazio'}`}
                      data-active={ui.selectedHotbar === i}
                      onClick={() => useHotbarSlot(i)}
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { const n = Number(e.dataTransfer.getData('text/plain')); if (Number.isInteger(n) && n >= 0 && n < 24) useHotbarSlot(n); }}>
                      <span className="slot-key">{i + 1}</span>
                      {item ? <ItemSprite itemId={item.id} size={40} className="hotbar-sprite" /> : <Package strokeWidth={1.3} aria-hidden="true" />}
                      <span className="slot-count">{item && item.quantity > 1 ? item.quantity : ''}</span>
                    </Button>
                  );
                })}
              </div>
              <div className="potion-ctl" data-on={autoPotion}>
                <Button variant="ghost" className="potion-toggle" data-on={autoPotion} aria-pressed={autoPotion}
                  title={autoPotion ? 'Poção automática LIGADA: bebe sozinho quando a vida cai' : 'Poção automática DESLIGADA'}
                  aria-label={autoPotion ? 'Desligar poção automática' : 'Ligar poção automática'}
                  onClick={toggleAutoPotion}>
                  <FlaskConical strokeWidth={1.4} />
                  <span>{autoPotion ? 'AUTO ON' : 'AUTO OFF'}</span>
                </Button>
                <span className="potion-count" title={DEV_INFINITE_POTIONS ? 'Poções ilimitadas (modo de desenvolvimento)' : `${potionCount} poções`}>
                  × {DEV_INFINITE_POTIONS ? '∞' : potionCount}
                </span>
                <Button variant="ghost" className="potion-drink" title="Beber poção agora" aria-label="Beber poção agora"
                  disabled={!DEV_INFINITE_POTIONS && potionCount <= 0} onClick={drinkPotion}>
                  Beber agora
                </Button>
              </div>
            </div>
            <div className="hotbar-note">{hotbarItems[ui.selectedHotbar]?.name ?? 'Vazio'} <span className="text-primary">·</span> Guerreiro</div>
          </div>
          <div className="bag-summary">
            <div className="footer-label"><Backpack />MOCHILA</div>
            <div className="bag-weight">{weight.toFixed(1)} kg <small>/ {player.inventory.maxWeight} kg</small></div>
            <div className="weight-track" />
          </div>
        </footer>
      </main>
    </div>
  );
}
