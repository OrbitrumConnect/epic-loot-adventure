/**
 * Tropas em campo na horda (etapa 1 — Pedro, 23/10). Só desenha: posição/ação/vida vêm da store
 * (`fieldTroops`, as MINHAS) ou da rede (`useNet.troops`, as dos OUTROS — de carona na pose). Modelo =
 * os raiders Mixamo já corrigidos (sem modelo novo): brutamonte (Guerreiro/Lanceiro) e arqueira de
 * corda (Arqueiro). Anel e barra: VERDE = minhas/aliadas · VERMELHO = de jogador inimigo.
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import * as THREE from 'three';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore } from '@/game/state/game-store';
import { isTroopUnit, type TroopUnitId } from '@/game/systems/troopSystem';
import { useNet } from '@/net/multiplayer';
import { GlbHeroMixamo } from './glb-hero-mixamo';
import type { HeroAction } from './glb-hero';
import { glbSurfaceY } from './terrain-collision';
import { markPointerConsumed, terrainHeight } from './world-kit';
import { strikeRemoteTroop } from './remote-base-strike';

const MODEL: Record<TroopUnitId, { url: string; height: number; forceBow?: boolean }> = {
  warrior: { url: '/models/raiders/scrap_brute.glb', height: 1.9 },
  spearman: { url: '/models/raiders/scrap_brute.glb', height: 2.3 },
  archer: { url: '/models/raiders/rope_archer.glb', height: 1.85, forceBow: true },
};
const ALLY = '#4ade80';
const ENEMY = '#ef4444';
const noRaycast = () => {};

/** O que uma tropa precisa pra ser desenhada (minha ou da rede). */
type TroopView = { x: number; z: number; yaw: number; action: string; hp: number; maxHp: number };

function Troop({ unitId, get, color, onHit }: { unitId: TroopUnitId; get: () => TroopView | undefined; color: string; onHit?: (() => void) | undefined }) {
  const group = useRef<THREE.Group>(null);
  const bar = useRef<THREE.Group>(null);
  const fill = useRef<THREE.Mesh>(null);
  const action = useRef<HeroAction>('idle');
  const init = useRef(false);
  const m = MODEL[unitId];
  useFrame((state, delta) => {
    const g = group.current;
    const t = get();
    if (!g || !t) return;
    const y = glbSurfaceY(t.x, t.z, terrainHeight(t.x, t.z));
    if (!init.current) { g.position.set(t.x, y, t.z); g.rotation.y = t.yaw; init.current = true; }
    const k = 1 - Math.exp(-14 * Math.min(delta, 0.1));
    g.position.x += (t.x - g.position.x) * k;
    g.position.z += (t.z - g.position.z) * k;
    g.position.y = y;
    let dy = t.yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * k;
    action.current = (t.action === 'walk' || t.action === 'attack' ? t.action : 'idle') as HeroAction;
    if (fill.current) {
      const r = Math.max(0, Math.min(1, t.hp / Math.max(1, t.maxHp)));
      fill.current.scale.x = r;
      fill.current.position.x = -0.45 + r * 0.45;
    }
    if (bar.current) bar.current.quaternion.copy(state.camera.quaternion).premultiply(g.quaternion.clone().invert());
  });
  return (
    <group ref={group} {...(onHit ? { onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0 || document.pointerLockElement) return; // mouse travado: o clique é da mira
      e.stopPropagation();
      markPointerConsumed(e.nativeEvent);
      onHit();
    } } : {})}>
      <Suspense fallback={null}>
        <GlbHeroMixamo actionRef={action} charUrl={m.url} autoHeight={m.height} standFixX={Math.PI / 2} twistFix forceBow={m.forceBow ?? false} />
      </Suspense>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} raycast={noRaycast}>
        <ringGeometry args={[0.55, 0.72, 32]} />
        <meshBasicMaterial color={color} transparent opacity={0.8} depthWrite={false} />
      </mesh>
      <group ref={bar} position={[0, m.height + 0.35, 0]}>
        <mesh renderOrder={10} raycast={noRaycast}>
          <planeGeometry args={[0.94, 0.12]} />
          <meshBasicMaterial color="#101d19" transparent opacity={0.85} depthTest={false} depthWrite={false} />
        </mesh>
        <mesh ref={fill} position={[0, 0, 0.002]} renderOrder={11} raycast={noRaycast}>
          <planeGeometry args={[0.9, 0.08]} />
          <meshBasicMaterial color={color} transparent depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </group>
  );
}

/** MINHAS tropas em campo. Re-renderiza só quando ENTRA/SAI tropa (posição é no useFrame). */
export function AllyTroops() {
  const list = useGameStore(useShallow((s) => s.fieldTroops.map((t) => `${t.id}|${t.unitId}`)));
  return (
    <>
      {list.map((k) => {
        const [id, unitId] = k.split('|') as [string, TroopUnitId];
        return <Troop key={id} unitId={unitId} color={ALLY}
          get={() => useGameStore.getState().fieldTroops.find((t) => t.id === id)} />;
      })}
    </>
  );
}

/** Tropas dos OUTROS jogadores (online). Cor pela relação: inimigo vermelho, aliado verde. */
export function RemoteTroops() {
  const list = useNet(useShallow((s) => Object.entries(s.troops).flatMap(([owner, ts]) => ts.map((t) => `${owner}|${t.i}|${t.u}`))));
  return (
    <>
      {list.map((k) => {
        const [owner, id, unitId] = k.split('|') as [string, string, string];
        if (!isTroopUnit(unitId)) return null;
        const net = useNet.getState();
        const hostile = net.players[owner]?.side === 'enemy' || net.selfSide === 'enemy';
        return <Troop key={`${owner}:${id}`} unitId={unitId} color={hostile ? ENEMY : ALLY}
          onHit={hostile ? () => strikeRemoteTroop(owner, id) : undefined}
          get={() => {
            const t = useNet.getState().troops[owner]?.find((x) => x.i === id);
            return t ? { x: t.x, z: t.z, yaw: t.r, action: t.a, hp: t.h, maxHp: t.m } : undefined;
          }} />;
      })}
    </>
  );
}
