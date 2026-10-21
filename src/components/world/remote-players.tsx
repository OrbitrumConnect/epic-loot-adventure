import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useNet } from '@/net/multiplayer';
import { GlbHeroMixamo } from './glb-hero-mixamo';
import type { HeroAction } from './glb-hero';
import { labelTexture, markPointerConsumed, terrainHeight, HERO_HEIGHT } from './world-kit';
import { glbSurfaceY } from './terrain-collision';
import { useGameStore } from '@/game/state/game-store';

const ACTIONS = new Set(['idle', 'walk', 'run', 'attack', 'jump']);
const LABEL_RANGE = 12;
const noRaycast = () => {};

/** Um jogador remoto: lê a pose do net (via getState, sem re-render) e interpola
 *  posição/giro suave. Usa o mesmo herói (Survivor Red) que o jogador local. */
function RemotePlayer({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const action = useRef<HeroAction>('idle');
  const inited = useRef(false);
  const labelGroup = useRef<THREE.Group>(null);
  const hpFill = useRef<THREE.Mesh>(null);
  const initial = useNet.getState().players[id];
  const title = `${initial?.name ?? 'Viajante'} · Nv. ${initial?.level ?? 1}`;
  const texture = useMemo(() => labelTexture(title, '#fff3c4'), [title]);
  useFrame((state, delta) => {
    const g = group.current;
    const p = useNet.getState().players[id];
    if (!g || !p) return;
    action.current = (ACTIONS.has(p.action) ? p.action : 'idle') as HeroAction;
    if (!inited.current) { g.position.set(p.x, glbSurfaceY(p.x, p.z, terrainHeight(p.x, p.z)), p.z); g.rotation.y = p.yaw; inited.current = true; }
    const dt = Math.min(delta, 0.1);
    const t = 1 - Math.exp(-15 * dt);
    g.position.x += (p.x - g.position.x) * t;
    g.position.z += (p.z - g.position.z) * t;
    g.position.y = glbSurfaceY(g.position.x, g.position.z, terrainHeight(g.position.x, g.position.z));
    let dy = p.yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * t;
    const player = useGameStore.getState().player.position;
    const dist = Math.hypot(player.x - g.position.x, player.z - g.position.z);
    if (labelGroup.current) {
      labelGroup.current.visible = dist <= LABEL_RANGE;
      labelGroup.current.quaternion.copy(state.camera.quaternion);
    }
    if (hpFill.current) {
      const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
      hpFill.current.scale.x = ratio;
      hpFill.current.position.x = -0.45 + ratio * 0.45;
    }
  });
  return (
    <group ref={group} onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      markPointerConsumed(event.nativeEvent);
      const p = useNet.getState().players[id];
      if (p) useGameStore.getState().setMessage(`${p.name} · Nv. ${p.level} · ${Math.round(p.hp)}/${Math.round(p.maxHp)} PV.`);
    }}>
      <GlbHeroMixamo actionRef={action} autoHeight={HERO_HEIGHT * 1.04} />
      <group ref={labelGroup} position={[0, HERO_HEIGHT + 0.65, 0]} visible={false}>
        <mesh position={[0, 0.2, 0]} renderOrder={12} raycast={noRaycast}>
          <planeGeometry args={[0.2 * texture.aspect, 0.2]} />
          <meshBasicMaterial map={texture.texture} transparent depthTest={false} depthWrite={false} />
        </mesh>
        <mesh renderOrder={10} raycast={noRaycast}>
          <planeGeometry args={[0.94, 0.14]} />
          <meshBasicMaterial color="#101d19" transparent opacity={0.86} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh ref={hpFill} position={[0, 0, 0.002]} renderOrder={11} raycast={noRaycast}>
          <planeGeometry args={[0.9, 0.1]} />
          <meshBasicMaterial color="#55c979" transparent depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** Renderiza todos os jogadores remotos. Re-renderiza só quando a LISTA muda
 *  (entrar/sair) — as poses atualizam no useFrame, sem custo de re-render. */
export function RemotePlayers() {
  const ids = useNet(useShallow((s) => Object.keys(s.players)));
  if (ids.length === 0) return null;
  return <>{ids.map((id) => <RemotePlayer key={id} id={id} />)}</>;
}
