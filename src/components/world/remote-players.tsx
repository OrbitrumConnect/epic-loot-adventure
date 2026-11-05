import { useFrame } from '@react-three/fiber';
import { useRef, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import * as THREE from 'three';
import { useNet, broadcastPlayerHit } from '@/net/multiplayer';
import { GlbHeroMixamo } from './glb-hero-mixamo';
import { heroSkinOf } from '@/game/data/hero-skins';
import type { HeroAction } from './glb-hero';
import { labelTexture, markPointerConsumed, palette, terrainHeight, HERO_HEIGHT } from './world-kit';
import { HeldItem, heldKindFor } from './held-weapon';
import { audioManager } from '@/game/audio/audio-manager';
import { glbSurfaceY } from './terrain-collision';
import { useGameStore } from '@/game/state/game-store';
import { hitRecently, markPvpHit, PVP_LOCK_BREAK, pvpStrike, pvpTarget, setPvpTarget } from './pvp-attack';
import { WORLD } from '@/game/data/world-profile';
import { layers } from '@/game/systems/layerSystem';

/** Mesma camada que eu (caverna × superfície, 31/10)? Pela altura que ele manda. Sem mundo embaixo: sempre. */
function sameLayerAsMe(p: { x: number; z: number; y?: number | undefined }): boolean {
  const u = WORLD.under;
  if (!u) return true;
  return (Number.isFinite(p.y) ? u.layer(p.x, p.y as number, p.z) : 0) === layers.player;
}

// 02/11 (PvP): agachado parado/andando/atirando e atirando no ar — os outros veem igual
const ACTIONS = new Set(['idle', 'walk', 'run', 'attack', 'jump', 'crouch', 'crouch_walk', 'crouch_attack', 'jump_shoot']);

/** KIT de um mundo com animações próprias (Zona Sul, 02/11 — Pedro online: "amigo nadando vejo ele em pé; não vejo o
 *  skate; na prancha em pé"): os clips extras do herói, os cortes, as ações aceitas pela rede e o desenho do equipamento
 *  dele (prancha/skate/asa). Sem kit (Vale): como sempre. */
export type RemoteZsKit = {
  clips: Record<string, string>;
  cut: NonNullable<React.ComponentProps<typeof GlbHeroMixamo>['customClipCut']>;
  actions: readonly string[];
  Gear: React.ComponentType<{ id: string; bodyRef: React.RefObject<THREE.Group | null> }>;
  /** Sentado num carro (ação "drive"): o banco do carro que EU vejo (sem o atraso da pose dele). null = solto. */
  seatSnap?: (x: number, y: number, z: number) => { x: number; y: number; z: number; yaw: number } | null;
};
const LABEL_RANGE = 12;
/** 05/11 (Pedro: "não vejo vida e nome do meu aliado — deveria ver normal como vejo inimigo"): o ALIADO mostra nome e
 *  vida de longe (até ALLY_LABEL_RANGE m), a plaquinha crescendo com a distância pra ler; o INIMIGO (PvP) como o bicho
 *  inimigo: perto (12 m) ou ferido. Nada através da rocha. */
export const ALLY_LABEL_RANGE = 120;
/** escala da plaquinha pela distância (1 até ~14 m, cresce até 6×) — pura */
export const allyLabelScale = (dist: number) => Math.min(6, Math.max(1, dist / 14));
const REMOTE_SOUND_RANGE = 35; // m: além disso o ataque do outro é mudo
const noRaycast = () => {};

/** Um jogador remoto: lê a pose do net (via getState, sem re-render) e interpola
 *  posição/giro suave. Usa o mesmo herói (Survivor Red) que o jogador local. */
function RemotePlayer({ id, zs }: { id: string; zs?: RemoteZsKit | undefined }) {
  const group = useRef<THREE.Group>(null);
  const action = useRef<HeroAction>('idle');
  // SKIN de quem joga (03/11): vem na pose; ausente = homem (cliente antigo também)
  const skin = heroSkinOf(useNet((s) => s.players[id]?.sk));
  /** ações aceitas (com o kit do mundo) e a velocidade dele (ritmo da remada/nado, como no meu herói) */
  const allowed = useMemo(() => (zs ? new Set([...ACTIONS, ...zs.actions]) : ACTIONS), [zs]);
  const speed = useRef(0);
  const inited = useRef(false);
  const labelGroup = useRef<THREE.Group>(null);
  const hpFill = useRef<THREE.Mesh>(null);
  const enemyRing = useRef<THREE.Mesh>(null); // anel vermelho sob INIMIGOS (PvP, atualiza ao vivo)
  const prevHp = useRef<number | null>(null);
  const lastAction = useRef<string>('idle');
  const initial = useNet.getState().players[id];
  const title = `${initial?.name ?? 'Viajante'} · Nv. ${initial?.level ?? 1}`;
  const texture = useMemo(() => labelTexture(title, '#fff3c4'), [title]);
  useFrame((state, delta) => {
    const g = group.current;
    const p = useNet.getState().players[id];
    if (!g || !p) return;
    action.current = (allowed.has(p.action) ? p.action : 'idle') as HeroAction;
    // SOM do ataque dele (online): quando a ação vira 'attack', toca o som da arma que ele tem na
    // mão, mais baixo quanto mais longe (some a partir de ~35 m).
    const atk = (a: string) => a === 'attack' || a === 'crouch_attack' || a === 'jump_shoot';
    if (atk(p.action) && !atk(lastAction.current)) {
      const me = useGameStore.getState().player.position;
      const gain = 1 - Math.hypot(me.x - p.x, me.z - p.z) / REMOTE_SOUND_RANGE;
      const kind = heldKindFor(p.w ?? null);
      audioManager.playRemote(kind === 'bow' ? 'bow' : kind === 'pistol' || kind === 'rifle' ? 'gun' : 'melee', gain);
    }
    lastAction.current = p.action;
    // Pés: usa a altura REAL que o outro jogador mandou (ponte/casa/pulo/morro) — antes
    // recalculava só pelo terreno e o amigo aparecia com os pés enterrados. Sem `y` (cliente
    // antigo) cai no cálculo pelo chão.
    const groundAt = (x: number, z: number) => glbSurfaceY(x, z, terrainHeight(x, z));
    const targetY = (q: typeof p) => (Number.isFinite(q.y) ? (q.y as number) : groundAt(q.x, q.z));
    if (!inited.current) { g.position.set(p.x, targetY(p), p.z); g.rotation.y = p.yaw; inited.current = true; }
    const dt = Math.min(delta, 0.1);
    const t = 1 - Math.exp(-15 * dt);
    const px0 = g.position.x, pz0 = g.position.z;
    g.position.x += (p.x - g.position.x) * t;
    g.position.z += (p.z - g.position.z) * t;
    if (dt > 0) speed.current += (Math.hypot(g.position.x - px0, g.position.z - pz0) / dt - speed.current) * Math.min(1, dt * 6);
    g.position.y = Number.isFinite(p.y)
      ? g.position.y + ((p.y as number) - g.position.y) * t
      : groundAt(g.position.x, g.position.z);
    let dy = p.yaw - g.rotation.y;
    while (dy > Math.PI) dy -= Math.PI * 2;
    while (dy < -Math.PI) dy += Math.PI * 2;
    g.rotation.y += dy * t;
    // SENTADO num carro (carona/motorista, 02/11): no banco do carro que eu vejo, sem atraso
    if (zs?.seatSnap && p.action === 'drive') {
      const s = zs.seatSnap(p.x, Number.isFinite(p.y) ? (p.y as number) : g.position.y, p.z);
      if (s) { g.position.set(s.x, s.y, s.z); g.rotation.y = s.yaw; }
    }
    const player = useGameStore.getState().player.position;
    const dist = Math.hypot(player.x - g.position.x, player.z - g.position.z);
    const sameL = sameLayerAsMe(p); // nada através da rocha: nem plaquinha nem PvP
    const enemy = p.side === 'enemy';
    if (labelGroup.current) {
      const hurt = p.hp < p.maxHp;
      labelGroup.current.visible = sameL && (enemy ? dist <= LABEL_RANGE || hurt : dist <= ALLY_LABEL_RANGE);
      labelGroup.current.quaternion.copy(state.camera.quaternion);
      labelGroup.current.scale.setScalar(enemy ? 1 : allyLabelScale(dist));
    }
    if (hpFill.current) {
      const ratio = Math.max(0, Math.min(1, p.hp / Math.max(1, p.maxHp)));
      hpFill.current.scale.x = ratio;
      hpFill.current.position.x = -0.45 + ratio * 0.45;
      // Barra vermelha pra inimigo, verde pra aliado (atualiza ao vivo quando ele escolhe).
      (hpFill.current.material as THREE.MeshBasicMaterial).color.set(enemy ? '#ef4444' : '#55c979');
    }
    if (enemyRing.current) enemyRing.current.visible = enemy;

    // Vida dele caiu (golpe de qualquer um) → número de dano em cima dele, pra todos verem.
    const store = useGameStore.getState();
    const prev = prevHp.current;
    prevHp.current = p.hp;
    if (prev !== null && p.hp < prev) {
      store.reportDamage(`remote-${id}`, prev - p.hp, { x: g.position.x, z: g.position.z }, false);
      if (p.hp <= 0 && prev > 0 && hitRecently(id)) {
        store.setMessage(`💀 Você derrotou ${p.name}!`);
        if (pvpTarget() === id) setPvpTarget(null);
      }
    }

    // Alvo TRAVADO: segue golpeando no ritmo da arma (sem precisar ficar clicando).
    if (pvpTarget() === id) {
      const hostile = enemy || useNet.getState().selfSide === 'enemy';
      if (!hostile || store.player.dead || p.hp <= 0 || dist > PVP_LOCK_BREAK || !sameL) setPvpTarget(null);
      else if (pvpStrike(p.name, g.position.x, g.position.z, 0.6, (raw) => broadcastPlayerHit(id, raw), true)) markPvpHit(id);
    }
  });
  return (
    <>
    {zs && <zs.Gear id={id} bodyRef={group} />}
    <group ref={group} onPointerDown={(event) => {
      if (event.button !== 0) return;
      // Mouse travado (3ª pessoa): o clique é da mira central (`aimFire`), não do cursor parado.
      if (document.pointerLockElement) return;
      event.stopPropagation();
      markPointerConsumed(event.nativeEvent);
      const p = useNet.getState().players[id];
      if (!p) return;
      const store = useGameStore.getState();
      const me = store.player;
      const hostile = p.side === 'enemy' || useNet.getState().selfSide === 'enemy';
      const g = group.current;
      // Aliado (ou eu morto): só mostra a ficha. Inimigo: PvP — golpe se estiver no alcance.
      if (!hostile || me.dead || !g || !sameLayerAsMe(p)) {
        store.setMessage(`${p.name} · Nv. ${p.level} · ${Math.round(p.hp)}/${Math.round(p.maxHp)} PV.`);
        return;
      }
      // Cadência + alcance + munição da arma; o ALVO aplica o PvP justo (fração + armadura + teto).
      // O clique TRAVA o alvo: o useFrame continua golpeando enquanto ele estiver no alcance.
      setPvpTarget(id);
      if (pvpStrike(p.name, g.position.x, g.position.z, 0.6, (raw) => broadcastPlayerHit(id, raw))) {
        markPvpHit(id);
        store.setMessage(`⚔️ Atacando ${p.name}!`);
      }
    }}>
      {zs ? (
        <GlbHeroMixamo key={skin.id} charUrl={skin.url} bindFix={skin.bindFix} handFix={skin.handFix} tone={skin.tone} actionRef={action} autoHeight={HERO_HEIGHT * 1.04} rangedAttack speedRef={speed} customClips={zs.clips} customClipCut={zs.cut}
          heldItemOf={() => useNet.getState().players[id]?.w ?? null}
          hpOf={() => useNet.getState().players[id]?.hp ?? 0}
          weapon={<RemoteHeld id={id} />} />
      ) : (
        <GlbHeroMixamo key={skin.id} charUrl={skin.url} bindFix={skin.bindFix} handFix={skin.handFix} tone={skin.tone} actionRef={action} autoHeight={HERO_HEIGHT * 1.04} rangedAttack
          heldItemOf={() => useNet.getState().players[id]?.w ?? null}
          hpOf={() => useNet.getState().players[id]?.hp ?? 0}
          weapon={<RemoteHeld id={id} />} />
      )}
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
    </>
  );
}

/** Arma na mão do jogador remoto: re-renderiza só quando ELE troca de item. */
function RemoteHeld({ id }: { id: string }) {
  const itemId = useNet((s) => s.players[id]?.w ?? null);
  const c = useMemo(() => palette(), []);
  return <HeldItem c={c} itemId={itemId} />;
}

/** Renderiza todos os jogadores remotos. Re-renderiza só quando a LISTA muda
 *  (entrar/sair) — as poses atualizam no useFrame, sem custo de re-render. */
export function RemotePlayers({ zs }: { zs?: RemoteZsKit } = {}) {
  const ids = useNet(useShallow((s) => Object.keys(s.players)));
  if (ids.length === 0) return null;
  return <>{ids.map((id) => <RemotePlayer key={id} id={id} zs={zs} />)}</>;
}
