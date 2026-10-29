/**
 * HERÓI NA FICHA (inventário elite, 29/10): o MESMO herói do jogo (GLB + arma na mão), parado em pose de espera, num
 * pedestal. Arrastar gira. Canvas próprio, pequeno, que só existe com a ficha aberta (fecha = some, libera a GPU).
 * Carregado sob demanda (lazy) — o jogo não paga nada por ele enquanto a ficha está fechada.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { HeldItem } from '@/components/world/held-weapon';
import { HERO_HEIGHT, palette } from '@/components/world/world-kit';

/** Giro do pedestal (rad): arrastar soma; solto, volta devagar pra frente. */
type Spin = { yaw: number; drag: boolean; lastX: number };

function Turntable({ spin, children }: { spin: React.MutableRefObject<Spin>; children: React.ReactNode }) {
  const g = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    const s = spin.current;
    if (!s.drag) s.yaw += (0.35 - s.yaw) * Math.min(1, dt * 1.5); // repousa levemente de 3/4 (mostra o volume)
    if (g.current) g.current.rotation.y = s.yaw;
  });
  return <group ref={g}>{children}</group>;
}

function Pedestal() {
  const ring = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e7c06a', transparent: true, opacity: 0.55, depthWrite: false }), []);
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: '#e7c06a', transparent: true, opacity: 0.12, depthWrite: false }), []);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]}><circleGeometry args={[0.95, 64]} /><primitive object={glow} attach="material" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[0.86, 0.9, 64]} /><primitive object={ring} attach="material" /></mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]}><ringGeometry args={[0.55, 0.565, 64]} /><primitive object={ring} attach="material" /></mesh>
    </group>
  );
}

/** Reflexo de estúdio pro METAL (espada/armadura) não sair preto — ambiente gerado na hora, sem baixar HDR. */
function StudioEnv() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.55;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

/** Avisa quando o herói terminou de carregar (o Suspense soltou). */
function Ready({ onReady }: { onReady: () => void }) {
  useEffect(() => { onReady(); }, [onReady]);
  return null;
}

export default function HeroPreview() {
  const action = useRef<HeroAction>('idle');
  const speed = useRef(0);
  const spin = useRef<Spin>({ yaw: 0.35, drag: false, lastX: 0 });
  const c = useMemo(() => palette(), []);
  const [ready, setReady] = useState(false);
  const onReady = useCallback(() => setReady(true), []);
  return (
    <div className="hero-preview" data-ready={ready || undefined}
      onPointerDown={(e) => { spin.current.drag = true; spin.current.lastX = e.clientX; (e.target as Element).setPointerCapture?.(e.pointerId); }}
      onPointerMove={(e) => { const s = spin.current; if (!s.drag) return; s.yaw += (e.clientX - s.lastX) * 0.012; s.lastX = e.clientX; }}
      onPointerUp={() => { spin.current.drag = false; }} onPointerCancel={() => { spin.current.drag = false; }}
      title="Arraste para girar">
      {!ready && <span className="hero-preview__wait">Carregando herói…</span>}
      <Canvas dpr={[1, 1.5]} camera={{ position: [0, 1.0, 4.6], fov: 30, near: 0.1, far: 30 }}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power', toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.1 }}
        onCreated={({ camera }) => camera.lookAt(0, 0.9, 0)}>
        <StudioEnv />
        <hemisphereLight args={['#fff4dc', '#2a3a32', 0.9]} />
        <directionalLight position={[2.5, 4, 3]} intensity={1.8} color="#fff1d6" />
        <directionalLight position={[-3, 2.2, -2.5]} intensity={1.1} color="#8fb4ff" />
        <Pedestal />
        <Suspense fallback={null}>
          <Turntable spin={spin}>
            <GlbHeroMixamo actionRef={action} speedRef={speed} autoHeight={HERO_HEIGHT * 1.04} rangedAttack preview weapon={<HeldItem c={c} />} />
          </Turntable>
          <Ready onReady={onReady} />
        </Suspense>
      </Canvas>
    </div>
  );
}
