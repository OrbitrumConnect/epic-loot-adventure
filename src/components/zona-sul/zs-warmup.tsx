/**
 * PRÉ-AQUECIMENTO (30/10, Pedro: "ok go"). Medido: a 1ª vez que cada tipo de bicho/inimigo aparecia na sessão travava
 * ~0,3–1 s (montar o modelo, refazer o retarget das animações Mixamo, compilar o shader esperando a placa, subir a
 * textura). Agora, na entrada da Zona Sul, por trás da tela "Preparando o mundo…", monta 1 exemplar INVISÍVEL de cada
 * tipo que existe no mapa — pelos MESMOS componentes do jogo (Beast / Raider / Wolf), então os modelos, os caches de
 * animação e de medida ficam prontos — compila os materiais (com e sem as luzes do pool) e sobe as texturas pra placa.
 * O 1º encontro de verdade sai liso. NADA muda no visual. Todos em PARALELO (os downloads acontecem juntos). A tela
 * some no fim ou no teto (WARM_CAP_MS) — o que faltar continua por trás.
 */
import { useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import * as THREE from 'three';
import { AssetBoundary } from '@/components/world/asset-boundary';
import { Beast } from '@/components/world/beast';
import { lightPoolGroup } from '@/components/world/light-pool';
import { isRaider, Raider } from '@/components/world/raider';
import { Wolf } from '@/components/world/wolf';
import type { Palette } from '@/components/world/world-kit';
import { useGameStore } from '@/game/state/game-store';

/** teto da TELA de carregamento (ms; o que faltar segue aquecendo por trás) e de CADA modelo (download quebrado: desiste).
 *  30/10: um teto único de 12 s cancelava os que ainda baixavam (15 modelos, ~45 MB juntos) e eles ficavam frios. */
export const WARM_CAP_MS = 15000;
const ENTRY_TIMEOUT_MS = 60000;

type WarmState = { total: number; done: number; overlay: boolean };
let warm: WarmState = { total: 0, done: 0, overlay: false };
const subs = new Set<() => void>();
function setWarm(p: Partial<WarmState>) {
  warm = { ...warm, ...p };
  if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zsWarm?: WarmState }).__zsWarm = warm; // testes de tela
  for (const f of subs) f();
}
export function useWarmState(): WarmState {
  return useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => warm, () => warm);
}

/** Tipos a aquecer: um por espécie que existe no mapa, do MAIS PERTO de `at` pro mais longe. Puro (testável). */
export function warmOrder(creatures: readonly { speciesId: string; position: { x: number; z: number } }[], at: { x: number; z: number }): string[] {
  const best = new Map<string, number>();
  for (const cr of creatures) {
    const d = (cr.position.x - at.x) ** 2 + (cr.position.z - at.z) ** 2, b = best.get(cr.speciesId);
    if (b === undefined || d < b) best.set(cr.speciesId, d);
  }
  return [...best.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id);
}

const TEX_KEYS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'aoMap', 'alphaMap'] as const;

export function ZsWarmUp({ c, playerRef }: { c: Palette; playerRef: React.RefObject<THREE.Group | null> }) {
  const order = useMemo(() => {
    // só em desenvolvimento: o teste de tela compara com/sem aquecer
    if (import.meta.env.DEV && (window as unknown as { __zsNoWarm?: boolean }).__zsNoWarm) return [];
    const st = useGameStore.getState();
    return warmOrder(st.creatures, st.player.position);
  }, []);
  // TODOS em paralelo (30/10: 1 por vez esperava o download de cada um — 2 de 15 em 15 s): cada um na sua rede de
  // segurança; o que termina (ou trava/quebra) sai da cena e conta no progresso
  const [done, setDone] = useState<ReadonlySet<string>>(() => new Set());
  const finish = useCallback((sp: string) => setDone((d) => (d.has(sp) ? d : new Set(d).add(sp))), []);
  useEffect(() => {
    setWarm({ total: order.length, done: 0, overlay: order.length > 0 });
    const cap = window.setTimeout(() => setWarm({ overlay: false }), WARM_CAP_MS);
    return () => { window.clearTimeout(cap); setWarm({ overlay: false }); };
  }, [order]);
  useEffect(() => {
    setWarm(done.size >= order.length ? { done: order.length, overlay: false } : { done: done.size });
  }, [done, order.length]);
  // o MUNDO inteiro (terreno, mata, água, céu…) também no outro jeito das luzes: de dia, chegar perto de uma fogueira
  // liga o pool e cada material precisava da versão "com luz" (36 shaders no acampamento) — fica pronta na carga
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    const id = window.setTimeout(() => {
      const g = lightPoolGroup.g;
      if (!g) return;
      const was = g.visible;
      g.visible = !was;
      try { void gl.compileAsync(scene, camera).catch(() => {}); } finally { g.visible = was; }
    }, 1500);
    return () => window.clearTimeout(id);
  }, [gl, scene, camera]);
  return (
    <>
      {order.filter((sp) => !done.has(sp)).map((sp) => (
        <WarmSlot key={sp} speciesId={sp} c={c} playerRef={playerRef} onDone={finish} />
      ))}
    </>
  );
}

function WarmSlot({ speciesId, c, playerRef, onDone }: {
  speciesId: string; c: Palette; playerRef: React.RefObject<THREE.Group | null>; onDone: (sp: string) => void;
}) {
  const holder = useRef<THREE.Group>(null);
  const done = useCallback(() => onDone(speciesId), [onDone, speciesId]);
  useEffect(() => { const id = window.setTimeout(done, ENTRY_TIMEOUT_MS); return () => window.clearTimeout(id); }, [done]); // modelo que não chega
  return (
    <group ref={holder} position={[0, -600, 0]} visible={false}>
      <AssetBoundary label={'Aquecer ' + speciesId} fallback={<Skip onSkip={done} />}>
        <Suspense fallback={null}>
          <WarmEntry speciesId={speciesId} c={c} playerRef={playerRef} holder={holder} onDone={done} />
        </Suspense>
      </AssetBoundary>
    </group>
  );
}

function Skip({ onSkip }: { onSkip: () => void }) {
  useEffect(() => { onSkip(); }, [onSkip]);
  return null;
}

/** 1 exemplar invisível (id que não existe na store: a IA não mexe nele). Montado = modelo carregado; aí compila e sobe. */
function WarmEntry({ speciesId, c, playerRef, holder, onDone }: {
  speciesId: string; c: Palette; playerRef: React.RefObject<THREE.Group | null>;
  holder: React.RefObject<THREE.Group | null>; onDone: () => void;
}) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    let alive = true;
    const warmNow = () => {
      const h = holder.current;
      if (!h) return;
      try {
        // os DOIS jeitos das luzes do pool (dia sem luz / noite com luz) — trocar depois não compila nada
        const g = lightPoolGroup.g, was = g ? g.visible : false;
        if (g) { g.visible = !was; gl.compile(h, camera, scene); g.visible = was; }
        gl.compile(h, camera, scene);
        h.traverse((o) => {
          const m = (o as THREE.Mesh).material;
          for (const mm of Array.isArray(m) ? m : m ? [m] : []) {
            for (const k of TEX_KEYS) { const tx = (mm as unknown as Record<string, THREE.Texture | null | undefined>)[k]; if (tx?.isTexture) gl.initTexture(tx); }
          }
        });
      } catch { /* aquecer é opcional: falhou, o jogo carrega na 1ª aparição como antes */ }
    };
    // bicho "demo" liga a textura logo DEPOIS de montar → aquece 2× (a 2ª pega o material já com a textura)
    const a = window.setTimeout(() => { if (alive) warmNow(); }, 200);
    const b = window.setTimeout(() => { if (!alive) return; warmNow(); onDone(); }, 700);
    return () => { alive = false; window.clearTimeout(a); window.clearTimeout(b); };
  }, [gl, scene, camera, holder, onDone]);
  const id = '__warm_' + speciesId, start = { x: 0, z: 0 };
  if (isRaider(speciesId)) return <Raider c={c} creatureId={id} speciesId={speciesId} name="" start={start} renderBody playerRef={playerRef} />;
  if (speciesId === 'wolf') return <Wolf c={c} creatureId={id} name="" start={start} renderBody playerRef={playerRef} />;
  return <Beast c={c} creatureId={id} speciesId={speciesId} name="" start={start} renderBody playerRef={playerRef} />;
}

/** Tela "Preparando o mundo…" por cima do mundo enquanto aquece (some no fim ou no teto). */
export function ZsWarmOverlay() {
  const w = useWarmState();
  if (!w.overlay || w.total === 0) return null;
  return (
    <div className="world-loading zs-warm">
      <span>Preparando o mundo…</span>
      <progress max={w.total} value={w.done} aria-label="Preparando o mundo" />
    </div>
  );
}
