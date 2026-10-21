import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useNet, broadcastPlayerHit } from '@/net/multiplayer';
import { GlbHeroMixamo } from './glb-hero-mixamo';
import type { HeroAction } from './glb-hero';
import { labelTexture, markPointerConsumed, terrainHeight, HERO_HEIGHT } from './world-kit';
import { glbSurfaceY } from './terrain-collision';
import { selectedItemId } from './held-weapon';
import { useGameStore } from '@/game/state/game-store';
import { weaponRangeFor } from '@/game/data/weapons';
import { damageMultiplier } from '@/game/systems/attributesSystem';
import { playerBaseAttack } from '@/game/systems/progressionSystem';
import { ITEMS } from '@/game/data/items';
import { resolveRemotePose } from './remote-player-interpolation';
const INTERPOLATION_DELAY_MS = 100;

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
  const enemyRing = useRef<THREE.Mesh>(null); // anel vermelho sob INIMIGOS (PvP, atualiza ao vivo)
  const initial = useNet.getState().players[id];
  const title = `${initial?.name ?? 'Viajante'} · Nv. ${initial?.level ?? 1}`;
  const texture = useMemo(() => labelTexture(title, '#fff3c4'), [title]);
  useFrame((state, delta) => {
    const g = group.current;
    const p = useNet.getState().players[id];
    if (!g || !p) return;
    const now = performance.now();
    const pose = resolveRemotePose(useNet.getState().poseHistory[id] ?? [], now - INTERPOLATION_DELAY_MS, now);
    if (!pose) return;
    action.current = (ACTIONS.has(p.action) ? p.action : 'idle') as HeroAction;
    if (!inited.current) { g.position.set(pose.x, glbSurfaceY(pose.x, pose.z, terrainHeight(pose.x, pose.z)), pose.z); g.rotation.y = pose.yaw; inited.current = true; }
    const dt = Math.min(delta, 0.1);
    const t = 1 - Math.exp(-15 * dt);
    g.position.x += (pose.x - g.position.x) * t;
    g.position.z += (pose.z - g.position.z) * t;
    g.position.y = glbSurfaceY(g.position.x, g.position.z, terrainHeight(g.position.x, g.position.z));
    let dy = pose.yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * t;
    const player = useGameStore.getState().player.position;
    const dist = Math.hypot(player.x - g.position.x, player.z - g.position.z);
    if (labelGroup.current) {
      labelGroup.current.visible = dist <= LABEL_RANGE;
      labelGroup.current.quaternion.copy(state.camera.quaternion);
    }
    const enemy = p.side === 'enemy';
    if (hpFill.current) {
      const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
      hpFill.current.scale.x = ratio;
      hpFill.current.position.x = -0.45 + ratio * 0.45;
      // Barra vermelha pra inimigo, verde pra aliado (atualiza ao vivo quando ele escolhe).
      (hpFill.current.material as THREE.MeshBasicMaterial).color.set(enemy ? '#ef4444' : '#55c979');
    }
    if (enemyRing.current) enemyRing.current.visible = enemy;
  });
  return (
    <group ref={group} onPointerDown={(event) => {
      if (event.button !== 0) return;
      event.stopPropagation();
      markPointerConsumed(event.nativeEvent);
      const p = useNet.getState().players[id];
      if (!p) return;
      const store = useGameStore.getState();
      const me = store.player;
      const hostile = p.side === 'enemy' || useNet.getState().selfSide === 'enemy';
      const g = group.current;
      // Aliado (ou eu morto): só mostra a ficha. Inimigo: PvP — golpe se estiver no alcance.
      if (!hostile || me.dead || !g) {
        store.setMessage(`${p.name} · Nv. ${p.level} · ${Math.round(p.hp)}/${Math.round(p.maxHp)} PV.`);
        return;
      }
      const dist = Math.hypot(me.position.x - g.position.x, me.position.z - g.position.z);
      const heldId = selectedItemId(store);
      const range = weaponRangeFor(heldId, me.level);
      if (dist > range + 0.6) { store.setMessage(`${p.name} está longe demais (${range.toFixed(1)}m).`); return; }
      const base = playerBaseAttack(me.level) + (heldId ? (ITEMS[heldId]?.attackPower ?? 0) : 0);
      const dmg = Math.max(1, Math.round(base * damageMultiplier(me)));
      broadcastPlayerHit(id, dmg);
      store.setMessage(`⚔️ Você atingiu ${p.name}! -${dmg}`);
    }}>
      <GlbHeroMixamo actionRef={action} autoHeight={HERO_HEIGHT * 1.04} />
      {/* Anel vermelho sob INIMIGOS (PvP). Fica invisível pra aliado; toggle no useFrame. */}
      <mesh ref={enemyRing} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} visible={false} raycast={noRaycast}>
        <ringGeometry args={[0.55, 0.72, 36]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.75} depthWrite={false} />
      </mesh>
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
