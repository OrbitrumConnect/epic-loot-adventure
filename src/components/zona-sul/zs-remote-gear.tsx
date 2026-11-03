/**
 * EQUIPAMENTO DOS OUTROS JOGADORES na Zona Sul (02/11, Pedro online: "amigo nadando vejo ele em pé na água; não vejo o
 * skate no pé dele; na prancha em pé, não deitado nem surfando" — vale pra aliado e inimigo).
 * A pose dele traz `g` = [tipo, altura acima do pé, rumo, rolagem, inclinação]; aqui a prancha / skate / asa-delta é
 * desenhada no lugar do boneco dele (o mesmo modelo que o meu, mesmo cache). E o KIT da Zona Sul pro boneco dos outros:
 * os mesmos clips do meu herói (nadar, boiar, remar, levantar, surfar, asa, dirigir) e as ações aceitas pela rede.
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useRef } from 'react';
import type * as THREE from 'three';
import { useNet } from '@/net/multiplayer';
import type { RemoteZsKit } from '@/components/world/remote-players';
import { newBoardPose, ZsBoardView } from './zs-board-view';
import { ZsGearView } from './zs-gear-view';
import { ZS_GEAR, ZS_HERO_ACTIONS, ZS_HERO_CLIPS, ZS_HERO_CUT } from './zs-hero-clips';

export function ZsRemoteGear({ id, bodyRef }: { id: string; bodyRef: React.RefObject<THREE.Group | null> }) {
  const board = useRef(newBoardPose()), skate = useRef(newBoardPose()), glider = useRef(newBoardPose());
  useFrame(() => {
    const p = useNet.getState().players[id], body = bodyRef.current, g = p?.g;
    const kind = g && g.length >= 5 ? g[0] : 0;
    for (const [pose, k] of [[board, ZS_GEAR.board], [skate, ZS_GEAR.skate], [glider, ZS_GEAR.glider]] as const) {
      const on = !!body && kind === k;
      pose.current.visible = on;
      if (!on || !g) continue;
      pose.current.x = body.position.x; pose.current.y = body.position.y + g[1]!; pose.current.z = body.position.z;
      pose.current.yaw = g[2]!; pose.current.roll = g[3]!; pose.current.pitch = g[4]!;
    }
  });
  return (
    <>
      <Suspense fallback={null}><ZsBoardView poseRef={board} /></Suspense>
      <Suspense fallback={null}><ZsGearView kind="skate" poseRef={skate} /></Suspense>
      <Suspense fallback={null}><ZsGearView kind="glider" poseRef={glider} /></Suspense>
    </>
  );
}

/** O kit da Zona Sul pro boneco dos outros jogadores. */
export const ZS_REMOTE_KIT: RemoteZsKit = { clips: ZS_HERO_CLIPS, cut: ZS_HERO_CUT, actions: ZS_HERO_ACTIONS, Gear: ZsRemoteGear };
