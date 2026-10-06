import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Axe, Backpack, Castle, Check, ChevronRight, Circle, Coins, Compass, Crosshair, Flame, FlaskConical, Gem, Hammer, Heart, Home, Leaf, Map, Menu, MessageSquare, Mountain, Package, PanelLeftClose, Pickaxe, Settings, Shield, ShieldCheck, Skull, Sparkles, Swords, Target, Tent, TreePine, Users, Utensils, Wind, X, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
const GameWorld = lazy(() => import('@/components/game-world'));
export const Route = createFileRoute('/')({
  head: () => ({ meta: [
    { title: 'TRIBOS — Vale dos Ancestrais' },
    { name: 'description', content: 'Explore o Vale dos Ancestrais no TRIBOS. Colete recursos, encontre perigos e volte à sua tribo.' },
    { property: 'og:title', content: 'TRIBOS — Vale dos Ancestrais' },
    { property: 'og:description', content: 'O mundo dá o motivo. Você cria a história. Entre no mundo de TRIBOS.' },
    { property: 'og:type', content: 'website' }, { name: 'twitter:card', content: 'summary_large_image' },
  ] }), component: Index,
});
const navigation = [
  { id: 'world', name: 'Explorar', icon: Compass }, { id: 'home', name: 'Home · Base', icon: Home },
  { id: 'map', name: 'Mapa', icon: Map }, { id: 'raid', name: 'Raids', icon: Swords },
  { id: 'loot', name: 'Loot', icon: Package }, { id: 'inventory', name: 'Inventário', icon: Backpack },
];
const equipment = [
  { name: 'Espada de ferro', icon: Swords, count: '1', category: 'Arma · Comum' },
  { name: 'Machado', icon: Axe, count: '1', category: 'Ferramenta' },
  { name: 'Picareta', icon: Pickaxe, count: '1', category: 'Ferramenta' },
  { name: 'Poção de vida', icon: FlaskConical, count: '5', category: 'Consumível' },
  { name: 'Armadilha', icon: Crosshair, count: '3', category: 'Utilitário' },
  { name: 'Carne assada', icon: Utensils, count: '8', category: 'Alimento' },
  { name: 'Tocha', icon: Flame, count: '1', category: 'Utilitário' },
  { name: 'Golpe ancestral', icon: Sparkles, count: '', category: 'Habilidade' },
];
function MiniMap({ large=false, position=[0,1] }: {large?:boolean;position?:number[]}) {
  return <svg viewBox="0 0 200 170" role="img" aria-label="Mapa do Vale dos Ancestrais">
    <rect width="200" height="170" fill="var(--world-ground)"/>
    <path d="M0 20L60 5 90 42 153 22 200 55V0H0ZM0 120L35 100 68 130 95 160 154 141 200 168V170H0Z" fill="var(--world-pine)"/>
    <path d="M38 -10 Q100 44 62 83 T49 180" fill="none" stroke="var(--world-water)" strokeWidth="18"/>
    <path d="M-10 149 Q80 121 99 84 T164 27" fill="none" stroke="var(--world-path)" strokeWidth="4"/>
    {Array.from({length:25},(_,i)=><path key={i} d={`M${(i*43)%190} ${(i*29)%160}l-4 8h8z`} fill="var(--world-leaf)"/>)}
    <rect x="139" y="31" width="17" height="14" fill="var(--world-rock)" stroke="var(--world-rock-light)" strokeWidth="1.5"/>
    <path d="M147 25v-6l8 3-8 3" fill="var(--world-cloak)"/>
    <path d="M39 121l7-7 7 7v10H39z" fill="var(--world-gold)"/>
    <circle cx="85" cy="71" r="3" fill="var(--world-crystal)"/>
    <circle cx={100+(position[0]??0)*2} cy={93+(position[1]??0)*2} r={large?4:3} fill="var(--world-light)" stroke="var(--world-gold)" strokeWidth="2"/>
    <circle cx={100+(position[0]??0)*2} cy={93+(position[1]??0)*2} r="10" fill="none" stroke="var(--world-gold)" strokeWidth=".7" opacity=".6"/>
    {large&&<><text x="123" y="62" fill="var(--world-ink)" fontSize="6" fontFamily="Manrope">Fortaleza esquecida</text><text x="22" y="144" fill="var(--world-ink)" fontSize="6" fontFamily="Manrope">Base da tribo</text><text x="65" y="60" fill="var(--world-ink)" fontSize="6" fontFamily="Manrope">Mina arcana</text></>}
  </svg>;
}
function Index() {
  const [ready,setReady]=useState(false), [collapsed,setCollapsed]=useState(false), [panel,setPanel]=useState<string|null>(null);
  const [mode,setMode]=useState('world'), [slot,setSlot]=useState(0), [attack,setAttack]=useState(0), [health,setHealth]=useState(100);
  const [wood,setWood]=useState(12), [stone,setStone]=useState(8), [essence,setEssence]=useState(0), [potions,setPotions]=useState(5);
  const [position,setPosition]=useState([0,1]), [enemyHealth,setEnemyHealth]=useState(100), [gold,setGold]=useState(250), [crafted,setCrafted]=useState(false);
  const [message,setMessage]=useState('Você entrou no Vale dos Ancestrais.'), [panelMessage,setPanelMessage]=useState(''), [chat,setChat]=useState(false);
  const weight = 6.4 + wood*.15 + stone*.2 + essence*.1;
  useEffect(()=>setReady(true),[]);
  const collect=useCallback(()=>{if(weight>38){setMessage('Mochila cheia. Retorne à base.');return;} setEssence(v=>v+1);setWood(v=>v+2);setStone(v=>v+1);setMessage('Loot recolhido: +1 Essência Arcana, +2 Madeira, +1 Pedra.');},[weight]);
  const hit=useCallback(()=>{setAttack(v=>v+1);setEnemyHealth(v=>{if(v<=25){setGold(g=>g+15);setMessage('Lobo derrotado. +15 moedas.');return 100;}setMessage(`Lobo do vale: ${v-25} / 100 de vida.`);return v-25;});setHealth(v=>Math.max(1,v-4));},[]);
  const useSlot=useCallback((n:number)=>{setSlot(n);if(n===3){if(potions>0){setHealth(v=>Math.min(100,v+30));setPotions(v=>v-1);setMessage('Poção de vida utilizada. +30 de vida.');}else setMessage('Sem poções de vida.');}else if(n===7)hit();else setMessage(`${equipment[n]?.name} equipado.`);},[potions,hit]);
  useEffect(()=>{const handler=(e:KeyboardEvent)=>{if(e.target instanceof HTMLInputElement)return;if(/^[1-8]$/.test(e.key))useSlot(Number(e.key)-1);if(e.code==='KeyE')collect();if(e.code==='Space'){e.preventDefault();hit();}if(e.code==='KeyI')setPanel(v=>v==='inventory'?null:'inventory');if(e.code==='Escape')setPanel(null);};window.addEventListener('keydown',handler);return ()=>window.removeEventListener('keydown',handler);},[collect,hit,useSlot]);
  const trackPosition=useCallback((x:number,z:number)=>setPosition([x,z]),[]);
  function open(id:string){setPanelMessage('');if(id==='world'){setPanel(null);setMode('world');}else setPanel(id);}
  const title=panel==='inventory'?'Inventário':panel==='loot'?'Loot da expedição':panel==='home'?'Base da tribo':panel==='map'?'Vale dos Ancestrais':panel==='raid'?'Operações':panel==='settings'?'Preferências':'Tribo dos Guardiões';
  return <div className={`game-shell ${collapsed?'shell-collapsed':''}`}>
    <aside className="game-sidebar" aria-label="Navegação do jogo">
      <div className="brand"><ShieldCheck strokeWidth={1.3}/><span className="brand-name">TRIBOS</span></div>
      <div className="sidebar-label">SEU MUNDO</div>
      <nav className="sidebar-nav">{navigation.map(item=><Button key={item.id} variant="ghost" className="nav-item" title={item.name} data-active={panel===item.id||(!panel&&item.id===mode)} onClick={()=>open(item.id)}><item.icon strokeWidth={1.5}/><span>{item.name}</span>{item.id==='loot'&&<span className="nav-count">{wood+stone+essence}</span>}</Button>)}</nav>
      <div className="sidebar-label">COMUNIDADE</div>
      <nav className="sidebar-nav"><Button variant="ghost" className="nav-item" title="Minha tribo" data-active={panel==='tribe'} onClick={()=>open('tribe')}><Users strokeWidth={1.5}/><span>Minha tribo</span></Button><Button variant="ghost" className="nav-item" title="Chat" onClick={()=>setChat(v=>!v)}><MessageSquare strokeWidth={1.5}/><span>Chat</span></Button></nav>
      <div className="sidebar-bottom"><div className="tribe-emblem"><Shield strokeWidth={1.2}/><div><strong>Os Guardiões</strong><small>Era do Ferro · Nível 1</small></div></div><div className="server-status"><i className="status-dot"/> Protótipo local <span className="ml-auto">v0.1</span></div></div>
    </aside>
    <main className="game-main">
      <header className="game-header">
        <Button variant="ghost" size="icon" className="icon-control" title={collapsed?'Expandir navegação':'Recolher navegação'} aria-label={collapsed?'Expandir navegação':'Recolher navegação'} onClick={()=>setCollapsed(v=>!v)}>{collapsed?<Menu/>:<PanelLeftClose/>}</Button>
        <div className="player-profile"><div className="portrait"><ShieldCheck strokeWidth={1.2}/></div><div><div className="player-name">Kael <span className="text-primary">· 01</span></div><div className="player-class">Guerreiro · Era do Ferro</div></div></div>
        <div className="vitals">{[{name:'Vida',val:health,icon:Heart,kind:'health'},{name:'Mana',val:80,icon:Sparkles,kind:'mana'},{name:'Vigor',val:100,icon:Zap,kind:'energy'}].map(v=><div className={`vital vital-${v.kind}`} key={v.kind}><div className="vital-label"><span><v.icon/>{v.name}</span><strong>{v.val} / 100</strong></div><progress value={v.val} max={100} aria-label={v.name}/></div>)}</div>
        <div className="header-currency"><Coins/>{gold}</div>
        <Button variant="ghost" size="icon" className="icon-control" aria-label="Preferências" title="Preferências" onClick={()=>open('settings')}><Settings/></Button>
      </header>
      <section className="world-viewport" aria-label="Mundo de TRIBOS">
        {ready&&<Suspense fallback={<div className="world-loading">Entrando no vale…</div>}><GameWorld mode={mode} attack={attack} onCollect={collect} onPosition={trackPosition} paused={Boolean(panel)}/></Suspense>}
        <div className="zone-heading"><small><i className="status-dot"/>{mode==='raid'?'Zona de conflito':'Território livre'}</small><h1>{mode==='raid'?'Fortaleza Esquecida':'Vale dos Ancestrais'}</h1><div className="zone-meta"><span><TreePine/>Floresta temperada</span><span><Shield/>Nv. 1 — 10</span></div></div>
        <div className="world-right"><div className="minimap"><MiniMap position={position}/><span className="minimap-north">N</span></div><div className="map-coordinate"><span>{Math.round((position[0]??0)+124)}, {Math.round((position[1]??0)+86)}</span><span>Dia 1 · 08:42</span></div><div className="quest"><div className="quest-caption"><Target/>SUA EXPEDIÇÃO</div><h2>O primeiro passo</h2><div className="quest-step">{wood>=10?<Check/>:<Circle/>}Coletar madeira <strong>{Math.min(wood,10)}/10</strong></div><div className="quest-step">{essence>=2?<Check/>:<Circle/>}Essências Arcanas <strong>{Math.min(essence,2)}/2</strong></div><div className="quest-step">{crafted?<Check/>:<Circle/>}Forjar equipamento <strong>{crafted?1:0}/1</strong></div></div></div>
        <div className="world-bottom"><div className="world-message"><div><time>08:42</time><strong>Mundo</strong> · {message}</div>{chat&&<div><time>08:43</time><strong>Tribo</strong> · Canal local aberto. Os Guardiões.</div>}</div><div className="world-actions"><Button variant="ghost" className="world-action" aria-label="Coletar recursos" title="Coletar recursos · E" onClick={collect}><Package/></Button><Button variant="ghost" className="world-action" aria-label="Atacar" title="Atacar · Espaço" data-primary="true" onClick={hit}><Swords/></Button><Button variant="ghost" className="world-action" aria-label="Retornar à base" title="Terminal de retorno" onClick={()=>open('home')}><Home/></Button></div></div>
        {panel&&<div className="modal-backdrop"><section className="game-panel" role="dialog" aria-modal="true" aria-label={title}><div className="panel-heading"><div><small>{panel==='map'?'Território livre':panel==='home'?'Os Guardiões':'TRIBOS'}</small><h2>{title}</h2></div><Button variant="ghost" size="icon" title="Fechar" aria-label="Fechar" onClick={()=>setPanel(null)}><X/></Button></div>
          {(panel==='inventory'||panel==='loot')&&<><div className="inventory-grid">{(panel==='inventory'?equipment:[]).map((item,i)=><div className="inventory-item" key={item.name} draggable onDragStart={e=>e.dataTransfer.setData('text/plain',String(i))}><item.icon/><strong>{item.name}</strong><small>{item.category}</small><em>{i===3?potions:item.count}</em></div>)}{[{name:'Madeira',icon:TreePine,count:wood},{name:'Pedra',icon:Mountain,count:stone},{name:'Essência Arcana',icon:Gem,count:essence}].map(item=><div className="inventory-item" key={item.name}><item.icon/><strong>{item.name}</strong><small>Recurso</small><em>{item.count}</em></div>)}</div><div className="panel-stats"><span>Peso: {weight.toFixed(1)} / 40 kg</span><span>{panel==='inventory'?11:3} / 24 slots</span><span>Era do Ferro</span></div><div className="panel-actions"><Button variant="outline" onClick={()=>open('home')}><Home/>Retornar à base</Button></div></>}
          {panel==='map'&&<><div className="map-large"><MiniMap large position={position}/></div><div className="map-legend"><span><Home/>Sua base</span><span><Gem/>Mina arcana</span><span><Castle/>Fortaleza</span></div><div className="panel-actions"><Button onClick={()=>setPanel(null)}><Compass/>Continuar expedição</Button></div></>}
          {panel==='raid'&&<><div className="raid-row"><Castle/><div><h3>Fortaleza Esquecida</h3><p>Uma fortaleza abandonada no norte do vale.<br/>Recursos arcanos e suprimentos sob proteção de criaturas.</p></div></div><div className="raid-info"><div><span>Risco</span><br/>Moderado</div><div><span>Duração</span><br/>5 — 20 min</div><div><span>Mini-FOB</span><br/>Floresta</div></div><div className="panel-actions"><Button onClick={()=>{setMode('raid');setPanel(null);setMessage('Operação local iniciada. A Fortaleza Esquecida aguarda.');}}><Swords/>Iniciar operação<ChevronRight/></Button></div></>}
          {panel==='home'&&<><div className="home-grid"><div className="home-building"><Castle/><div><strong>Casa da tribo</strong><small>Nível 1 · Era do Ferro</small></div></div><div className="home-building"><Shield/><div><strong>Defesas</strong><small>Muralha de madeira</small></div></div></div><div className="home-building"><Package/><div><strong>Armazém</strong><small>{wood} madeira · {stone} pedra · {essence} essências</small></div><Button variant="outline" size="sm" onClick={()=>{setHealth(100);setPanelMessage('Recursos conferidos. Vida restaurada na base.');}}>Descansar</Button></div><div className="home-building"><Hammer/><div><strong>Forge</strong><small>Espada de ferro · 10 madeira + 8 pedra</small></div><Button variant="outline" size="sm" disabled={wood<10||stone<8} onClick={()=>{setWood(v=>v-10);setStone(v=>v-8);setCrafted(true);setPanelMessage('Espada de ferro forjada. Objetivo concluído.');}}>Forjar</Button></div><div className="panel-actions"><Button onClick={()=>{setPanel(null);setMode('world');setMessage('Uma nova expedição começou.');}}><Compass/>Sair para o mundo<ChevronRight/></Button></div></>}
          {panel==='tribe'&&<><div className="raid-row"><Shield/><div><h3>Os Guardiões</h3><p>Era do Ferro · Base no Vale dos Ancestrais</p></div></div><div className="home-building"><ShieldCheck/><div><strong>Kael</strong><small>Guerreiro · Fundador</small></div><span className="ml-auto text-health text-xs">No vale</span></div><div className="panel-stats"><span>1 membro · Sessão local</span><span>Armazém: {wood+stone+essence} recursos</span></div></>}
          {panel==='settings'&&<><div className="home-building"><Wind/><div><strong>Áudio ambiente</strong><small>Desativado nesta versão</small></div></div><div className="home-building"><Compass/><div><strong>Controles</strong><small>WASD · Clique para mover · E coletar · Espaço atacar</small></div></div><div className="panel-stats"><span>TRIBOS v0.1 · Protótipo local · Sem multiplayer conectado</span></div></>}
          {panelMessage&&<p className="panel-message" role="status">{panelMessage}</p>}
        </section></div>}
      </section>
      <footer className="game-footer"><div className="loot-summary"><div className="footer-label"><Package/>LOOT DA EXPEDIÇÃO</div><div className="loot-resources"><span title="Madeira"><TreePine/>{wood}</span><span title="Pedra"><Mountain/>{stone}</span><span title="Essência Arcana"><Gem/>{essence}</span></div></div><div><div className="hotbar" aria-label="Hotbar de 8 slots">{equipment.map((item,i)=><Button variant="ghost" key={i} className="hotbar-slot" title={`${i+1} · ${item.name}`} aria-label={`${i+1} · ${item.name}`} data-active={slot===i} onClick={()=>useSlot(i)} onDragOver={e=>e.preventDefault()} onDrop={e=>{const n=Number(e.dataTransfer.getData('text/plain'));if(Number.isInteger(n)&&n>=0&&n<8)useSlot(n);}}><span className="slot-key">{i+1}</span><item.icon strokeWidth={1.3}/><span className="slot-count">{i===3?potions:item.count}</span></Button>)}</div><div className="hotbar-note">{equipment[slot]?.name} <span className="text-primary">·</span> Guerreiro</div></div><div className="bag-summary"><div className="footer-label"><Backpack/>MOCHILA</div><div className="bag-weight">{weight.toFixed(1)} kg <small>/ 40 kg</small></div><div className="weight-track"/></div></footer>
    </main>
  </div>;
}
