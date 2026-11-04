/**
 * ESQUADRA PIRATA — o desenho e o relógio (03/11, ver `zs-enemy-fleet`). Os navios são o MESMO galeão do herói (mesmo
 * GLB e geometria) a 65% e mais escuros. Em cada um: o CAPITÃO no timão (sem ele o navio fica à deriva) e 8 PIRATAS DE
 * FUZIL no convés — todos alvos de verdade (mira, dano, XP, dano em área do canhão). Os corpos só DESENHAM a até
 * CREW_DRAW_M (FPS); longe, seguem valendo.
 * PATRULHA o mar o tempo todo (visível) e CAÇA quem está A BORDO de um navio por perto.
 * ONLINE (03/11, Pedro: "o mesmo navio e inimigos no multiplayer — todos veem normal"): quem SIMULA é o anfitrião (ou o
 * jogo solo) — ele manda os navios pra sala (`fleet`, ~5×/s) com os rastros dos tiros; capitão/tripulação vão na foto do
 * mundo (bichos). O CONVIDADO desenha os mesmos navios (suave entre os pacotes) e o tiro dele num navio pirata vai pro
 * anfitrião (`fleet-hit`); o loot vai pra quem afundou (`fleet-reward`).
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { creatureAnchors, creatureLure, hurtPlayerBy } from '@/components/world/hostile-ai';
import { RifleModel } from '@/components/world/weapon-models';
import { MIXAMO_RAIDER, mixClipProps } from '@/components/world/raider';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import {
  broadcastCannon, broadcastFleet, broadcastMobHit, broadcastPirateShipHit, isGuestInRoom, netFleet, registerFleetHitHandler, registerFleetRewardHandler, useNet,
  type NetFleetBoarder, type NetFleetShip, type NetFleetShot,
} from '@/net/multiplayer';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { pushEvent, shotEvent } from '@/game/systems/feedbackSystem';
import { useZsTouch } from './zs-context';
import { buildWarshipModel, GUNWALE_K, HELM_DECK_K, HELM_U, makeShipHpBar, WARSHIP_DRAFT, WARSHIP_URL, warshipFx, warshipHalfBeam, warshipPose, zsWarshipDeck } from './zs-warship-view';
import { ballLanding, damageWarship, nearWarshipHull, WARSHIP, warshipGone, warshipLocal, warshipStep, warshipWorld, type ZsWarship } from './zs-warship';
import {
  crewHitChance, crewSpot, FLEET, FLEET_LEN, fleetFire, fleetFormation, fleetHelm, fleetLostTarget, fleetMaySpawn, fleetPatrolSteer,
  fleetPickTarget, fleetSeaPoint, fleetSteer, fleetVerdict, isFleetUnit, leadAim, newEnemyShip, newFleetCrew, newFleetPilot, zsFleet,
  BOARD, boarderStep, FLEET_KRAKEN_PREFIX, FLEET_SHARK_PREFIX, hullRing, hullRingLen, newBoarder, sharkDropSpots, type Boarder, type EnemyShip,
} from './zs-enemy-fleet';
import { fleetShipHit, grantFleetLoot } from './zs-enemy-fleet-hits';
import { type ZsTerrain, zsHeightAt, zsSeaBounds, zsWaterYAt } from './zs-terrain-data';
import { zsNavigable, zsSwimmable } from './zs-world-profile';

type CreatureStateLite = import('@/game/types').CreatureState;
/** Desenha os corpos (capitão + tripulação) com você a até isto (m) do navio. */
export const CREW_DRAW_M = 160;
/** Corpo do pirata morto fica no convés este tempo (cai de costas) e some — igual aos bichos em terra. */
export const FLEET_CORPSE_MS = 3000;
/** Ação de cada um da esquadra (o tiro vira 'attack' por um instante). */
const unitAction = new Map<string, { a: HeroAction; until: number }>();

/** Tinge o galeão pra esquadra (mais escuro, puxado pro vermelho-queimado) — materiais PRÓPRIOS (o do herói não muda). */
function tintFleet(holder: THREE.Object3D): void {
  const done = new Map<THREE.Material, THREE.Material>();
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const one = (mat: THREE.Material) => {
      let t = done.get(mat);
      if (!t) { t = mat.clone(); const sm = t as THREE.MeshStandardMaterial; sm.color?.multiply(new THREE.Color(0.55, 0.42, 0.4)); done.set(mat, t); }
      return t;
    };
    m.material = Array.isArray(m.material) ? m.material.map(one) : one(m.material);
  });
}
/** altura do convés principal (acima da quilha) do navio menor */
const deckY = (h: number) => (zsWarshipDeck.main > 0 ? zsWarshipDeck.main : h * 0.2) * FLEET.SCALE;

/** Um da esquadra no navio: o boneco (pirata) e a ação dele (parado / atirando / morto). */
function FleetUnit({ id, gun }: { id: string; gun: boolean }) {
  const action = useRef<HeroAction>('idle');
  const g = useRef<THREE.Group>(null), deadAt = useRef<number | null>(null);
  useFrame(() => {
    const cr = useGameStore.getState().creatures.find((c) => c.id === id), u = unitAction.get(id);
    const dead = !cr || cr.behavior === 'dead';
    action.current = dead ? 'death' : u && u.until > performance.now() ? u.a : 'idle';
    // (04/11, Pedro: "no outro barco ficou deitado") morto cai de costas e o corpo SAI do convés depois de CORPSE_MS
    if (dead) deadAt.current ??= performance.now(); else deadAt.current = null;
    if (g.current) g.current.visible = deadAt.current === null || performance.now() - deadAt.current < FLEET_CORPSE_MS;
  });
  return (
    <group ref={g}>
      <Suspense fallback={null}>
        {/* 04/11: o mesmo Saqueador do mapa (1,85 m — o herói menos ~10 cm) */}
        <GlbHeroMixamo charUrl="/models/raiders/pirate.glb" actionRef={action} autoHeight={MIXAMO_RAIDER['raider_scout']!.height} standFixX={Math.PI / 2} bindFix deathClip="back"
          forceGun={gun} weapon={gun ? <Suspense fallback={null}><RifleModel /></Suspense> : undefined} />
      </Suspense>
    </group>
  );
}

function EnemyShipBody({ ship, model, h, heroRef }: { ship: EnemyShip; model: THREE.Group; h: number; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const g = useRef<THREE.Group>(null);
  const [near, setNear] = useState(false);
  const bar = useMemo(() => makeShipHpBar(7, 0.55), []);
  const pbar = useMemo(() => makeShipHpBar(1.4, 0.16), []);
  const helmY = h * HELM_DECK_K * FLEET.SCALE, dY = deckY(h);
  const units = useMemo(() => [ship.pilotId, ...ship.crewIds], [ship]);
  useEffect(() => () => { for (const id of units) { creatureAnchors.delete(id); unitAction.delete(id); } }, [units]);
  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const t = state.clock.elapsedTime, ps = warshipPose(ship, t);
    const y0 = ps.y0 + WARSHIP_DRAFT * (1 - FLEET.SCALE); // calado do navio menor
    grp.position.set(ship.x, y0, ship.z);
    grp.rotation.set(ps.pitch, ship.yaw, ps.roll, 'YXZ');
    grp.visible = !warshipGone(ship);
    bar.group.position.set(ship.x, y0 + h * 0.82 * FLEET.SCALE, ship.z);
    bar.set(ship.hp / FLEET.HP, ship.sinkT === null && ship.hp < FLEET.HP, state.camera);
    const hero = heroRef.current, isNear = Math.hypot(hero.x - ship.x, hero.z - ship.z) < CREW_DRAW_M;
    if (isNear !== near) setNear(isNear);
    // âncoras da mira (mundo): capitão no timão, tripulação no convés — vivos enquanto o navio está inteiro
    const crs = useGameStore.getState().creatures, intact = ship.sinkT === null;
    const helm = fleetHelm(ship, HELM_U), cap = crs.find((c) => c.id === ship.pilotId);
    creatureAnchors.set(ship.pilotId, { x: helm.x, y: y0 + helmY, z: helm.z, top: 1.9, alive: !!cap && cap.behavior !== 'dead' && intact, r: 0.5 });
    ship.crewIds.forEach((id, i) => {
      const sp = crewSpot(i), w = warshipWorld(ship, sp.u, sp.v), cr = crs.find((c) => c.id === id);
      creatureAnchors.set(id, { x: w.x, y: y0 + dY, z: w.z, top: 1.9, alive: !!cr && cr.behavior !== 'dead' && intact, r: 0.5 });
    });
    pbar.group.position.set(helm.x, y0 + helmY + 2.3, helm.z);
    pbar.set(cap ? cap.hp / cap.maxHp : 0, !!cap && cap.behavior !== 'dead' && intact && cap.hp < cap.maxHp, state.camera);
  });
  return (
    <>
      <group ref={g}>
        <primitive object={model} />
        {near && <>
          {/* o CAPITÃO no timão — vira pra proa; cai quando morre */}
          <group position={[0, helmY, HELM_U * FLEET_LEN]}><FleetUnit id={ship.pilotId} gun={false} /></group>
          {/* a TRIPULAÇÃO de fuzil no convés, olhando pra fora (pro mar) */}
          {ship.crewIds.map((id, i) => { const sp = crewSpot(i); return (
            <group key={id} position={[sp.u, dY, sp.v]} rotation={[0, sp.u > 0 ? Math.PI / 2 : -Math.PI / 2, 0]}><FleetUnit id={id} gun /></group>
          ); })}
        </>}
      </group>
      <primitive object={bar.group} />
      <primitive object={pbar.group} />
    </>
  );
}

type Target = { id: string; x: number; z: number; yaw: number; speed: number };
/** meu id (sozinho = 'eu') */
const meId = () => useNet.getState().selfId || 'eu';
/** O navio do jogador `owner` agora: o meu (shipRef) ou o de alguém da sala (pose dele). null = não tem / afundou. */
function shipOf(owner: string, my: ZsWarship | null): { x: number; z: number; yaw: number } | null {
  if (owner === meId()) return my && my.sinkT === null && !warshipGone(my) ? my : null;
  const v = (useNet.getState().players[owner]?.v ?? []).find((q) => q.k === 's' && (q.h ?? 1) > 0);
  return v ?? null;
}
const BOARDER_ACT: Record<Boarder['act'], NetFleetBoarder['a']> = { climb: 0, walk: 1, attack: 2, idle: 3 };
const BOARDER_ACT_BACK: Boarder['act'][] = ['climb', 'walk', 'attack', 'idle'];

/** O KRAKEN DE ABORDAGEM no convés do navio do dono (etapa 2) — anda com o navio em todas as telas (u/v do navio). */
export function BoarderBody({ b, shipRef, heroRef }: { b: Boarder; shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const g = useRef<THREE.Group>(null);
  const action = useRef<HeroAction>('idle');
  const mx = MIXAMO_RAIDER['raider_kraken']!;
  useEffect(() => () => { creatureAnchors.delete(b.id); }, [b.id]);
  useFrame((state) => {
    const grp = g.current;
    if (!grp) return;
    const sh = shipOf(b.owner, shipRef.current);
    grp.visible = !!sh;
    if (!sh) return;
    const ps = warshipPose({ x: sh.x, z: sh.z, roll: 0 }, state.clock.elapsedTime);
    const deck = ps.y0 + (zsWarshipDeck.main > 0 ? zsWarshipDeck.main : 4.2), hb = warshipHalfBeam();
    const climbing = b.climb < 1, u = climbing ? b.side * (hb + (1 - b.climb) * 1.5) : b.u, y = deck - (climbing ? (1 - b.climb) * 3.2 : 0);
    const w = warshipWorld(sh, u, b.v);
    grp.position.set(w.x, y, w.z);
    // olha pra quem está no convés (eu ou o dono, na sala); subindo, pra dentro do navio
    const me = b.owner === meId(), r = me ? null : useNet.getState().players[b.owner];
    const tx = me ? heroRef.current.x : r?.x ?? sh.x, tz = me ? heroRef.current.z : r?.z ?? sh.z;
    grp.rotation.y = climbing ? Math.atan2(-b.side * Math.cos(sh.yaw), b.side * Math.sin(sh.yaw)) : Math.atan2(tx - w.x, tz - w.z);
    const cr = useGameStore.getState().creatures.find((c) => c.id === b.id);
    action.current = !cr || cr.behavior === 'dead' ? 'death' : b.act === 'attack' ? 'attack' : b.act === 'walk' || climbing ? 'walk' : 'idle';
    creatureAnchors.set(b.id, { x: w.x, y, z: w.z, top: BOARD.KRAKEN_H, alive: !!cr && cr.behavior !== 'dead' && !climbing, r: 0.9 });
  });
  return (
    <group ref={g}>
      <Suspense fallback={null}>
        <GlbHeroMixamo charUrl={mx.url} actionRef={action} autoHeight={BOARD.KRAKEN_H} standFixX={mx.standFixX} bindFix deathClip={mx.death ?? 'back'} {...mixClipProps(mx.clips)} />
      </Suspense>
    </group>
  );
}

export function ZsEnemyFleetView({ shipRef, heroRef, terrain }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3>; terrain: ZsTerrain }) {
  const { scene } = useGLTF(WARSHIP_URL);
  const [roster, setRoster] = useState<string>('');
  const models = useRef(new Map<string, { holder: THREE.Group; h: number }>());
  const posAcc = useRef(0), netAcc = useRef(0);
  const crewReload = useRef(new Map<string, number>());
  const shotsOut = useRef<NetFleetShot[]>([]);
  const biteReload = useRef(new Map<string, number>()), lastBiteMsg = useRef(0), boarderDeadAt = useRef<number | null>(null), boarderWasOut = useRef(false);
  const sharkSwim = useMemo(() => (x: number, z: number) => zsSwimmable(terrain, x, z), [terrain]);
  /** a horda de tubarões da caçada sai do mar (perdeu o alvo / esquadra derrotada) */
  const dropSharks = () => {
    const ids = new Set(zsFleet.sharkIds);
    zsFleet.sharkIds = []; biteReload.current.clear();
    for (const id of ids) creatureLure.delete(id);
    if (ids.size) useGameStore.setState((st) => ({ creatures: st.creatures.filter((c) => !ids.has(c.id)) }));
  };
  const swim = useMemo(() => (x: number, z: number) => zsNavigable(terrain, x, z, WARSHIP.MIN_DEPTH * FLEET.SCALE), [terrain]);
  const surfaceAt = useMemo(() => (x: number, z: number) => Math.max(zsHeightAt(terrain, x, z), zsWaterYAt(x, z)), [terrain]);
  const seaBounds = useMemo(() => zsSeaBounds(terrain), [terrain]);
  const modelFor = (id: string) => {
    let m = models.current.get(id);
    if (!m) {
      const b = buildWarshipModel(scene);
      tintFleet(b.holder);
      const wrap = new THREE.Group(); wrap.scale.setScalar(FLEET.SCALE); wrap.add(b.holder);
      m = { holder: wrap, h: b.h };
      models.current.set(id, m);
    }
    return m;
  };
  // ONLINE: anfitrião recebe o tiro do convidado num navio pirata; convidado recebe o loot de quem afundou
  useEffect(() => {
    registerFleetHitHandler((hit) => { const s = zsFleet.ships.find((x) => x.id === hit.shipId); if (s && !isGuestInRoom()) fleetShipHit(s, hit.damage, hit.id); });
    registerFleetRewardHandler(() => grantFleetLoot(-1));
    return () => { registerFleetHitHandler(null); registerFleetRewardHandler(null); };
  }, []);
  /** rastro de tiro (de/até em coordenadas do mundo) — o rastro mede "chão + altura": a altura vai relativa ao FUNDO */
  const tracer = (f: [number, number, number], to: [number, number, number]) => {
    useGameStore.setState((st) => ({ feedback: pushEvent(st.feedback, shotEvent({ x: f[0], z: f[2] }, { x: to[0], z: to[2] }, 'bullet', f[1] - zsHeightAt(terrain, f[0], f[2]), to[1]), Date.now()) }));
  };

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1), now = Date.now(), F = zsFleet, hero = heroRef.current;
    // ═══ CONVIDADO: desenha os navios do anfitrião ═══
    if (isGuestInRoom()) {
      const stale = performance.now() - netFleet.at > 3000;
      const incoming: NetFleetShip[] = stale ? [] : netFleet.ships;
      const byId = new Map(F.ships.map((s) => [s.id, s]));
      const next: EnemyShip[] = [];
      for (const n of incoming) {
        let s = byId.get(n.i);
        if (!s) s = newEnemyShip(n.i, { x: n.x, z: n.z, yaw: n.yaw });
        const k = Math.min(1, dt * 6); // suave entre os pacotes (~5×/s)
        let dy = n.yaw - s.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
        s.x += (n.x - s.x) * k; s.z += (n.z - s.z) * k; s.yaw += dy * k; s.roll = n.r; s.hp = n.h; s.pilotDead = n.pd === 1;
        s.sinkT = n.sk === null ? null : Math.max(s.sinkT ?? 0, n.sk);
        next.push(s);
      }
      F.ships = next;
      const nk = stale ? null : netFleet.k;
      if (!nk) F.boarder = null;
      else {
        const b = F.boarder && F.boarder.id === nk.i ? F.boarder : { id: nk.i, owner: nk.o, u: nk.u, v: nk.v, climb: nk.c, atkT: 0, side: (nk.u >= 0 ? 1 : -1) as 1 | -1, act: 'climb' as Boarder['act'] };
        const k = Math.min(1, dt * 6);
        b.u += (nk.u - b.u) * k; b.v += (nk.v - b.v) * k; b.climb = nk.c; b.act = BOARDER_ACT_BACK[nk.a] ?? 'idle';
        F.boarder = b;
      }
      while (netFleet.shots.length) { const sh = netFleet.shots.shift()!; tracer([sh[0], sh[1], sh[2]], [sh[3], sh[4], sh[5]]); audioManager.playWorld('gun', distanceGain(Math.hypot(sh[0] - hero.x, sh[2] - hero.z))); }
      const r = next.map((s) => s.id).join('|') + (F.boarder ? '|k:' + F.boarder.id : '');
      if (r !== roster) setRoster(r);
      return;
    }
    // ═══ SOLO / ANFITRIÃO: simula ═══
    const my = shipRef.current, net = useNet.getState(), selfId = net.selfId || 'eu';
    const sailing = useZsTouch.getState().sailing;
    // quem está A BORDO de um navio (o meu: no timão ou em pé no convés; os da sala: o corpo dentro do casco do navio dele)
    const cands: Target[] = [];
    if (my && my.sinkT === null && !warshipGone(my) && (sailing || (nearWarshipHull(my, hero.x, hero.z, FLEET_LEN * 0.12 / FLEET.SCALE, 0.5) && hero.y > zsWaterYAt(hero.x, hero.z) + 1))) {
      cands.push({ id: selfId, x: my.x, z: my.z, yaw: my.yaw, speed: my.speed });
    }
    if (net.connected) for (const r of Object.values(net.players)) {
      const v = (r.v ?? []).find((q) => q.k === 's' && (q.h ?? 1) > 0);
      if (v && r.hp > 0 && nearWarshipHull(v, r.x, r.z, WARSHIP.LENGTH * 0.12, 0.5)) cands.push({ id: r.id, x: v.x, z: v.z, yaw: v.yaw, speed: v.s ?? 0 });
    }
    // ── CHEGAM (patrulhando, longe de todo mundo) ──
    if (F.ships.length === 0 && fleetMaySpawn({ now, nextAt: F.nextAt, present: false })) {
      F.nextAt = now + 15_000; // sem mar agora: tenta de novo daqui a pouco
      const people = [{ x: hero.x, z: hero.z }, ...(net.connected ? Object.values(net.players).map((r) => ({ x: r.x, z: r.z })) : [])];
      const c = fleetSeaPoint(swim, seaBounds, Math.random, people, FLEET.SPAWN_AWAY);
      if (c) {
        const n = FLEET.MIN + Math.floor(Math.random() * (FLEET.MAX - FLEET.MIN + 1));
        const spots = fleetFormation(swim, c, Math.random() * Math.PI * 2, n);
        if (spots.length >= FLEET.MIN) {
          const def = CREATURES['raider_scout']!;
          F.ships = spots.map((sp) => newEnemyShip(`f${++F.seq}`, sp));
          F.targetId = null; F.lostSince = null;
          const units = F.ships.flatMap((sh) => [newFleetPilot(sh, def), ...sh.crewIds.map((_, i) => newFleetCrew(sh, i, def))]);
          useGameStore.setState((s) => ({ creatures: [...s.creatures, ...units] }));
          setRoster(F.ships.map((s) => s.id).join('|'));
        }
      }
    }
    /** capitães, tripulação e o Kraken: a posição na store acompanha o navio (alcance do tiro, dano em área, rede) ~3×/s;
     *  a SALA vê os mesmos navios (~5×/s), os rastros dos tiros e o Kraken no convés */
    const syncOut = () => {
      posAcc.current += dt;
      if (posAcc.current > 0.33) {
        posAcc.current = 0;
        const at = new Map<string, { x: number; z: number }>();
        for (const s of F.ships) { at.set(s.pilotId, fleetHelm(s, HELM_U)); s.crewIds.forEach((id, i) => { const sp = crewSpot(i); at.set(id, warshipWorld(s, sp.u, sp.v)); }); }
        if (F.boarder) { const sh = shipOf(F.boarder.owner, my); if (sh) at.set(F.boarder.id, warshipWorld(sh, F.boarder.u, F.boarder.v)); }
        if (at.size) useGameStore.setState((st) => ({ creatures: st.creatures.map((c) => { const p = isFleetUnit(c.id) ? at.get(c.id) : undefined; return p ? { ...c, position: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 } } : c; }) }));
      }
      netAcc.current += dt;
      if (net.connected && netAcc.current > 0.2) {
        netAcc.current = 0;
        const r1 = (v: number) => Math.round(v * 10) / 10, r3 = (v: number) => Math.round(v * 1000) / 1000;
        const b = F.boarder;
        broadcastFleet(F.ships.map((s) => ({ i: s.id, x: r1(s.x), z: r1(s.z), yaw: r3(s.yaw), r: r3(s.roll), h: Math.round(s.hp), sk: s.sinkT === null ? null : r1(s.sinkT), pd: s.pilotDead ? 1 : 0 })), shotsOut.current.splice(0),
          b ? { i: b.id, o: b.owner, u: r1(b.u), v: r1(b.v), c: Math.round(b.climb * 100) / 100, a: BOARDER_ACT[b.act] } : null);
      } else if (!net.connected) shotsOut.current.length = 0;
    };
    // ── o KRAKEN no convés (etapa 2): sobe, anda até quem está no convés e bate ──
    if (F.boarder) {
      const b = F.boarder, sh = shipOf(b.owner, my), crK = useGameStore.getState().creatures.find((c) => c.id === b.id);
      const drop = () => { const id = b.id; F.boarder = null; creatureAnchors.delete(id); useGameStore.setState((st) => ({ creatures: st.creatures.filter((c) => c.id !== id) })); setRoster((r0) => r0.replace('|k:' + id, '')); };
      if (!sh || !crK) drop();
      else if (crK.behavior === 'dead') { boarderDeadAt.current ??= now; if (now - boarderDeadAt.current > 4000) { boarderDeadAt.current = null; drop(); } }
      else {
        const hb = warshipHalfBeam(), meOwner = b.owner === meId();
        const pos = meOwner ? { x: hero.x, z: hero.z, y: hero.y } : (() => { const r = net.players[b.owner]; return r && r.hp > 0 ? { x: r.x, z: r.z, y: Number.isFinite(r.y) ? (r.y as number) : 99 } : null; })();
        const onDeck = !!pos && nearWarshipHull(sh, pos.x, pos.z, hb, 0.3) && pos.y > zsWaterYAt(pos.x, pos.z) + 1;
        if (boarderStep(b, onDeck ? warshipLocal(sh, pos!.x, pos!.z) : null, dt, hb, WARSHIP.LENGTH)) {
          const w = warshipWorld(sh, b.u, b.v), atk = Math.round((CREATURES['raider_kraken']?.attackPower ?? 70) * BOARD.KRAKEN_ATK_K);
          if (meOwner) hurtPlayerBy('Kraken da abordagem', atk, w, (dmg, hp, max) => `🐙 Pancada do Kraken! -${dmg} HP (${hp}/${max})`);
          else broadcastMobHit(b.owner, atk, 'Kraken da abordagem');
        }
      }
    }
    if (F.ships.length === 0) {
      if (F.boarder || boarderWasOut.current) { syncOut(); boarderWasOut.current = !!F.boarder; } // a esquadra afundou e o Kraken segue no convés
      return;
    }
    // ── ALVO: quem está a bordo por perto; perdeu (fugiu/desembarcou) por LOST_MS = volta a patrulhar ──
    let target = F.targetId ? cands.find((c) => c.id === F.targetId) ?? null : null;
    if (F.targetId && (!target || fleetLostTarget(F.ships, target))) {
      F.lostSince ??= now;
      if (now - F.lostSince >= FLEET.LOST_MS) { F.targetId = null; F.lostSince = null; target = null; F.boarded = false; dropSharks(); for (const s of F.ships) s.sharksOut = false; if (cands.some((c) => c.id === selfId)) useGameStore.getState().setMessage('🏴‍☠️ Você despistou a esquadra pirata — ela voltou a patrulhar.'); }
    } else F.lostSince = null;
    if (!F.targetId) {
      const pick = fleetPickTarget(F.ships, cands);
      if (pick) {
        F.targetId = pick; target = cands.find((c) => c.id === pick) ?? null;
        if (pick === selfId) useGameStore.getState().setMessage(`🏴‍☠️ A esquadra pirata te viu! (${F.ships.filter((s) => s.sinkT === null).length} navios, ${FLEET.CREW} atiradores em cada) — mate o capitão no timão e o navio fica à deriva.`);
      }
    }
    if (target) F.huntSince ??= now; else F.huntSince = null;
    const crs = useGameStore.getState().creatures; // a lista DE AGORA (podem ter acabado de entrar)
    const tShip = target ? shipOf(target.id, my) : null, hbFull = warshipHalfBeam();
    // ── TUBARÕES (etapa 2): pirata perto solta a horda em volta do navio caçado; colados no casco, mordem o navio ──
    if (target && tShip) {
      const fresh: CreatureStateLite[] = [];
      for (const s of F.ships) {
        if (s.sharksOut || s.sinkT !== null || F.sharkIds.length + fresh.length >= BOARD.SHARKS_MAX || Math.hypot(s.x - tShip.x, s.z - tShip.z) > BOARD.SHARK_NEAR) continue;
        s.sharksOut = true;
        const def = CREATURES['shark'];
        if (!def) continue;
        for (const sp of sharkDropSpots(sharkSwim, tShip, Math.min(BOARD.SHARKS_PER_SHIP, BOARD.SHARKS_MAX - F.sharkIds.length - fresh.length), Math.random)) {
          fresh.push({ id: `${FLEET_SHARK_PREFIX}${++F.seq}`, speciesId: 'shark', name: def.name, hp: def.maxHp, maxHp: def.maxHp, attackPower: def.attackPower, armor: def.armor, attackCooldown: def.attackCooldown, lastAttackAt: 0, position: sp, behavior: 'patrol', lootTable: [], respawnAt: null });
        }
      }
      if (fresh.length) {
        // cada um ronda o casco do navio caçado, espalhados pelo contorno (isca da IA — hostile-ai)
        const tid = target.id, ring = hullRingLen(hbFull, WARSHIP.LENGTH, BOARD.SHARK_RING_GAP), base = F.sharkIds.length;
        fresh.forEach((c, i) => {
          const off = ((base + i) / BOARD.SHARKS_MAX) * ring;
          creatureLure.set(c.id, (t) => {
            const sh = shipOf(tid, shipRef.current);
            if (!sh) return null;
            const q = hullRing(off + t * BOARD.SHARK_RING_SPEED, warshipHalfBeam(), WARSHIP.LENGTH, BOARD.SHARK_RING_GAP);
            return warshipWorld(sh, q.u, q.v);
          });
        });
        F.sharkIds.push(...fresh.map((c) => c.id));
        useGameStore.setState((st) => ({ creatures: [...st.creatures, ...fresh], ...(target!.id === meId() ? { ui: { ...st.ui, message: '🦈 Os piratas soltaram TUBARÕES em volta do seu navio — não caia na água!' } } : {}) }));
      }
      for (const id of F.sharkIds) {
        const c = crs.find((q) => q.id === id), a = creatureAnchors.get(id); // posição VIVA (a store anda 3×/s)
        if (!c || c.behavior === 'dead' || !nearWarshipHull(tShip, a?.x ?? c.position.x, a?.z ?? c.position.z, hbFull, BOARD.SHARK_BITE_R)) continue;
        const left = (biteReload.current.get(id) ?? 0) - dt;
        if (left > 0) { biteReload.current.set(id, left); continue; }
        biteReload.current.set(id, BOARD.SHARK_BITE_S);
        if (target.id === meId() && my) {
          const sank = damageWarship(my, BOARD.SHARK_BITE);
          if (sank) useGameStore.getState().setMessage('🔥 Seu navio AFUNDOU — tubarões e piratas!');
          else if (now - lastBiteMsg.current > 3000) { lastBiteMsg.current = now; useGameStore.getState().setMessage(`🦈 Tubarão mordendo o casco! (${Math.round(my.hp / 1000)} mil / ${WARSHIP.HP / 1000} mil)`); }
        } else broadcastPirateShipHit(target.id, BOARD.SHARK_BITE);
      }
      // ── KRAKEN DE ABORDAGEM: caçando há KRAKEN_AFTER_S com um pirata perto → sobe no convés (1 por caçada) ──
      const near = F.ships.find((s) => s.sinkT === null && Math.hypot(s.x - tShip.x, s.z - tShip.z) <= BOARD.KRAKEN_NEAR);
      if (!F.boarded && !F.boarder && near && F.huntSince !== null && now - F.huntSince >= BOARD.KRAKEN_AFTER_S * 1000) {
        F.boarded = true;
        const def = CREATURES['raider_kraken'];
        if (def) {
          const id = `${FLEET_KRAKEN_PREFIX}${++F.seq}`;
          F.boarder = newBoarder(id, target.id, tShip, near, hbFull, WARSHIP.LENGTH, Math.random);
          const hp = Math.round(def.maxHp * BOARD.KRAKEN_HP_K);
          const w = warshipWorld(tShip, F.boarder.u, F.boarder.v);
          useGameStore.setState((st) => ({
            creatures: [...st.creatures, { id, speciesId: def.id, name: 'Kraken da abordagem', hp, maxHp: hp, attackPower: Math.round(def.attackPower * BOARD.KRAKEN_ATK_K), armor: def.armor, attackCooldown: BOARD.KRAKEN_SLAM_S, lastAttackAt: 0, position: { x: w.x, z: w.z }, behavior: 'patrol', lootTable: [], respawnAt: null }],
            ...(target!.id === meId() ? { ui: { ...st.ui, message: '🐙 Um KRAKEN subiu no seu navio! Largue o timão (E) e lute no convés.' } } : {}),
          }));
          setRoster((r0) => r0 + '|k:' + id);
        }
      }
    }
    const heroes = [
      ...(!useGameStore.getState().player.dead ? [{ id: selfId, x: hero.x, y: hero.y, z: hero.z, local: true }] : []),
      ...(net.connected ? Object.values(net.players).filter((r) => r.hp > 0).map((r) => ({ id: r.id, x: r.x, y: Number.isFinite(r.y) ? (r.y as number) : zsWaterYAt(r.x, r.z), z: r.z, local: false })) : []),
    ];
    for (const s of F.ships) {
      // ── capitão abatido = à deriva ──
      const pilot = crs.find((c) => c.id === s.pilotId);
      if (!s.pilotDead && (!pilot || pilot.behavior === 'dead') && s.sinkT === null) {
        s.pilotDead = true;
        if (target?.id === selfId || Math.hypot(hero.x - s.x, hero.z - s.z) < 300) useGameStore.getState().setMessage('☠️ Capitão pirata abatido — o navio dele ficou à deriva!');
      }
      const others = F.ships.filter((o) => o !== s && o.sinkT === null);
      // ── MANOBRA: caçando = de lado pro alvo; patrulha = de ponto em ponto do mar ──
      let inp;
      if (target) inp = fleetSteer(s, target, others);
      else {
        if (!s.wp || Math.hypot(s.wp.x - s.x, s.wp.z - s.z) < FLEET.WP_REACH || s.stuck > FLEET.STUCK_S) { s.wp = fleetSeaPoint(swim, seaBounds, Math.random); s.stuck = 0; }
        inp = s.wp ? fleetPatrolSteer(s, s.wp, others) : { throttle: 0, steer: 0 };
      }
      // patrulha DEVAGAR (teto de velocidade, não só a aceleração) — caçando, a toda
      warshipStep(swim, s, inp, dt, FLEET_LEN, target ? FLEET.MAX_SPEED : FLEET.MAX_SPEED * FLEET.PATROL_K);
      s.stuck = inp.throttle > 0 && Math.abs(s.speed) < 1 ? s.stuck + dt : 0;
      const h = models.current.get(s.id)?.h ?? 18;
      if (!target) continue;
      // ── CANHÕES no alvo (a salva vai pra sala: os outros DESENHAM; o dano o anfitrião aplica quando cai) ──
      const gunY = zsWaterYAt(s.x, s.z) - WARSHIP_DRAFT * FLEET.SCALE + h * GUNWALE_K * FLEET.SCALE;
      const shot = fleetFire(s, leadAim(target, s, Math.random), gunY);
      if (shot) {
        const t0 = performance.now(), lands = shot.balls.map((b) => ballLanding(b, surfaceAt));
        shot.balls.forEach((b, i) => warshipFx.balls.push({ b, t0: t0 + i * WARSHIP.SALVO_GAP_MS, land: lands[i]!, hit: false, enemy: true }));
        broadcastCannon(shot.balls.map((b) => [b.ox, b.oy, b.oz, b.vx, b.vy, b.vz]), lands.map((l) => [l.x, l.y, l.z, l.t]), WARSHIP.SALVO_GAP_MS);
        const g = distanceGain(Math.hypot(s.x - hero.x, s.z - hero.z));
        if (g > 0.01) shot.balls.forEach((_, i) => window.setTimeout(() => audioManager.playWorld('cannon', g), i * WARSHIP.SALVO_GAP_MS));
      }
      // ── TRIPULAÇÃO: fuzil no herói mais perto (eu ou alguém da sala) dentro do alcance ──
      if (s.sinkT !== null) continue;
      const keel = zsWaterYAt(s.x, s.z) - WARSHIP_DRAFT * FLEET.SCALE; // quilha do navio menor (calado × escala)
      s.crewIds.forEach((id, i) => {
        const cr = crs.find((c) => c.id === id);
        if (!cr || cr.behavior === 'dead') return;
        const left = (crewReload.current.get(id) ?? Math.random() * FLEET.CREW_RELOAD_S) - dt;
        if (left > 0) { crewReload.current.set(id, left); return; }
        const sp = crewSpot(i), w = warshipWorld(s, sp.u, sp.v);
        let tgt: (typeof heroes)[number] | null = null, td: number = FLEET.CREW_RANGE;
        for (const hh of heroes) { const d = Math.hypot(hh.x - w.x, hh.z - w.z); if (d <= td) { td = d; tgt = hh; } }
        if (!tgt) { crewReload.current.set(id, 0.5); return; }
        crewReload.current.set(id, FLEET.CREW_RELOAD_S * (0.8 + Math.random() * 0.4));
        unitAction.set(id, { a: 'attack', until: performance.now() + 450 });
        const hit = Math.random() < crewHitChance(td);
        const from: [number, number, number] = [w.x, keel + deckY(h) + 1.3, w.z];
        const to: [number, number, number] = [hit ? tgt.x : tgt.x + (Math.random() - 0.5) * 3, tgt.y + 1.2, hit ? tgt.z : tgt.z + (Math.random() - 0.5) * 3];
        tracer(from, to);
        shotsOut.current.push([...from, ...to].map((v) => Math.round(v * 10) / 10) as NetFleetShot);
        audioManager.playWorld('gun', distanceGain(Math.hypot(w.x - hero.x, w.z - hero.z)));
        if (!hit) return;
        if (tgt.local) hurtPlayerBy('Pirata do navio', FLEET.CREW_DMG, { x: w.x, z: w.z }, (dmg, hp, max) => `🏴‍☠️ Tiro do navio pirata! -${dmg} HP (${hp}/${max})`);
        else broadcastMobHit(tgt.id, FLEET.CREW_DMG, 'Pirata do navio');
      });
    }
    syncOut();
    // ── AFUNDARAM TODOS: some, e outra esquadra vem depois do descanso ──
    if (fleetVerdict({ ships: F.ships }) === 'beaten') {
      F.ships = []; F.targetId = null; F.lostSince = null; F.boarded = false;
      F.nextAt = now + FLEET.REST_MS;
      dropSharks();
      crewReload.current.clear();
      useGameStore.setState((st) => ({ creatures: st.creatures.filter((c) => !isFleetUnit(c.id) || c.id.startsWith(FLEET_KRAKEN_PREFIX)) }));
      boarderWasOut.current = !!F.boarder;
      if (net.connected && !F.boarder) broadcastFleet([], []);
      setRoster(F.boarder ? '|k:' + F.boarder.id : '');
    }
  });

  return (
    <>
      {roster && zsFleet.ships.map((s) => { const m = modelFor(s.id); return <EnemyShipBody key={s.id} ship={s} model={m.holder} h={m.h} heroRef={heroRef} />; })}
      {roster.includes('|k:') && zsFleet.boarder && <BoarderBody key={zsFleet.boarder.id} b={zsFleet.boarder} shipRef={shipRef} heroRef={heroRef} />}
    </>
  );
}
