/**
 * Projéteis das armas de longe. Lê os eventos `shot` do feedback (origem = quem
 * atirou, `to` = alvo) e anima uma flecha/bala voando até o alvo. Pool fixo, sem
 * alocação por tiro — respeita o orçamento de performance.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import type { FeedbackEvent } from '@/game/types/feedback';
import { terrainHeight } from './world-kit';
import { glbSurfaceY } from './terrain-collision';
import { effectGround } from '@/game/systems/layerSystem';
import { useArrowAsset } from './fx-models';
import { HERO_SHOT_DELAY_MS, heroMuzzle, heroMuzzleFresh } from './muzzle';
import { MISSILE_URL } from './weapon-models';
import { extendKTX2, primeKTX2 } from './ktx2-gltf';
import { requestLight } from './light-pool';
import { BAZOOKA } from '@/game/data/bazooka';

/** MÍSSIL da bazuca (04/11): o GLB do Pedro deitado no eixo do projétil (ogiva em −X no arquivo → +Y, como o cilindro), 0,9 m. */
function MissileAssetLoader({ onReady }: { onReady: (a: { geometry: THREE.BufferGeometry; material: THREE.Material }) => void }) {
  const { gl } = useThree();
  primeKTX2(gl);
  const { scene } = useGLTF(MISSILE_URL, true, true, extendKTX2);
  const asset = useMemo(() => {
    scene.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const src = mesh as THREE.Mesh | null;
    const geometry = (src?.geometry ?? new THREE.CylinderGeometry(0.08, 0.08, 0.9, 8)).clone();
    // posição quantizada (inteiro normalizado): passa pra float antes de transformar
    const pos = geometry.getAttribute('position');
    if (pos && !(pos.array instanceof Float32Array)) {
      const f = new Float32Array(pos.count * 3);
      for (let i = 0; i < pos.count; i++) { f[i * 3] = pos.getX(i); f[i * 3 + 1] = pos.getY(i); f[i * 3 + 2] = pos.getZ(i); }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(f, 3));
    }
    if (src) { geometry.applyMatrix4(src.matrixWorld); geometry.rotateZ(-Math.PI / 2); }
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!, len = bb.max.y - bb.min.y || 1;
    geometry.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
    geometry.scale(0.9 / len, 0.9 / len, 0.9 / len);
    const material = src ? (src.material as THREE.Material).clone() : new THREE.MeshStandardMaterial({ color: '#4a4f45' });
    return { geometry, material };
  }, [scene]);
  useEffect(() => { onReady(asset); }, [asset, onReady]);
  return null;
}
/** explosão: bola de fogo que cresce e some (s); fumaça do rastro (instâncias) */
const BOOM_S = 0.55, BOOM_POOL = 4, SMOKE_N = 40, SMOKE_S = 0.7, SMOKE_EVERY = 0.035;
const BOOM_LIGHT = new THREE.Color('#ff9a40');
const tmpSmokeM = new THREE.Matrix4(), tmpSmokeQ = new THREE.Quaternion(), tmpSmokeS = new THREE.Vector3(), tmpSmokeP = new THREE.Vector3();

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
  /** 04/11: é um míssil da bazuca (rastro de fumaça + explosão ao chegar) */
  missile: boolean;
  ev: FeedbackEvent | null;
};

export function Projectiles() {
  const meshes = useRef<(THREE.Mesh | null)[]>(Array.from({ length: POOL }, () => null));
  const shots = useRef<Shot[]>(
    Array.from({ length: POOL }, () => ({ active: false, from: new THREE.Vector3(), to: new THREE.Vector3(), t: 0, dur: 0, wait: 0, ev: null, missile: false })),
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
  // 04/11: MÍSSIL da bazuca (GLB), a chama do motor (filho de cada projétil), a explosão e a fumaça
  const missile = useRef<{ geometry: THREE.BufferGeometry; material: THREE.Material } | null>(null);
  const onMissileReady = useMemo(() => (a: { geometry: THREE.BufferGeometry; material: THREE.Material }) => { missile.current = a; }, []);
  const flames = useRef<(THREE.Mesh | null)[]>(Array.from({ length: POOL }, () => null));
  const booms = useRef(Array.from({ length: BOOM_POOL }, () => ({ t: -1, at: new THREE.Vector3() })));
  const boomMeshes = useRef<(THREE.Mesh | null)[]>(Array.from({ length: BOOM_POOL }, () => null));
  const nextBoom = useRef(0);
  const smoke = useRef<THREE.InstancedMesh>(null);
  const puffs = useRef(Array.from({ length: SMOKE_N }, () => ({ t: -1, at: new THREE.Vector3() })));
  const nextPuff = useRef(0), puffAcc = useRef(0);
  const boom = (at: THREE.Vector3) => { const b = booms.current[nextBoom.current]!; nextBoom.current = (nextBoom.current + 1) % BOOM_POOL; b.t = 0; b.at.copy(at); };

  const spawn = (ev: FeedbackEvent) => {
    if (!ev.to) return;
    const i = next.current;
    next.current = (i + 1) % POOL;
    const s = shots.current[i]!;
    // TIRO DO HERÓI de arma de fogo (01/11): espera o braço chegar na mira e sai da BOCA da arma
    if (ev.hero && (ev.projectile === 'bullet' || ev.projectile === 'missile')) {
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
    const isMissile = ev.projectile === 'missile';
    s.dur = Math.max(0.05, s.from.distanceTo(s.to) / (ev.projectile === 'bullet' ? BULLET_SPEED : isMissile ? BAZOOKA.MISSILE_SPEED : SPEED));
    s.missile = isMissile;
    s.t = 0;
    s.active = true;
    if (m) {
      const bullet = ev.projectile === 'bullet';
      if (!ownMats.current[i]) ownMats.current[i] = m.material as THREE.Material;
      const glbArrow = !bullet && !isMissile ? arrow.current : null;
      const glbMissile = isMissile ? missile.current : null;
      m.geometry = glbMissile ? glbMissile.geometry : glbArrow ? glbArrow.geometry : geo;
      m.material = glbMissile ? glbMissile.material : glbArrow ? glbArrow.material : ownMats.current[i]!;
      const mat = ownMats.current[i] as THREE.MeshStandardMaterial;
      mat.color.set(bullet ? '#ffe08a' : isMissile ? '#4a4f45' : '#caa36a');
      mat.emissive.set(bullet ? '#ffb020' : '#000000');
      mat.emissiveIntensity = bullet ? 1.4 : 0;
      // bala rápida = risco de luz de ~2 m (traçante); míssil sem o GLB ainda = cilindro grosso de 0,9 m
      if (isMissile) m.scale.set(glbMissile ? 1 : 3, glbMissile ? 1 : 1.6, glbMissile ? 1 : 3);
      else m.scale.set(bullet ? 0.7 : 1, bullet ? 4 : 1, bullet ? 0.7 : 1);
      const fl = flames.current[i]; if (fl) fl.visible = isMissile;
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
      if (s.missile) {
        // rastro de fumaça: um sopro a cada ~35 ms atrás do míssil
        puffAcc.current += delta;
        if (puffAcc.current >= SMOKE_EVERY) { puffAcc.current = 0; const pf = puffs.current[nextPuff.current]!; nextPuff.current = (nextPuff.current + 1) % SMOKE_N; pf.t = 0; pf.at.copy(m.position); }
        if (k >= 1) boom(s.to);
      }
      if (k >= 1) { s.active = false; m.visible = false; s.missile = false; }
    }
    // EXPLOSÃO: cresce até ~6 m e some; clarão de luz (pool) enquanto dura
    for (let b = 0; b < BOOM_POOL; b++) {
      const e = booms.current[b]!, bm = boomMeshes.current[b];
      if (!bm) continue;
      if (e.t < 0) { bm.visible = false; continue; }
      e.t += delta;
      const q = e.t / BOOM_S;
      if (q >= 1) { e.t = -1; bm.visible = false; continue; }
      bm.visible = true;
      bm.position.copy(e.at);
      bm.scale.setScalar(0.6 + BAZOOKA.SPLASH_R * Math.sqrt(q));
      (bm.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - q);
      requestLight(e.at.x, e.at.y + 1.5, e.at.z, BOOM_LIGHT, 70 * (1 - q), 28, 1.4);
    }
    // FUMAÇA: cresce e encolhe até sumir (sem custo de material por sopro — uma instância cada)
    const sm = smoke.current;
    if (sm) {
      let any = false;
      for (let j = 0; j < SMOKE_N; j++) {
        const pf = puffs.current[j]!;
        let sc = 0;
        if (pf.t >= 0) { pf.t += delta; const q = pf.t / SMOKE_S; if (q >= 1) pf.t = -1; else { sc = (0.25 + 0.9 * q) * (1 - q * q); any = true; } }
        tmpSmokeP.copy(pf.at).y += pf.t >= 0 ? pf.t * 0.8 : 0;
        sm.setMatrixAt(j, tmpSmokeM.compose(tmpSmokeP, tmpSmokeQ, tmpSmokeS.setScalar(sc)));
      }
      sm.instanceMatrix.needsUpdate = true;
      sm.visible = any;
    }
  });

  return (
    <>
      <Suspense fallback={null}><ArrowAssetLoader onReady={onArrowReady} /></Suspense>
      <Suspense fallback={null}><MissileAssetLoader onReady={onMissileReady} /></Suspense>
      {Array.from({ length: POOL }, (_, i) => (
        <mesh key={i} ref={el => { meshes.current[i] = el; }} visible={false} geometry={geo} raycast={() => {}}>
          <meshStandardMaterial color="#caa36a" />
          {/* chama do motor do míssil (atrás: −Y no eixo do projétil) */}
          <mesh ref={(el) => { flames.current[i] = el; }} position={[0, -0.5, 0]} visible={false} raycast={() => {}}>
            <sphereGeometry args={[0.14, 8, 6]} />
            <meshBasicMaterial color="#ffb347" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
          </mesh>
        </mesh>
      ))}
      {Array.from({ length: BOOM_POOL }, (_, i) => (
        <mesh key={'boom' + i} ref={(el) => { boomMeshes.current[i] = el; }} visible={false} raycast={() => {}}>
          <sphereGeometry args={[1, 14, 10]} />
          <meshBasicMaterial color="#ff8a2a" transparent opacity={0.9} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <instancedMesh ref={smoke} args={[undefined, undefined, SMOKE_N]} visible={false} frustumCulled={false} raycast={() => {}}>
        <sphereGeometry args={[0.35, 7, 5]} />
        <meshBasicMaterial color="#9a958c" transparent opacity={0.35} depthWrite={false} />
      </instancedMesh>
    </>
  );
}
