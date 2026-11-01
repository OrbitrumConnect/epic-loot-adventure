/**
 * ZONA SUL — NAVIO DE GUERRA: o desenho (01/11). GLB do Pedro (navio "A": galeão com canhões no costado) compactado
 * 488 mil → 45 mil triângulos. Medido no modelo: a PROA aponta pro −Z (a ponta fina é o gurupés) → gira 180° pra frente
 * do jogo (+Z); o costado no meio fica a ~23% da altura (mastros inclusos). Calado 2 m: quilha 2 m abaixo d'água.
 * Também desenha as BALAS (arco com gravidade), o SPLASH onde caem (e aplica o dano em área no jogo) e a MIRA (arco + anel
 * de onde cai) enquanto o botão direito / mira está apertado.
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { ballAt, type CannonBall, WARSHIP, type ZsWarship } from './zs-warship';
import { zsWaterYAt } from './zs-terrain-data';

const URL = '/zona-sul/warship.glb';
/** quilha abaixo da superfície (m) */
export const WARSHIP_DRAFT = 2.0;
/** costado (onde ficam os canhões) e convés de popa (timão), em fração da altura do modelo — medidos */
const GUNWALE_K = 0.23, HELM_DECK_K = 0.27;
/** timão: fração do comprimento atrás do meio (popa) */
export const HELM_U = -0.36;

/** Altura do convés/canhões acima da quilha (m) — preenchida quando o modelo carrega. */
export const warshipDims = { gunY: 4.2, helmY: 4.9, height: 18 };

/** Balas no ar (o mundo empurra ao atirar; o desenho anima e resolve o impacto). */
export type FlyingBall = { b: CannonBall; t0: number; land: { x: number; y: number; z: number; t: number }; hit: boolean };
export const warshipFx: { balls: FlyingBall[]; splashes: { x: number; y: number; z: number; t0: number }[] } = { balls: [], splashes: [] };
/** Mira (o mundo escreve todo quadro): arco da bala do meio da salva + onde cai. */
export const warshipAim: { on: boolean; ball: CannonBall | null; land: { x: number; y: number; z: number; t: number } | null } = { on: false, ball: null, land: null };

const MAX_BALLS = 12, MAX_SPLASH = 8, ARC_PTS = 28;

export function ZsWarshipView({ shipRef, heroRef }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const { scene } = useGLTF(URL);
  const model = useMemo(() => {
    const r = scene.clone(true);
    r.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; } });
    r.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(r), s0 = b0.getSize(new THREE.Vector3());
    const k = WARSHIP.LENGTH / Math.max(s0.z, 1e-6);
    r.scale.setScalar(k);
    r.rotation.y = Math.PI; // proa (−Z no arquivo) → +Z (frente do jogo)
    r.updateMatrixWorld(true);
    const b1 = new THREE.Box3().setFromObject(r), c1 = b1.getCenter(new THREE.Vector3());
    r.position.set(-c1.x, -b1.min.y, -c1.z); // quilha em y = 0, meio do navio no centro
    const h = b1.max.y - b1.min.y;
    warshipDims.height = h; warshipDims.gunY = h * GUNWALE_K; warshipDims.helmY = h * HELM_DECK_K;
    const holder = new THREE.Group(); holder.add(r);
    return holder;
  }, [scene]);
  const ship = useRef<THREE.Group>(null);
  const balls = useRef<THREE.InstancedMesh>(null);
  const splashes = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pillar = useRef<THREE.Mesh>(null);
  /** o ARCO = fileira de bolinhas (linha de 1 px some de longe e de frente) */
  const arcDots = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useFrame((state) => {
    const s = shipRef.current, g = ship.current;
    if (!s || !g) return;
    const now = performance.now(), t = state.clock.elapsedTime;
    // ── o navio: na água (com a onda), balanço leve + adernar na curva ───────────────────────────────────
    const wy = zsWaterYAt(s.x, s.z);
    g.position.set(s.x, wy - WARSHIP_DRAFT + Math.sin(t * 0.7) * 0.15, s.z);
    g.rotation.set(Math.sin(t * 0.5) * 0.012, s.yaw, s.roll + Math.sin(t * 0.6 + 1) * 0.02, 'YXZ');
    // ── balas no ar + impacto ────────────────────────────────────────────────────────────────────────────
    const bm = balls.current;
    let nb = 0;
    const fx = warshipFx;
    for (const fb of fx.balls) {
      const age = (now - fb.t0) / 1000;
      if (age < 0) continue; // ainda não saiu (salva escalonada)
      if (age >= fb.land.t) {
        if (!fb.hit) {
          fb.hit = true;
          fx.splashes.push({ x: fb.land.x, y: fb.land.y, z: fb.land.z, t0: now });
          useGameStore.getState().cannonHit({ x: fb.land.x, z: fb.land.z }, WARSHIP.SPLASH_R);
          const h = heroRef.current;
          audioManager.playWorld('gun', distanceGain(Math.hypot(fb.land.x - h.x, fb.land.z - h.z)) * 0.8, now);
        }
        continue;
      }
      if (bm && nb < MAX_BALLS) { const p = ballAt(fb.b, age); dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(1); dummy.updateMatrix(); bm.setMatrixAt(nb++, dummy.matrix); }
    }
    fx.balls = fx.balls.filter((fb) => !fb.hit || (now - fb.t0) / 1000 < fb.land.t + 0.1);
    if (bm) { bm.count = nb; bm.instanceMatrix.needsUpdate = true; }
    // ── splash: anel de espuma que abre e some em 0,9 s ──────────────────────────────────────────────────
    const sm = splashes.current;
    fx.splashes = fx.splashes.filter((sp) => now - sp.t0 < 900).slice(-MAX_SPLASH);
    if (sm) {
      let ns = 0;
      for (const sp of fx.splashes) { const k = (now - sp.t0) / 900; dummy.position.set(sp.x, sp.y + 0.15 + k * 1.2, sp.z); dummy.scale.set(1 + k * 5, 1 + k * 3.5 * (1 - k), 1 + k * 5); dummy.updateMatrix(); sm.setMatrixAt(ns++, dummy.matrix); }
      sm.count = ns; sm.instanceMatrix.needsUpdate = true;
    }
    // ── mira: arco da bala do meio + anel onde cai ───────────────────────────────────────────────────────
    const a = warshipAim, rg = ring.current, pl = pillar.current, dots = arcDots.current;
    if (rg && pl && dots) {
      const show = a.on && !!a.ball && !!a.land;
      rg.visible = show; pl.visible = show;
      if (show) {
        for (let i = 0; i < ARC_PTS; i++) { const p = ballAt(a.ball!, (a.land!.t * (i + 1)) / ARC_PTS); dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(1); dummy.updateMatrix(); dots.setMatrixAt(i, dummy.matrix); }
        dots.count = ARC_PTS; dots.instanceMatrix.needsUpdate = true;
        rg.position.set(a.land!.x, a.land!.y + 0.2, a.land!.z);
        pl.position.set(a.land!.x, a.land!.y + 5, a.land!.z);
      } else dots.count = 0;
    }
  });

  return (
    <>
      <group ref={ship}><primitive object={model} /></group>
      <instancedMesh ref={balls} args={[undefined, undefined, MAX_BALLS]} frustumCulled={false}>
        <sphereGeometry args={[0.45, 10, 8]} />
        <meshStandardMaterial color="#1c1c1e" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={splashes} args={[undefined, undefined, MAX_SPLASH]} frustumCulled={false}>
        <cylinderGeometry args={[1.2, 1.8, 1, 14, 1, true]} />
        <meshBasicMaterial color="#e9f4f6" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={arcDots} args={[undefined, undefined, ARC_PTS]} frustumCulled={false} renderOrder={10}>
        <sphereGeometry args={[0.32, 6, 4]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.9} depthTest={false} />
      </instancedMesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={10}>
        <ringGeometry args={[WARSHIP.SPLASH_R - 0.8, WARSHIP.SPLASH_R, 40]} />
        <meshBasicMaterial color="#ff5a3c" transparent opacity={0.85} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      {/* coluna de luz no ponto de queda: dá pra ver de longe e de qualquer ângulo */}
      <mesh ref={pillar} visible={false} renderOrder={9}>
        <cylinderGeometry args={[0.45, 0.45, 10, 10, 1, true]} />
        <meshBasicMaterial color="#ff5a3c" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  );
}
