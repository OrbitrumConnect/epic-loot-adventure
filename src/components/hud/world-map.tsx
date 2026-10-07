import { useCallback, useEffect, useRef, useState } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import { PLAYER_SPAWN } from '@/game/data/camps';
import type { CampState, CreatureState, HarvestNodeState, ObjectiveKind } from '@/game/types';
import { addObjective, setAutoMode } from '@/components/world/objective-bridge';
import { fromView, makeFrame, toView, WORLD_HALF, type MapFrame } from './map-transform';

/**
 * Mapa real do mundo, desenhado em <canvas>.
 *
 * Por que canvas: ~60 criaturas + centenas de recursos viram centenas de nós de DOM/SVG
 * se desenhados como elementos; no canvas é um único passe de desenho e nenhum reconciliador.
 * O acerto de clique/hover é calculado à mão sobre as mesmas coordenadas da transformada
 * (ver map-transform.ts).
 *
 * Custo: o componente NÃO se inscreve no store (zero re-render por mudança de estado).
 * Um setInterval de 200 ms (5 Hz) lê `useGameStore.getState()` e redesenha; os agrupamentos
 * de recursos só são recomputados quando a referência do array `harvestNodes` muda. O
 * React só re-renderiza quando o texto de hover ou de confirmação muda.
 */

const RUINS = { x: 7, z: -8 };
const TICK_MS = 200;
const CLUSTER_CELL = 9; // metros
const PING_MS = 4000;

type Category = 'wood' | 'stone' | 'ore' | 'crystal';
const CATEGORY_OF: Record<string, Category> = {
  tree: 'wood', pebble: 'stone', rock: 'stone', iron_vein: 'ore', gold_vein: 'ore', crystal: 'crystal',
};
const CATEGORY_NAME: Record<Category, [string, string]> = {
  wood: ['Árvore', 'Árvores'],
  stone: ['Pedra', 'Pedras'],
  ore: ['Veio de minério', 'Veios de minério'],
  crystal: ['Cristal arcano', 'Cristais arcanos'],
};
const CATEGORY_VAR: Record<Category, string> = {
  wood: '--world-leaf-light', stone: '--world-rock-light', ore: '--world-metal', crystal: '--world-crystal',
};
const TIER_VAR: Record<number, string> = {
  1: '--world-leaf-light', 2: '--world-gold', 3: '--world-cloak', 4: '--world-crystal',
};

type Cluster = { cat: Category; x: number; z: number; n: number; repId: string };

type Hit =
  | { type: 'camp'; id: string; label: string }
  | { type: 'creature'; id: string; label: string }
  | { type: 'cluster'; id: string; label: string; x: number; z: number }
  | { type: 'unknown'; label: string }
  | { type: 'ground'; label: string; x: number; z: number }
  | { type: 'base' | 'ruins'; label: string };

function isPeaceful(c: CreatureState): boolean {
  const def = CREATURES[c.speciesId] as unknown as { peaceful?: boolean } | undefined;
  return def?.peaceful ?? false;
}
const head = (l: string) => l.split(' · ')[0]?.split(' — ')[0] ?? l;
const isAlive = (c: CreatureState) => c.behavior !== 'dead' && c.behavior !== 'respawning';

function buildClusters(nodes: HarvestNodeState[]): Cluster[] {
  const cells = new Map<string, { cat: Category; sx: number; sz: number; list: HarvestNodeState[] }>();
  for (const nd of nodes) {
    if (nd.depleted) continue;
    const cat = CATEGORY_OF[nd.kind];
    if (!cat) continue;
    const key = `${cat}:${Math.floor(nd.position.x / CLUSTER_CELL)}:${Math.floor(nd.position.z / CLUSTER_CELL)}`;
    let c = cells.get(key);
    if (!c) { c = { cat, sx: 0, sz: 0, list: [] }; cells.set(key, c); }
    c.sx += nd.position.x; c.sz += nd.position.z; c.list.push(nd);
  }
  const out: Cluster[] = [];
  for (const c of cells.values()) {
    const n = c.list.length;
    const cx = c.sx / n, cz = c.sz / n;
    let rep: HarvestNodeState = c.list[0]!, best = Infinity;
    for (const nd of c.list) {
      const d = (nd.position.x - cx) ** 2 + (nd.position.z - cz) ** 2;
      if (d < best) { best = d; rep = nd; }
    }
    out.push({ cat: c.cat, x: cx, z: cz, n, repId: rep.id });
  }
  return out;
}

/** Cantos de "área desconhecida": centro da célula de 15 m, sem revelar a posição exata. */
const snap = (v: number) => Math.floor(v / 15) * 15 + 7.5;

type Colors = Record<string, string>;
function readColors(el: HTMLElement): Colors {
  const cs = getComputedStyle(el);
  const names = ['--world-ground', '--world-ground-light', '--world-pine', '--world-leaf-light', '--world-rock-light',
    '--world-metal', '--world-crystal', '--world-gold', '--world-cloak', '--world-light', '--world-dark',
    '--world-ink', '--world-water-light', '--primary', '--world-path', '--world-armor'];
  const out: Colors = {};
  for (const n of names) out[n] = cs.getPropertyValue(n).trim() || '#fff';
  return out;
}

export type WorldMapProps = { size: 'mini' | 'large' };

export function WorldMap({ size }: WorldMapProps) {
  const large = size === 'large';
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<MapFrame>(makeFrame(100, 100, 6));
  const colorsRef = useRef<Colors | null>(null);
  const clustersRef = useRef<{ src: HarvestNodeState[] | null; list: Cluster[] }>({ src: null, list: [] });
  const hoverRef = useRef<Hit | null>(null);
  const headingRef = useRef<{ x: number; z: number; a: number }>({ x: 0, z: 0, a: -Math.PI / 2 });
  const pingRef = useRef<{ x: number; z: number; t: number } | null>(null);
  const [hoverText, setHoverText] = useState('');
  const [confirm, setConfirm] = useState('');
  const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const drawRef = useRef<() => void>(() => {});

  const pad = large ? 8 : 6;

  const hitTest = useCallback((px: number, py: number): Hit | null => {
    const f = frameRef.current;
    const st = useGameStore.getState();
    const R = large ? 9 : 7;
    let best: Hit | null = null;
    let bestD = Infinity;
    const consider = (d: number, lim: number, hit: Hit) => { if (d <= lim && d < bestD) { bestD = d; best = hit; } };

    // Prioridade: criatura < acampamento < recurso < chão. Cada grupo compete por distância,
    // mas um grupo de maior prioridade vence se tiver qualquer acerto.
    for (const c of st.creatures) {
      if (!isAlive(c)) continue;
      const [cx, cy] = toView(f, c.position.x, c.position.z);
      consider(Math.hypot(cx - px, cy - py), R, {
        type: 'creature', id: c.id,
        label: `${c.name} · ${Math.max(0, Math.round(c.hp))}/${c.maxHp} PV · ${isPeaceful(c) ? 'pacífico' : 'hostil'} — clique para caçar`,
      });
    }
    if (best) return best;
    // Acampamento é SEMPRE clicável: o mapa é o painel de comando do jogador.
    // Ainda não explorado aparece com menos informação, não escondido.
    for (const camp of st.camps) {
      const [cx, cy] = toView(f, camp.position.x, camp.position.z);
      const label = camp.discovered
        ? `${camp.name} · tier ${camp.tier}${camp.cleared ? ' · limpo' : ''} — clique para limpar`
        : `Acampamento inimigo · tier ${camp.tier} · não explorado — clique para atacar`;
      consider(Math.hypot(cx - px, cy - py), R + 4, { type: 'camp', id: camp.id, label });
    }
    if (best) return best;
    for (const cl of clustersRef.current.list) {
      const [cx, cy] = toView(f, cl.x, cl.z);
      const names = CATEGORY_NAME[cl.cat];
      consider(Math.hypot(cx - px, cy - py), R - 1, {
        type: 'cluster', id: cl.repId, x: cl.x, z: cl.z,
        label: `${cl.n > 1 ? `${names[1]} (${cl.n})` : names[0]} — clique para coletar`,
      });
    }
    if (best) return best;
    const [bx, by] = toView(f, PLAYER_SPAWN.x, PLAYER_SPAWN.z);
    if (Math.hypot(bx - px, by - py) <= R) return { type: 'base', label: 'Base / ponto de renascimento' };
    const [rx, ry] = toView(f, RUINS.x, RUINS.z);
    if (Math.hypot(rx - px, ry - py) <= R) return { type: 'ruins', label: `Ruínas (${RUINS.x}, ${RUINS.z})` };
    const w = fromView(f, px, py);
    if (w) return { type: 'ground', x: w.x, z: w.z, label: `Caçar nesta região (${Math.round(w.x)}, ${Math.round(w.z)})` };
    return null;
  }, [large]);

  // Desenho: tudo imperativo, sem estado do React.
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    if (!colorsRef.current) colorsRef.current = readColors(wrap);
    const palette = colorsRef.current;
    const C = (k: string | undefined): string => (k ? palette[k] : undefined) ?? '#fff';
    const f = frameRef.current;
    const st = useGameStore.getState();
    const now = Date.now();

    ctx.clearRect(0, 0, f.w, f.h);
    ctx.fillStyle = C('--world-dark');
    ctx.fillRect(0, 0, f.w, f.h);
    ctx.fillStyle = C('--world-ground');
    ctx.fillRect(f.ox, f.oy, f.side, f.side);

    // Grade de coordenadas a cada 15 m (informação real, não cenário).
    ctx.strokeStyle = C('--world-ground-light');
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let g = -WORLD_HALF + 15; g < WORLD_HALF; g += 15) {
      const [gx, gy] = toView(f, g, g);
      ctx.moveTo(Math.round(gx) + 0.5, f.oy); ctx.lineTo(Math.round(gx) + 0.5, f.oy + f.side);
      ctx.moveTo(f.ox, Math.round(gy) + 0.5); ctx.lineTo(f.ox + f.side, Math.round(gy) + 0.5);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = C('--world-path');
    ctx.strokeRect(f.ox + 0.5, f.oy + 0.5, f.side - 1, f.side - 1);

    // Recursos (agrupados em células). Mini: só minério e cristal, apagados.
    if (clustersRef.current.src !== st.harvestNodes) {
      clustersRef.current = { src: st.harvestNodes, list: buildClusters(st.harvestNodes ?? []) };
    }
    for (const cl of clustersRef.current.list) {
      if (!large && cl.cat !== 'ore' && cl.cat !== 'crystal') continue;
      const [x, y] = toView(f, cl.x, cl.z);
      const r = large ? 1.6 + Math.min(2.4, Math.log2(cl.n + 1) * 0.8) : 1.3;
      ctx.globalAlpha = large ? 0.85 : 0.6;
      ctx.fillStyle = C(CATEGORY_VAR[cl.cat]);
      ctx.beginPath();
      if (cl.cat === 'crystal') { ctx.moveTo(x, y - r - 1); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r + 1); ctx.lineTo(x - r, y); ctx.closePath(); }
      else if (cl.cat === 'ore') { ctx.rect(x - r, y - r, r * 2, r * 2); }
      else if (cl.cat === 'stone') { ctx.arc(x, y, r * 0.9, 0, Math.PI * 2); }
      else { ctx.moveTo(x, y - r - 0.5); ctx.lineTo(x + r, y + r); ctx.lineTo(x - r, y + r); ctx.closePath(); }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Base e ruínas.
    const [bx, by] = toView(f, PLAYER_SPAWN.x, PLAYER_SPAWN.z);
    ctx.fillStyle = C('--world-gold');
    ctx.strokeStyle = C('--world-dark');
    ctx.lineWidth = 1;
    const hb = large ? 5 : 3.5;
    ctx.beginPath(); ctx.moveTo(bx - hb, by + hb * 0.7); ctx.lineTo(bx - hb, by - hb * 0.2); ctx.lineTo(bx, by - hb); ctx.lineTo(bx + hb, by - hb * 0.2); ctx.lineTo(bx + hb, by + hb * 0.7); ctx.closePath();
    ctx.fill(); ctx.stroke();
    const [rx, ry] = toView(f, RUINS.x, RUINS.z);
    ctx.fillStyle = C('--world-rock-light');
    const hr = large ? 4 : 3;
    ctx.fillRect(rx - hr, ry - hr, hr * 2, hr * 2);
    ctx.strokeRect(rx - hr + 0.5, ry - hr + 0.5, hr * 2 - 1, hr * 2 - 1);

    // Acampamentos.
    for (const camp of st.camps as CampState[]) {
      const [cx, cy] = toView(f, camp.position.x, camp.position.z);
      if (!camp.discovered) {
        // Posição real, cor do tier esmaecida e anel tracejado: o jogador sabe
        // onde é e quão perigoso é, mas vê que ainda não esteve lá.
        ctx.globalAlpha = 0.5;
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = C(TIER_VAR[camp.tier] ?? '--world-gold');
        ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx, cy, large ? 9 : 6, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C(TIER_VAR[camp.tier] ?? '--world-gold');
        ctx.beginPath(); ctx.arc(cx, cy, large ? 3 : 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        continue;
      }
      const col = C(TIER_VAR[camp.tier] ?? '--world-gold');
      const s = large ? 6 : 4.5;
      if (camp.cleared) {
        ctx.globalAlpha = 0.7;
        ctx.strokeStyle = col; ctx.lineWidth = 1.3;
        ctx.beginPath(); ctx.arc(cx, cy, s, 0, Math.PI * 2);
        ctx.moveTo(cx - s * 0.5, cy - s * 0.5); ctx.lineTo(cx + s * 0.5, cy + s * 0.5);
        ctx.moveTo(cx + s * 0.5, cy - s * 0.5); ctx.lineTo(cx - s * 0.5, cy + s * 0.5);
        ctx.stroke();
        ctx.globalAlpha = 1;
      } else {
        ctx.fillStyle = col; ctx.strokeStyle = C('--world-dark'); ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(cx, cy - s); ctx.lineTo(cx + s, cy + s * 0.8); ctx.lineTo(cx - s, cy + s * 0.8); ctx.closePath();
        ctx.fill(); ctx.stroke();
        if (large) {
          ctx.fillStyle = C('--world-dark');
          ctx.font = 'bold 8px Manrope, sans-serif';
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(String(camp.tier), cx, cy + 1.5);
        }
      }
    }

    // Criaturas vivas: hostil = ponto vermelho com contorno; pacífica = anel claro vazado.
    const rC = large ? 3 : 1.9;
    for (const c of st.creatures) {
      if (!isAlive(c)) continue;
      const [x, y] = toView(f, c.position.x, c.position.z);
      if (isPeaceful(c)) {
        ctx.strokeStyle = C('--world-armor'); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(x, y, rC, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = C('--world-cloak');
        ctx.strokeStyle = C('--world-dark'); ctx.lineWidth = 0.8;
        ctx.beginPath(); ctx.arc(x, y, rC, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
    }

    // Marca do último clique "caçar nesta região".
    const ping = pingRef.current;
    if (ping && now - ping.t < PING_MS) {
      const [px, py] = toView(f, ping.x, ping.z);
      ctx.globalAlpha = 1 - (now - ping.t) / PING_MS;
      ctx.strokeStyle = C('--world-light'); ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.arc(px, py, 6 + ((now - ping.t) / 300) % 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
    }

    // Jogador + direção (derivada do deslocamento: o estado não guarda rotação).
    const pp = st.player.position;
    const hd = headingRef.current;
    if (Math.hypot(pp.x - hd.x, pp.z - hd.z) > 0.05) hd.a = Math.atan2(pp.z - hd.z, pp.x - hd.x);
    hd.x = pp.x; hd.z = pp.z;
    const [px, py] = toView(f, pp.x, pp.z);
    const pr = large ? 4.5 : 3.2;
    ctx.save();
    ctx.translate(px, py); ctx.rotate(hd.a);
    ctx.fillStyle = C('--world-light'); ctx.strokeStyle = C('--world-gold'); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(pr * 1.7, 0); ctx.lineTo(-pr, pr * 1.05); ctx.lineTo(-pr * 0.5, 0); ctx.lineTo(-pr, -pr * 1.05); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();

    // Destaque do hover.
    const hv = hoverRef.current;
    if (large && hv && hv.type !== 'ground' && hv.type !== 'unknown') {
      let hx = 0, hy = 0, ok = false;
      if (hv.type === 'creature') {
        const c = st.creatures.find(k => k.id === hv.id);
        if (c) { [hx, hy] = toView(f, c.position.x, c.position.z); ok = true; }
      } else if (hv.type === 'camp') {
        const c = st.camps.find(k => k.id === hv.id);
        if (c) { [hx, hy] = toView(f, c.position.x, c.position.z); ok = true; }
      } else if (hv.type === 'cluster') { [hx, hy] = toView(f, hv.x, hv.z); ok = true; }
      if (ok) {
        ctx.strokeStyle = C('--primary'); ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(hx, hy, 10, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }, [large]);
  drawRef.current = draw;

  // Dimensionamento (DPR) + laço de 5 Hz.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const resize = () => {
      const w = wrap.clientWidth, h = wrap.clientHeight;
      if (w < 10 || h < 10) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      ctx?.setTransform(dpr, 0, 0, dpr, 0, 0);
      frameRef.current = makeFrame(w, h, pad);
      drawRef.current();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    const id = setInterval(() => { if (!document.hidden) drawRef.current(); }, TICK_MS);
    return () => { clearInterval(id); ro.disconnect(); };
  }, [pad]);

  useEffect(() => () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); }, []);

  const localPoint = (e: React.MouseEvent) => {
    const r = canvasRef.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };

  const onMove = (e: React.MouseEvent) => {
    const [x, y] = localPoint(e);
    const hit = hitTest(x, y);
    hoverRef.current = hit;
    setHoverText(prev => (prev === (hit?.label ?? '') ? prev : (hit?.label ?? '')));
    drawRef.current();
  };
  const onLeave = () => { hoverRef.current = null; setHoverText(''); drawRef.current(); };

  const say = (msg: string) => {
    setConfirm(msg);
    if (confirmTimer.current) clearTimeout(confirmTimer.current);
    confirmTimer.current = setTimeout(() => setConfirm(''), 4500);
  };

  const onClick = (e: React.MouseEvent) => {
    const [x, y] = localPoint(e);
    const hit = hitTest(x, y);
    if (!hit) return;
    const queue = (kind: ObjectiveKind, id: string, text: string) => {
      addObjective(kind, id);
      setAutoMode('idle');
      say(`${text} · piloto automático ligado`);
    };
    if (hit.type === 'camp') queue('clear_camp', hit.id, `Na fila: limpar ${head(hit.label)}`);
    else if (hit.type === 'creature') queue('hunt_creature', hit.id, `Na fila: caçar ${head(hit.label)}`);
    else if (hit.type === 'cluster') queue('gather_node', hit.id, `Na fila: coletar ${head(hit.label)}`);
    else if (hit.type === 'ground') {
      useGameStore.getState().addHuntArea(hit.x, hit.z);
      setAutoMode('idle');
      pingRef.current = { x: hit.x, z: hit.z, t: Date.now() };
      say(`Caçando na região (${Math.round(hit.x)}, ${Math.round(hit.z)}) · piloto automático ligado`);
      drawRef.current();
    }
  };

  return (
    <div ref={wrapRef} className={`world-map world-map-${size}`} data-testid={`world-map-${size}`}>
      <canvas
        ref={canvasRef}
        role={large ? 'application' : 'img'}
        aria-label={large ? 'Mapa do Vale dos Ancestrais. Clique para enfileirar objetivos.' : 'Minimapa do Vale dos Ancestrais'}
        data-interactive={large}
        onMouseMove={large ? onMove : undefined}
        onMouseLeave={large ? onLeave : undefined}
        onClick={large ? onClick : undefined}
      />
      {large && (
        <div className="world-map-status" aria-live="polite">
          {confirm ? <strong>{confirm}</strong> : (hoverText || 'Passe o mouse sobre o mapa. Clique no chão para caçar na região.')}
        </div>
      )}
    </div>
  );
}

export function WorldMapLegend() {
  return (
    <div className="map-legend world-map-legend">
      <span><i className="wm-key wm-key-player" />Você</span>
      <span><i className="wm-key wm-key-base" />Base</span>
      <span><i className="wm-key wm-key-ruins" />Ruínas</span>
      <span><i className="wm-key wm-key-camp" />Acampamento (cor = tier)</span>
      <span><i className="wm-key wm-key-clear" />Limpo</span>
      <span><i className="wm-key wm-key-unknown" />Não explorado</span>
      <span><i className="wm-key wm-key-hostile" />Hostil</span>
      <span><i className="wm-key wm-key-peace" />Pacífico</span>
      <span><i className="wm-key wm-key-node" />Recursos</span>
    </div>
  );
}
