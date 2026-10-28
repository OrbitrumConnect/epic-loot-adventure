/**
 * ZONA SUL (rota isolada /zona-sul) — o Rio pós-colapso tomado pela mata: relevo real (escala 1:3), mar e Lagoa com
 * NADO, mata atlântica instanciada, herói do jogo andando com colisão no chão. NÃO mexe no mapa do jogo.
 * Controles: WASD/setas anda · Shift corre · Espaço pula · arrastar gira a câmera · roda = zoom.
 * Celular: dedo à esquerda anda (joystick), à direita gira a câmera.
 */
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Sky } from '@react-three/drei';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { HERO_HEIGHT } from '@/components/world/world-kit';
import { ZS_LANDMARKS, ZS_SPAWN } from './zona-sul-meta';
import { loadZsTerrain, type ZsTerrain, zsHeightAt, ZS_WATER_Y } from './zs-terrain-data';
import { ZsTerrainMesh } from './zs-terrain-mesh';
import { ZsWater } from './zs-water';
import { ZsVegetation } from './zs-vegetation';
import { zsStep, ZS_RUN, ZS_SWIM_K, ZS_SWIM_SINK, ZS_WALK, zsWaterState } from './zs-move';

const SUN = new THREE.Vector3(-0.55, 0.62, -0.45).normalize();
const FOG = '#bcd0dc';

type Hud = { x: number; z: number; y: number; state: string; near: string; overview: boolean };
/** Entrada + câmera. `overview` (tecla K): câmera de CIMA solta do boneco — WASD move a vista, Shift acelera,
 *  arrastar gira, roda sobe/desce; K de novo volta pro herói (o herói fica parado onde estava). */
const input = { keys: new Set<string>(), stick: { x: 0, z: 0 }, yaw: 0.6, pitch: 0.32, dist: 9, overview: false, ov: { x: 0, z: 0, alt: 420, pitch: 1.05 } };

function Hero({ t, heroRef, focusRef, onHud }: { t: ZsTerrain; heroRef: React.MutableRefObject<THREE.Vector3>; focusRef: React.MutableRefObject<THREE.Vector3>; onHud: (h: Hud) => void }) {
  const group = useRef<THREE.Group>(null);
  const action = useRef<HeroAction>('idle');
  const speed = useRef(0);
  const vy = useRef(0);
  const grounded = useRef(true);
  const facing = useRef(0);
  const hudAcc = useRef(0);
  const sun = useRef<THREE.DirectionalLight>(null);
  const { camera, scene } = useThree();

  const fog = useMemo(() => new THREE.Fog(FOG, 200, 2200), []); // névoa LEVE (custo ~zero: é uma conta no shader)
  useEffect(() => { scene.fog = fog; return () => { scene.fog = null; }; }, [scene, fog]);
  const wasOverview = useRef(false);

  useFrame((_, dtRaw) => {
    const dt = Math.min(0.05, dtRaw);
    const p = heroRef.current, k = input.keys;
    if (input.overview) {
      if (!wasOverview.current) { input.ov.x = p.x; input.ov.z = p.z; wasOverview.current = true; }
      const o = input.ov, sy0 = Math.sin(input.yaw), cy0 = Math.cos(input.yaw);
      const mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const mz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
      const sp = o.alt * (k.has('ShiftLeft') || k.has('ShiftRight') ? 2.4 : 0.8) * dt;
      o.x += (mx * cy0 + mz * sy0) * sp; o.z += (-mx * sy0 + mz * cy0) * sp;
      o.x = Math.max(t.x0, Math.min(t.x0 + t.w * t.cell, o.x)); o.z = Math.max(t.z0, Math.min(t.z0 + t.h * t.cell, o.z));
      const gy = Math.max(zsHeightAt(t, o.x, o.z), ZS_WATER_Y);
      const back = o.alt / Math.tan(o.pitch);
      camera.position.set(o.x + sy0 * back, gy + o.alt, o.z + cy0 * back);
      camera.lookAt(o.x, gy, o.z);
      focusRef.current.set(o.x, gy, o.z);
      fog.near = 900; fog.far = 6000;
      action.current = 'idle'; speed.current = 0;
      hudAcc.current += dt;
      if (hudAcc.current > 0.25) { hudAcc.current = 0; onHud({ x: o.x, z: o.z, y: o.alt, state: `vista de cima (${Math.round(o.alt)} m)`, near: '', overview: true }); }
      return;
    }
    if (wasOverview.current) { wasOverview.current = false; fog.near = 200; fog.far = 2200; }
    focusRef.current.copy(p);
    // direção relativa à câmera
    let ix = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0) + input.stick.x;
    let iz = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) + input.stick.z;
    const il = Math.hypot(ix, iz); if (il > 1) { ix /= il; iz /= il; }
    const sy = Math.sin(input.yaw), cy = Math.cos(input.yaw);
    const wx = ix * cy + iz * sy, wz = -ix * sy + iz * cy; // gira o input pelo yaw da câmera
    const water0 = zsWaterState(zsHeightAt(t, p.x, p.z));
    const run = (k.has('ShiftLeft') || k.has('ShiftRight') || Math.hypot(input.stick.x, input.stick.z) > 0.92) && !water0.swimming;
    const v = (run ? ZS_RUN : ZS_WALK) * (water0.swimming ? ZS_SWIM_K : water0.wading ? 0.75 : 1);
    const moving = Math.hypot(wx, wz) > 0.05;
    const st = moving ? zsStep(t, p.x, p.z, wx * v * dt, wz * v * dt) : { x: p.x, z: p.z, ground: zsHeightAt(t, p.x, p.z), ...water0 };
    p.x = st.x; p.z = st.z;
    if (moving) facing.current = Math.atan2(wx, wz);
    // vertical: pulo (só fora d'água funda) + chão / nado
    if (k.has('Space') && grounded.current && !st.swimming) { vy.current = 6.2; grounded.current = false; }
    const floor = st.swimming ? ZS_WATER_Y - ZS_SWIM_SINK : st.ground;
    if (!grounded.current) { vy.current -= 15 * dt; p.y += vy.current * dt; if (p.y <= floor) { p.y = floor; grounded.current = true; vy.current = 0; } }
    else p.y += (floor - p.y) * Math.min(1, dt * (st.swimming ? 6 : 30));
    action.current = !grounded.current ? 'jump' : moving ? (run ? 'run' : 'walk') : 'idle';
    speed.current = moving ? v : 0;
    if (group.current) {
      group.current.position.set(p.x, p.y, p.z);
      let d = facing.current - group.current.rotation.y;
      while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      group.current.rotation.y += d * Math.min(1, dt * 12);
    }
    // câmera em órbita, sem entrar no chão
    const tx = p.x, ty = p.y + 1.6, tz = p.z;
    const cp = Math.cos(input.pitch);
    const cx = tx + Math.sin(input.yaw) * cp * input.dist, cz = tz + Math.cos(input.yaw) * cp * input.dist;
    let cyy = ty + Math.sin(input.pitch) * input.dist;
    const gcam = Math.max(zsHeightAt(t, cx, cz), ZS_WATER_Y) + 0.6;
    if (cyy < gcam) cyy = gcam;
    camera.position.set(cx, cyy, cz);
    camera.lookAt(tx, ty, tz);
    // sol + sombra seguem o herói
    if (sun.current) { sun.current.position.set(p.x + SUN.x * 120, p.y + SUN.y * 120, p.z + SUN.z * 120); sun.current.target.position.set(p.x, p.y, p.z); sun.current.target.updateMatrixWorld(); }
    hudAcc.current += dt;
    if (hudAcc.current > 0.25) {
      hudAcc.current = 0;
      let best = '', bd = 700;
      for (const l of ZS_LANDMARKS) { const d = Math.hypot(l.x - p.x, l.z - p.z); if (d < bd) { bd = d; best = `${l.name} (${Math.round(d)} m)`; } }
      onHud({ x: p.x, z: p.z, y: p.y, state: st.swimming ? 'nadando' : st.wading ? 'na água rasa' : !grounded.current ? 'pulando' : run && moving ? 'correndo' : moving ? 'andando' : 'parado', near: best, overview: false });
    }
  });

  return (
    <>
      <directionalLight ref={sun} intensity={2.1} color="#fff4e0" castShadow shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45} shadow-camera-far={300} shadow-bias={-0.0004} />
      <group ref={group}>
        <Suspense fallback={null}>
          <GlbHeroMixamo actionRef={action} speedRef={speed} autoHeight={HERO_HEIGHT * 1.04} />
        </Suspense>
      </group>
    </>
  );
}

function Controls() {
  const { gl } = useThree();
  useEffect(() => {
    const el = gl.domElement;
    const kd = (e: KeyboardEvent) => {
      if (e.code === 'KeyK' && !e.repeat) input.overview = !input.overview;
      input.keys.add(e.code); if (e.code === 'Space') e.preventDefault();
    };
    const ku = (e: KeyboardEvent) => input.keys.delete(e.code);
    const blur = () => input.keys.clear();
    const look = new Map<number, { x: number; y: number }>(), stick = new Map<number, { x: number; y: number }>();
    const down = (e: PointerEvent) => {
      el.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && e.clientX < el.clientWidth * 0.45) stick.set(e.pointerId, { x: e.clientX, y: e.clientY });
      else look.set(e.pointerId, { x: e.clientX, y: e.clientY });
    };
    const move = (e: PointerEvent) => {
      const l = look.get(e.pointerId);
      if (l) {
        input.yaw -= (e.clientX - l.x) * 0.006;
        if (input.overview) input.ov.pitch = Math.max(0.35, Math.min(1.5, input.ov.pitch + (e.clientY - l.y) * 0.004));
        else input.pitch = Math.max(-0.15, Math.min(1.35, input.pitch + (e.clientY - l.y) * 0.005));
        l.x = e.clientX; l.y = e.clientY;
      }
      const s = stick.get(e.pointerId);
      if (s) { input.stick.x = Math.max(-1, Math.min(1, (e.clientX - s.x) / 60)); input.stick.z = Math.max(-1, Math.min(1, (e.clientY - s.y) / 60)); }
    };
    const up = (e: PointerEvent) => { look.delete(e.pointerId); if (stick.delete(e.pointerId)) { input.stick.x = 0; input.stick.z = 0; } };
    const wheel = (e: WheelEvent) => {
      const f = e.deltaY > 0 ? 1.12 : 0.89;
      if (input.overview) input.ov.alt = Math.max(60, Math.min(2600, input.ov.alt * f));
      else input.dist = Math.max(3, Math.min(40, input.dist * f));
      e.preventDefault();
    };
    window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('blur', blur);
    el.addEventListener('pointerdown', down); el.addEventListener('pointermove', move); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('blur', blur);
      el.removeEventListener('pointerdown', down); el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [gl]);
  return null;
}

export default function ZonaSulWorld() {
  const [t, setT] = useState<ZsTerrain | null>(null);
  const [err, setErr] = useState('');
  const [hud, setHud] = useState<Hud | null>(null);
  const heroRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  /** Onde o detalhe (chão, árvores, água) é montado: o herói, ou o centro da vista de cima (tecla K). */
  const focusRef = useRef(new THREE.Vector3(ZS_SPAWN.x, 0, ZS_SPAWN.z));
  useEffect(() => {
    let alive = true;
    loadZsTerrain().then((tt) => { if (!alive) return; heroRef.current.y = zsHeightAt(tt, ZS_SPAWN.x, ZS_SPAWN.z); setT(tt); }).catch((e) => alive && setErr(String(e)));
    return () => { alive = false; };
  }, []);
  const sunPos = useMemo(() => SUN.clone().multiplyScalar(1000).toArray() as [number, number, number], []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: FOG, touchAction: 'none' }}>
      {t && (
        <Canvas shadows dpr={[1, 1.25]} camera={{ fov: 55, near: 0.3, far: 7000 }} gl={{ antialias: true }}>
          <color attach="background" args={[FOG]} />
          <Sky sunPosition={sunPos} turbidity={5} rayleigh={1.4} mieCoefficient={0.006} distance={4500} />
          <hemisphereLight args={['#eef4f8', '#6b7a4a', 1.5]} />
          <ambientLight intensity={0.35} />
          <ZsTerrainMesh t={t} heroRef={focusRef} />
          <ZsWater t={t} />
          <ZsVegetation t={t} heroRef={focusRef} />
          <Hero t={t} heroRef={heroRef} focusRef={focusRef} onHud={setHud} />
          <Controls />
        </Canvas>
      )}
      <div style={{ position: 'absolute', top: 10, left: 12, color: '#10202c', font: '600 13px system-ui', background: 'rgba(255,255,255,.72)', padding: '6px 10px', borderRadius: 8, pointerEvents: 'none', maxWidth: 'calc(100% - 24px)' }}>
        TRIBOS · Zona Sul (teste isolado — não é o mapa do jogo)
        {hud && <div style={{ font: '400 12px system-ui', marginTop: 3 }}>{hud.state} · altura {hud.y.toFixed(0)} m{hud.near ? ` · perto de ${hud.near}` : ''}</div>}
        <div style={{ font: '400 11px system-ui', marginTop: 2, opacity: 0.8 }}>
          {hud?.overview ? 'VISTA DE CIMA · WASD move · Shift rápido · arraste gira · roda sobe/desce · K volta pro herói'
            : 'WASD anda · Shift corre · Espaço pula · arraste gira · roda = zoom · K = vista de cima'}
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 6, right: 8, color: '#10202c', font: '400 10px system-ui', background: 'rgba(255,255,255,.6)', padding: '2px 6px', borderRadius: 5, pointerEvents: 'none' }}>
        Relevo: AWS Terrain Tiles (SRTM) · Mapa: © OpenStreetMap contributors (ODbL)
      </div>
      {!t && !err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: '600 18px system-ui', color: '#10202c' }}>Carregando a Zona Sul…</div>}
      {err && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', font: '600 16px system-ui', color: '#8a1c1c' }}>Erro: {err}</div>}
    </div>
  );
}
