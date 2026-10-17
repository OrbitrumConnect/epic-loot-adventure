import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useNet } from '@/net/multiplayer';
import { GlbHeroMixamo } from './glb-hero-mixamo';
import type { HeroAction } from './glb-hero';
import { terrainHeight, HERO_HEIGHT } from './world-kit';

const ACTIONS = new Set(['idle', 'walk', 'run', 'attack', 'jump']);

/** Um jogador remoto: lê a pose do net (via getState, sem re-render) e interpola
 *  posição/giro suave. Usa o mesmo herói (Survivor Red) que o jogador local. */
function RemotePlayer({ id }: { id: string }) {
  const group = useRef<THREE.Group>(null);
  const action = useRef<HeroAction>('idle');
  const inited = useRef(false);
  const identity = useRef<HTMLDivElement>(null);
  const identityText = useRef('');
  useFrame(() => {
    const g = group.current;
    const p = useNet.getState().players[id];
    if (!g || !p) return;
    const label = `${p.name} · Nv. ${Number.isFinite(p.level) ? p.level : 1}`;
    if (identity.current && identityText.current !== label) {
      identity.current.textContent = label;
      identityText.current = label;
    }
    action.current = (ACTIONS.has(p.action) ? p.action : 'idle') as HeroAction;
    if (!inited.current) { g.position.set(p.x, terrainHeight(p.x, p.z), p.z); g.rotation.y = p.yaw; inited.current = true; }
    g.position.x += (p.x - g.position.x) * 0.22;
    g.position.z += (p.z - g.position.z) * 0.22;
    g.position.y = terrainHeight(g.position.x, g.position.z);
    let dy = p.yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * 0.22;
  });
  return (
    <group ref={group}>
      <GlbHeroMixamo actionRef={action} autoHeight={HERO_HEIGHT * 1.04} />
      <Html transform sprite center position={[0, HERO_HEIGHT + 0.65, 0]} scale={0.035} style={{ pointerEvents: 'none' }}>
        <div ref={identity} style={{ whiteSpace: 'nowrap', color: '#fff3c4', background: 'transparent', padding: 0, font: '700 12px system-ui', textShadow: '0 1px 3px #000' }} />
      </Html>
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
