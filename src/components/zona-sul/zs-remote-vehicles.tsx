/**
 * ZONA SUL — VEÍCULOS DOS OUTROS JOGADORES (01/11, Pedro online: "estou com 2 usuários no mesmo servidor, um no barco,
 * outro na praia — não vejo o barco nem nada, por quê?"). Antes só o BONECO ia pela rede (posição/altura/animação/item):
 * cada tela tinha o seu navio/carro local e o do outro não aparecia. Agora o navio e o carro de cada um vão de carona na
 * pose (`RemotePose.v`) e aqui são desenhados (o MESMO modelo do local, geometria compartilhada), com a pose suavizada.
 *  - Os dois ancorados/estacionados no MESMO lugar (cada um tem o seu, no mesmo ponto): desenha um só (sem piscar).
 *  - O CONVÉS do navio do outro vira chão (`remoteDecks`, o mesmo escaneamento do meu): dá pra subir no navio do
 *    amigo/inimigo (pirataria) — e o navio dele andando leva quem está em cima (o mundo aplica a cada tique).
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useNet } from '@/net/multiplayer';
import { buildWarshipModel, makeShipHpBar, SHIP_BAR_K, WARSHIP_URL, warshipDims, warshipPose, zsWarshipDeck } from './zs-warship-view';
import { buildCarModel, CAR_URL } from './zs-car-view';
import { CAR } from './zs-car';
import type { ShipCollider } from './zs-ship';
import { WARSHIP, type ZsWarship } from './zs-warship';

type Pose = { x: number; z: number; yaw: number };
/** Navio de OUTRO jogador agora: pose suavizada (e a do quadro anterior, pra levar junto quem está no convés) + o
 *  colisor do convés dele. `tick` = quadro em que foi atualizado. */
export type RemoteDeck = { id: string; c: ShipCollider; pose: Pose; prev: Pose; tick: number };
export const remoteDecks = new Map<string, RemoteDeck>();
/** CARRO de cada outro jogador, com a pose SUAVIZADA (a mesma do desenho) — a CARONA (02/11) senta nele. */
export type RemoteCar = { id: string; x: number; y: number; z: number; yaw: number; hp: number };
export const remoteCars = new Map<string, RemoteCar>();
export const remoteDeckTick = { n: 0 };

/** Suavização da pose (1/s) — a pose chega ~11×/s. */
const SMOOTH = 10;
/** Igual ao MEU (os dois ancorados/estacionados no mesmo ponto): desenha um só. */
export const SAME_SPOT_M = 2.5, SAME_SPOT_YAW = 0.15;

const angDiff = (a: number, b: number) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export function sameSpot(a: Pose | null, b: Pose): boolean {
  return !!a && Math.hypot(a.x - b.x, a.z - b.z) < SAME_SPOT_M && Math.abs(angDiff(a.yaw, b.yaw)) < SAME_SPOT_YAW;
}

type Slot = { kind: 's' | 'c'; obj: THREE.Group; pose: Pose; y: number; bar: ReturnType<typeof makeShipHpBar> | null; sinkT: number | null };

export function ZsRemoteVehicles({ myShip, myCar }: { myShip: React.MutableRefObject<ZsWarship | null>; myCar: React.MutableRefObject<Pose | null> }) {
  const ship = useGLTF(WARSHIP_URL).scene;
  const car = useGLTF(CAR_URL).scene;
  const root = useRef<THREE.Group>(null);
  const slots = useRef(new Map<string, Slot>());
  useEffect(() => () => { remoteDecks.clear(); remoteCars.clear(); }, []);

  useFrame((state, dtRaw) => {
    const g = root.current;
    if (!g) return;
    const dt = Math.min(0.05, dtRaw), t = state.clock.elapsedTime, k = 1 - Math.exp(-SMOOTH * dt);
    const players = useNet.getState().players;
    const live = new Set<string>();
    remoteDeckTick.n++;
    for (const id in players) {
      const vs = players[id]!.v;
      if (!vs) continue;
      for (const v of vs) {
        const key = `${id}:${v.k}`;
        live.add(key);
        let s = slots.current.get(key);
        if (!s) {
          const obj = v.k === 's' ? buildWarshipModel(ship).holder : buildCarModel(car).holder;
          const bar = v.k === 's' ? makeShipHpBar() : makeShipHpBar(3.2, 0.3);
          g.add(obj); if (bar) g.add(bar.group);
          s = { kind: v.k, obj, pose: { x: v.x, z: v.z, yaw: v.yaw }, y: v.y ?? 0, bar, sinkT: null };
          slots.current.set(key, s);
        }
        const far = Math.hypot(v.x - s.pose.x, v.z - s.pose.z) > 25; // teleporte/renasceu: pula direto
        const kk = far ? 1 : k;
        s.pose.x += (v.x - s.pose.x) * kk; s.pose.z += (v.z - s.pose.z) * kk;
        s.pose.yaw += angDiff(v.yaw, s.pose.yaw) * kk;
        s.y += ((v.y ?? s.y) - s.y) * kk;
        const mine = v.k === 's' ? myShip.current : myCar.current;
        const same = sameSpot(mine, s.pose);
        s.obj.visible = !same;
        if (v.k === 's') {
          // vida 0 = afundando (01/11): o mesmo afundar do meu, contado aqui
          const hp = v.h ?? WARSHIP.HP;
          s.sinkT = hp <= 0 ? (s.sinkT ?? 0) + dt : null;
          const ps = warshipPose({ x: s.pose.x, z: s.pose.z, roll: 0, sinkT: s.sinkT } as ZsWarship, t);
          s.obj.position.set(s.pose.x, ps.y0, s.pose.z);
          s.obj.rotation.set(ps.pitch, s.pose.yaw, ps.roll, 'YXZ');
          if (s.sinkT !== null && s.sinkT >= WARSHIP.SINK_S) s.obj.visible = false;
          if (s.bar) { s.bar.group.position.set(s.pose.x, ps.y0 + warshipDims.height * SHIP_BAR_K, s.pose.z); s.bar.set(hp / WARSHIP.HP, !same && s.sinkT === null, state.camera); }
          // convés do navio dele = chão (a não ser que esteja em cima do meu ou afundando)
          const base = zsWarshipDeck.scan; // o escaneamento (vale mesmo com o MEU navio afundado)
          if (!same && base && s.sinkT === null) {
            let d = remoteDecks.get(id);
            if (!d) { d = { id, c: { ...base }, pose: { ...s.pose }, prev: { ...s.pose }, tick: 0 }; remoteDecks.set(id, d); }
            d.prev = { ...d.pose }; d.pose = { ...s.pose }; d.tick = remoteDeckTick.n;
            d.c.cx = s.pose.x; d.c.cz = s.pose.z; d.c.cos = Math.cos(s.pose.yaw); d.c.sin = Math.sin(s.pose.yaw);
            d.c.y0 = ps.y0; d.c.tiltU = Math.sin(ps.roll); d.c.tiltV = -Math.sin(ps.pitch);
          } else remoteDecks.delete(id);
        } else {
          const bob = Math.sin(t * 2.1) * 0.035;
          s.obj.position.set(s.pose.x, s.y + bob, s.pose.z);
          s.obj.rotation.set(0, s.pose.yaw, 0);
          // vida do carro dele (01/11): barra igual à do herói quando ferido
          const ch = v.h ?? CAR.HP;
          if (s.bar) { s.bar.group.position.set(s.pose.x, s.y + 2.5, s.pose.z); s.bar.set(ch / CAR.HP, !same && ch > 0 && ch < CAR.HP, state.camera); }
          // CARONA (02/11): a pose suavizada fica disponível pra quem senta no carro dele
          const rc = remoteCars.get(id) ?? { id, x: 0, y: 0, z: 0, yaw: 0, hp: 0 };
          rc.x = s.pose.x; rc.y = s.y + bob; rc.z = s.pose.z; rc.yaw = s.pose.yaw; rc.hp = ch;
          remoteCars.set(id, rc);
        }
      }
    }
    // saiu da sala / parou de mandar: some
    for (const [key, s] of slots.current) if (!live.has(key)) { g.remove(s.obj); if (s.bar) g.remove(s.bar.group); slots.current.delete(key); }
    for (const id of [...remoteDecks.keys()]) if (!live.has(`${id}:s`)) remoteDecks.delete(id);
    for (const id of [...remoteCars.keys()]) if (!live.has(`${id}:c`)) remoteCars.delete(id);
  });

  return <group ref={root} />;
}
