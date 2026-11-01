/**
 * Projéteis das armas de longe. Lê os eventos `shot` do feedback (origem = quem
 * atirou, `to` = alvo) e anima uma flecha/bala voando até o alvo. Pool fixo, sem
 * alocação por tiro — respeita o orçamento de performance.
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { FeedbackEvent } from '@/game/types/feedback';
import { terrainHeight } from './world-kit';
import { glbSurfaceY } from './terrain-collision';
import { effectGround } from '@/game/systems/layerSystem';
import { useArrowAsset } from './fx-models';
import { HERO_SHOT_DELAY_MS, heroMuzzle, heroMuzzleFresh } from './muzzle';

/** Carrega a flecha GLB fora do caminho crítico: até chegar, a flecha simples segue valendo. */
function ArrowAssetLoader({ onReady }: { onReady: (a: { geometry: THREE.BufferGeometry; material: THREE.Material }) => void }) {
  const asset = useArrowAsset();
  useEffect(() => { onReady(asset); }, [asset, onReady]);
  return null;
}

const POOL = 16;
const SPEED = 40; // m/s — flecha (dá pra ver voando)
/** BALA (01/11): 40 m/s levava ~4 s a 150 m ("parece que a bala não chega") → 220 m/s, quase na hora, como tiro de verdade. */
const BULLET_SPEED = 220;

type Shot = {
  active: boolean;
  from: THREE.Vector3;
  to: THREE.Vector3;
  t: number;
  dur: number;
  /** tiro do HERÓI esperando o braço chegar na mira (s restantes) — sai da boca da arma quando zera (01/11) */
  wait: number;
  ev: FeedbackEvent | null;
};

export function Projectiles() {
  const meshes = useRef<(THREE.Mesh | null)[]>(Array.from({ length: POOL }, () => null));
  const shots = useRef<Shot[]>(
    Array.from({ length: POOL }, () => ({ active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0, wait: 0, ev: null })),
  );
  const next = useRef(0);
  const seen = useRef(new Set<number>());
  const lastArr = useRef<unknown>(null);

  const geo = useMemo(() => new THREE.CylinderGeometry(0.025, 0.025, 0.55, 5), []);
  // Flecha GLB (Mad Max) pros tiros de ARCO; bala segue o cilindro brilhante. Material de cada
  // mesh do pool fica guardado pra voltar quando o tiro é de bala.
  const arrow = useRef<{ geometry: THREE.BufferGeometry; material: THREE.Material } | null>(null);
  const ownMats = useRef<(THREE.Material | null)[]>(Array.from({ length: POOL }, () => null));
  const onArrowReady = useMemo(() => (a: { geometry: THREE.BufferGeometry; material: THREE.Material }) => { arrow.current = a; }, []);

  const spawn = (ev: FeedbackEvent) => {
    if (!ev.to) return;
    const i = next.current;
    next.current = (i + 1) % POOL;
    const s = shots.current[i]!;
    // TIRO DO HERÓI de arma de fogo (01/11): espera o braço chegar na mira e sai da BOCA da arma
    if (ev.hero && ev.projectile === 'bullet') {
      s.ev = ev; s.wait = HERO_SHOT_DELAY_MS / 1000; s.active = true;
      const m = meshes.current[i]; if (m) m.visible = false;
      return;
    }
    launch(i, ev);
  };

  const launch = (i: number, ev: FeedbackEvent) => {
    if (!ev.to) return;
    const s = shots.current[i]!;
    const m = meshes.current[i];
    s.wait = 0; s.ev = null;
    // Altura pelo CHÃO REAL do mapa (GLB) — antes usava o relevo procedural antigo e o tiro saía
    // torto (abaixo/acima) em terreno do mapa (Pedro, 22/10). Tiro da mira traz `toY` (pontinho).
    // caverna (30/10): com o herói dentro, o chão dela (o tiro não sai do topo do morro)
    const ground = (x: number, z: number) => effectGround(x, z, glbSurfaceY(x, z, terrainHeight(x, z)));
    // herói com a arma na mão: nasce na BOCA da arma (Pedro 01/11: "o tiro sai do meio do personagem")
    if (ev.hero && heroMuzzleFresh()) s.from.set(heroMuzzle.x, heroMuzzle.y, heroMuzzle.z);
    else s.from.set(ev.position.x, ground(ev.position.x, ev.position.z) + (ev.sourceHeight ?? 1.1), ev.position.z);
    s.to.set(ev.to.x, ev.toY ?? ground(ev.to.x, ev.to.z) + 0.8, ev.to.z);
    s.dur = Math.max(0.05, s.from.distanceTo(s.to) / (ev.projectile === 'bullet' ? BULLET_SPEED : SPEED));
    s.t = 0;
    s.active = true;
    if (m) {
      const bullet = ev.projectile === 'bullet';
      if (!ownMats.current[i]) ownMats.current[i] = m.material as THREE.Material;
      const glbArrow = !bullet ? arrow.current : null;
      m.geometry = glbArrow ? glbArrow.geometry : geo;
      m.material = glbArrow ? glbArrow.material : ownMats.current[i]!;
      const mat = ownMats.current[i] as THREE.MeshStandardMaterial;
      mat.color.set(bullet ? '#ffe08a' : '#caa36a');
      mat.emissive.set(bullet ? '#ffb020' : '#000000');
      mat.emissiveIntensity = bullet ? 1.4 : 0;
      m.scale.set(bullet ? 0.7 : 1, bullet ? 4 : 1, bullet ? 0.7 : 1); // bala rápida = risco de luz de ~2 m (traçante)
      m.visible = true;
      m.position.copy(s.from);
      m.lookAt(s.to);
      m.rotateX(Math.PI / 2);
    }
  };

  useFrame((_s, delta) => {
    const fb = (useGameStore.getState() as unknown as { feedback?: FeedbackEvent[] }).feedback;
    if (fb && fb !== lastArr.current) {
      lastArr.current = fb;
      for (const ev of fb) {
        if (ev.kind !== 'shot' || seen.current.has(ev.id)) continue;
        seen.current.add(ev.id);
        spawn(ev);
      }
      if (seen.current.size > 300) {
        const live = new Set(fb.map(e => e.id));
        for (const id of seen.current) if (!live.has(id)) seen.current.delete(id);
      }
    }
    for (let i = 0; i < POOL; i++) {
      const s = shots.current[i]!;
      const m = meshes.current[i];
      if (!s.active || !m) continue;
      if (s.ev) { s.wait -= delta; if (s.wait <= 0) launch(i, s.ev); continue; } // herói: braço chegando na mira
      s.t += delta;
      const k = Math.min(1, s.t / s.dur);
      m.position.lerpVectors(s.from, s.to, k);
      if (k >= 1) { s.active = false; m.visible = false; }
    }
  });

  return (
    <>
      <Suspense fallback={null}><ArrowAssetLoader onReady={onArrowReady} /></Suspense>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={el => { meshes.current[i] = el; }} visible={false} geometry={geo} raycast={() => {}}>
          <meshStandardMaterial color="#caa36a" />
        </mesh>
      ))}
    </>
  );
}
