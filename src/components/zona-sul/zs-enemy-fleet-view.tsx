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
import { creatureAnchors, hurtPlayerBy } from '@/components/world/hostile-ai';
import { RifleModel } from '@/components/world/weapon-models';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import {
  broadcastCannon, broadcastFleet, broadcastMobHit, isGuestInRoom, netFleet, registerFleetHitHandler, registerFleetRewardHandler, useNet,
  type NetFleetShip, type NetFleetShot,
} from '@/net/multiplayer';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { pushEvent, shotEvent } from '@/game/systems/feedbackSystem';
import { useZsTouch } from './zs-context';
import { buildWarshipModel, GUNWALE_K, HELM_DECK_K, HELM_U, makeShipHpBar, WARSHIP_DRAFT, WARSHIP_URL, warshipFx, warshipPose, zsWarshipDeck } from './zs-warship-view';
import { ballLanding, nearWarshipHull, WARSHIP, warshipGone, warshipStep, warshipWorld, type ZsWarship } from './zs-warship';
import {
  crewHitChance, crewSpot, FLEET, FLEET_LEN, fleetFire, fleetFormation, fleetHelm, fleetLostTarget, fleetMaySpawn, fleetPatrolSteer,
  fleetPickTarget, fleetSeaPoint, fleetSteer, fleetVerdict, isFleetUnit, leadAim, newEnemyShip, newFleetCrew, newFleetPilot, zsFleet,
  type EnemyShip,
} from './zs-enemy-fleet';
import { fleetShipHit, grantFleetLoot } from './zs-enemy-fleet-hits';
import { type ZsTerrain, zsHeightAt, zsSeaBounds, zsWaterYAt } from './zs-terrain-data';
import { zsNavigable } from './zs-world-profile';

/** Desenha os corpos (capitão + tripulação) com você a até isto (m) do navio. */
export const CREW_DRAW_M = 160;
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
  useFrame(() => {
    const cr = useGameStore.getState().creatures.find((c) => c.id === id), u = unitAction.get(id);
    action.current = !cr || cr.behavior === 'dead' ? 'death' : u && u.until > performance.now() ? u.a : 'idle';
  });
  return (
    <Suspense fallback={null}>
      <GlbHeroMixamo charUrl="/models/raiders/pirate.glb" actionRef={action} autoHeight={1.8} standFixX={Math.PI / 2} bindFix deathClip="back"
        forceGun={gun} weapon={gun ? <Suspense fallback={null}><RifleModel /></Suspense> : undefined} />
    </Suspense>
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

export function ZsEnemyFleetView({ shipRef, heroRef, terrain }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3>; terrain: ZsTerrain }) {
  const { scene } = useGLTF(WARSHIP_URL);
  const [roster, setRoster] = useState<string>('');
  const models = useRef(new Map<string, { holder: THREE.Group; h: number }>());
  const posAcc = useRef(0), netAcc = useRef(0);
  const crewReload = useRef(new Map<string, number>());
  const shotsOut = useRef<NetFleetShot[]>([]);
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
      while (netFleet.shots.length) { const sh = netFleet.shots.shift()!; tracer([sh[0], sh[1], sh[2]], [sh[3], sh[4], sh[5]]); audioManager.playWorld('gun', distanceGain(Math.hypot(sh[0] - hero.x, sh[2] - hero.z))); }
      const r = next.map((s) => s.id).join('|');
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
    if (F.ships.length === 0) return;
    // ── ALVO: quem está a bordo por perto; perdeu (fugiu/desembarcou) por LOST_MS = volta a patrulhar ──
    let target = F.targetId ? cands.find((c) => c.id === F.targetId) ?? null : null;
    if (F.targetId && (!target || fleetLostTarget(F.ships, target))) {
      F.lostSince ??= now;
      if (now - F.lostSince >= FLEET.LOST_MS) { F.targetId = null; F.lostSince = null; target = null; if (cands.some((c) => c.id === selfId)) useGameStore.getState().setMessage('🏴‍☠️ Você despistou a esquadra pirata — ela voltou a patrulhar.'); }
    } else F.lostSince = null;
    if (!F.targetId) {
      const pick = fleetPickTarget(F.ships, cands);
      if (pick) {
        F.targetId = pick; target = cands.find((c) => c.id === pick) ?? null;
        if (pick === selfId) useGameStore.getState().setMessage(`🏴‍☠️ A esquadra pirata te viu! (${F.ships.filter((s) => s.sinkT === null).length} navios, ${FLEET.CREW} atiradores em cada) — mate o capitão no timão e o navio fica à deriva.`);
      }
    }
    const crs = useGameStore.getState().creatures; // a lista DE AGORA (podem ter acabado de entrar)
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
    // capitães e tripulação: a posição na store acompanha o navio (alcance do tiro, dano em área do canhão, rede), ~3×/s
    posAcc.current += dt;
    if (posAcc.current > 0.33) {
      posAcc.current = 0;
      const at = new Map<string, { x: number; z: number }>();
      for (const s of F.ships) { at.set(s.pilotId, fleetHelm(s, HELM_U)); s.crewIds.forEach((id, i) => { const sp = crewSpot(i); at.set(id, warshipWorld(s, sp.u, sp.v)); }); }
      useGameStore.setState((st) => ({ creatures: st.creatures.map((c) => { const p = isFleetUnit(c.id) ? at.get(c.id) : undefined; return p ? { ...c, position: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 } } : c; }) }));
    }
    // a SALA vê os mesmos navios (~5×/s) e os rastros dos tiros
    netAcc.current += dt;
    if (net.connected && netAcc.current > 0.2) {
      netAcc.current = 0;
      const r1 = (v: number) => Math.round(v * 10) / 10, r3 = (v: number) => Math.round(v * 1000) / 1000;
      broadcastFleet(F.ships.map((s) => ({ i: s.id, x: r1(s.x), z: r1(s.z), yaw: r3(s.yaw), r: r3(s.roll), h: Math.round(s.hp), sk: s.sinkT === null ? null : r1(s.sinkT), pd: s.pilotDead ? 1 : 0 })), shotsOut.current.splice(0));
    } else if (!net.connected) shotsOut.current.length = 0;
    // ── AFUNDARAM TODOS: some, e outra esquadra vem depois do descanso ──
    if (fleetVerdict({ ships: F.ships }) === 'beaten') {
      F.ships = []; F.targetId = null; F.lostSince = null;
      F.nextAt = now + FLEET.REST_MS;
      crewReload.current.clear();
      useGameStore.setState((st) => ({ creatures: st.creatures.filter((c) => !isFleetUnit(c.id)) }));
      if (net.connected) broadcastFleet([], []);
      setRoster('');
    }
  });

  return (
    <>
      {roster && zsFleet.ships.map((s) => { const m = modelFor(s.id); return <EnemyShipBody key={s.id} ship={s} model={m.holder} h={m.h} heroRef={heroRef} />; })}
    </>
  );
}
