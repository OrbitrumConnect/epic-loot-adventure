/**
 * ESQUADRA PIRATA — o desenho e o relógio (03/11, ver `zs-enemy-fleet`). Os navios são o MESMO galeão do herói (mesmo
 * GLB e geometria) a 65% e mais escuros (velas/casco tingidos). Em cada um: o CAPITÃO no timão (sem ele o navio fica à
 * deriva) e 8 PIRATAS DE FUZIL no convés que atiram em você — todos alvos de verdade (mira, dano, XP, dano em área do
 * canhão): a âncora da mira e a posição na store saem daqui. Os corpos só DESENHAM com você a até CREW_DRAW_M (FPS);
 * longe, eles seguem valendo (atiram, morrem). Só quem simula o mundo (solo/anfitrião) tem esquadra; `fleet_*` fora da
 * rede (v1).
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
import { canSimulateSharedWorld } from '@/net/multiplayer';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { pushEvent, shotEvent } from '@/game/systems/feedbackSystem';
import { useZsTouch } from './zs-context';
import { buildWarshipModel, GUNWALE_K, HELM_DECK_K, HELM_U, makeShipHpBar, WARSHIP_DRAFT, WARSHIP_URL, warshipFx, warshipPose, zsWarshipDeck } from './zs-warship-view';
import { ballLanding, WARSHIP, warshipGone, warshipStep, warshipWorld, type ZsWarship } from './zs-warship';
import {
  crewHitChance, crewSpot, FLEET, FLEET_LEN, fleetFire, fleetHelm, fleetMaySpawn, fleetSpawnSpots, fleetSteer, fleetVerdict, isFleetUnit,
  leadAim, newEnemyShip, newFleetCrew, newFleetPilot, zsFleet, type EnemyShip,
} from './zs-enemy-fleet';
import { type ZsTerrain, zsHeightAt, zsWaterYAt } from './zs-terrain-data';
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
    bar.set(ship.hp / FLEET.HP, ship.sinkT === null, state.camera);
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

export function ZsEnemyFleetView({ shipRef, heroRef, terrain }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3>; terrain: ZsTerrain }) {
  const { scene } = useGLTF(WARSHIP_URL);
  const [roster, setRoster] = useState<string>('');
  const models = useRef(new Map<string, { holder: THREE.Group; h: number }>());
  const posAcc = useRef(0);
  const crewReload = useRef(new Map<string, number>());
  const swim = useMemo(() => (x: number, z: number) => zsNavigable(terrain, x, z, WARSHIP.MIN_DEPTH * FLEET.SCALE), [terrain]);
  const surfaceAt = useMemo(() => (x: number, z: number) => Math.max(zsHeightAt(terrain, x, z), zsWaterYAt(x, z)), [terrain]);
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

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1), now = Date.now(), F = zsFleet;
    const my = shipRef.current, sailing = useZsTouch.getState().sailing && !!my && !warshipGone(my) && my.sinkT === null;
    // relógio: navegando desde… / fora do navio desde… (só conta com esquadra no mar)
    if (sailing) { F.sailingSince ??= now; F.ashoreSince = null; } else { F.sailingSince = null; if (F.ships.length) F.ashoreSince ??= now; }
    const simulate = canSimulateSharedWorld();
    // ── CHEGAM ──
    if (simulate && my && F.ships.length === 0 && fleetMaySpawn({ now, sailing, sailingSince: F.sailingSince, nextAt: F.nextAt, present: false })) {
      const n = FLEET.MIN + Math.floor(Math.random() * (FLEET.MAX - FLEET.MIN + 1));
      const spots = fleetSpawnSpots(swim, my, n, Math.random);
      F.nextAt = now + FLEET.ESCAPE_REST_MS; // (sem lugar agora: tenta de novo depois do descanso curto)
      if (spots.length) {
        const def = CREATURES['raider_scout']!;
        F.ships = spots.map((sp) => newEnemyShip(`f${++F.seq}`, sp));
        const units = F.ships.flatMap((sh) => [newFleetPilot(sh, def), ...sh.crewIds.map((_, i) => newFleetCrew(sh, i, def))]);
        useGameStore.setState((s) => ({ creatures: [...s.creatures, ...units], ui: { ...s.ui, message: `🏴‍☠️ Esquadra pirata no horizonte! (${F.ships.length} navios, ${FLEET.CREW} atiradores em cada) — mate o capitão no timão e o navio fica à deriva.` } }));
        setRoster(F.ships.map((s) => s.id).join('|'));
      }
    }
    if (F.ships.length === 0) return;
    const hero = heroRef.current, crs = useGameStore.getState().creatures; // a lista DE AGORA (podem ter acabado de entrar)
    const heroDead = useGameStore.getState().player.dead;
    for (const s of F.ships) {
      // ── capitão abatido = à deriva ──
      const pilot = crs.find((c) => c.id === s.pilotId);
      if (!s.pilotDead && (!pilot || pilot.behavior === 'dead') && s.sinkT === null) {
        s.pilotDead = true;
        useGameStore.getState().setMessage('☠️ Capitão pirata abatido — o navio dele ficou à deriva!');
      }
      // ── MANOBRAM e os CANHÕES ──
      const others = F.ships.filter((o) => o !== s && o.sinkT === null);
      warshipStep(swim, s, my && sailing ? fleetSteer(s, my, others) : { throttle: 0, steer: 0 }, dt, FLEET_LEN, FLEET.MAX_SPEED);
      const h = models.current.get(s.id)?.h ?? 18;
      if (my && sailing && simulate) {
        const gunY = zsWaterYAt(s.x, s.z) - WARSHIP_DRAFT * FLEET.SCALE + h * GUNWALE_K * FLEET.SCALE;
        const shot = fleetFire(s, leadAim(my, s, Math.random), gunY);
        if (shot) {
          const t0 = performance.now();
          shot.balls.forEach((b, i) => warshipFx.balls.push({ b, t0: t0 + i * WARSHIP.SALVO_GAP_MS, land: ballLanding(b, surfaceAt), hit: false, enemy: true }));
          const g = distanceGain(Math.hypot(s.x - hero.x, s.z - hero.z));
          if (g > 0.01) shot.balls.forEach((_, i) => window.setTimeout(() => audioManager.playWorld('cannon', g), i * WARSHIP.SALVO_GAP_MS));
        }
      }
      // ── a TRIPULAÇÃO atira de fuzil em VOCÊ (navio inteiro, você vivo e no alcance) ──
      if (simulate && s.sinkT === null && !heroDead) {
        const keel = zsWaterYAt(s.x, s.z) - WARSHIP_DRAFT * FLEET.SCALE; // quilha do navio menor (calado × escala)
        s.crewIds.forEach((id, i) => {
          const cr = crs.find((c) => c.id === id);
          if (!cr || cr.behavior === 'dead') return;
          const left = (crewReload.current.get(id) ?? Math.random() * FLEET.CREW_RELOAD_S) - dt;
          if (left > 0) { crewReload.current.set(id, left); return; }
          const sp = crewSpot(i), w = warshipWorld(s, sp.u, sp.v), d = Math.hypot(hero.x - w.x, hero.z - w.z);
          if (d > FLEET.CREW_RANGE) { crewReload.current.set(id, 0.5); return; }
          crewReload.current.set(id, FLEET.CREW_RELOAD_S * (0.8 + Math.random() * 0.4));
          unitAction.set(id, { a: 'attack', until: performance.now() + 450 });
          // rastro saindo do convés (a altura vai relativa ao FUNDO — o rastro mede "chão + altura") até o seu peito
          const fromY = keel + deckY(h) + 1.3, hit = Math.random() < crewHitChance(d);
          const aimX = hit ? hero.x : hero.x + (Math.random() - 0.5) * 3, aimZ = hit ? hero.z : hero.z + (Math.random() - 0.5) * 3;
          useGameStore.setState((st) => ({ feedback: pushEvent(st.feedback, shotEvent({ x: w.x, z: w.z }, { x: aimX, z: aimZ }, 'bullet', fromY - zsHeightAt(terrain, w.x, w.z), hero.y + 1.2), Date.now()) }));
          audioManager.playWorld('gun', distanceGain(d));
          if (hit) hurtPlayerBy('Pirata do navio', FLEET.CREW_DMG, { x: w.x, z: w.z }, (dmg, hp, max) => `🏴‍☠️ Tiro do navio pirata! -${dmg} HP (${hp}/${max})`);
        });
      }
    }
    // capitães e tripulação: a posição na store acompanha o navio (pro alcance do tiro e o dano em área do canhão), ~3×/s
    posAcc.current += dt;
    if (posAcc.current > 0.33) {
      posAcc.current = 0;
      const at = new Map<string, { x: number; z: number }>();
      for (const s of F.ships) { at.set(s.pilotId, fleetHelm(s, HELM_U)); s.crewIds.forEach((id, i) => { const sp = crewSpot(i); at.set(id, warshipWorld(s, sp.u, sp.v)); }); }
      useGameStore.setState((st) => ({ creatures: st.creatures.map((c) => { const p = isFleetUnit(c.id) ? at.get(c.id) : undefined; return p ? { ...c, position: { x: p.x, z: p.z } } : c; }) }));
    }
    // ── VÃO EMBORA (você fugiu / saiu do navio) ou foram DERROTADOS ──
    const v = fleetVerdict({ now, ships: F.ships, target: my && my.sinkT === null ? my : null, ashoreSince: F.ashoreSince });
    if (v !== 'stay') {
      F.ships = []; F.ashoreSince = null;
      F.nextAt = now + (v === 'beaten' ? FLEET.REST_MS : FLEET.ESCAPE_REST_MS);
      crewReload.current.clear();
      useGameStore.setState((st) => ({ creatures: st.creatures.filter((c) => !isFleetUnit(c.id)), ...(v === 'escaped' ? { ui: { ...st.ui, message: '🏴‍☠️ Você despistou a esquadra pirata.' } } : {}) }));
      setRoster('');
    }
    void state;
  });

  return (
    <>
      {roster && zsFleet.ships.map((s) => { const m = modelFor(s.id); return <EnemyShipBody key={s.id} ship={s} model={m.holder} h={m.h} heroRef={heroRef} />; })}
    </>
  );
}
