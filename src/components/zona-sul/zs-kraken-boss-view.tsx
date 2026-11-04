/**
 * KRAKEN DAS CAGARRAS — desenho, simulação (anfitrião/solo) e espelho (convidado). Regras em `zs-kraken-boss.ts`.
 *  - CORPO: o GLB do Kraken (o mesmo do chefe/abordagem) com BODY_H, metade pra fora d'água, olhando pro navio-alvo.
 *  - TENTÁCULOS: 6 correntes de gomos num ÚNICO InstancedMesh (1 desenho pros 6 — FPS), balançando; a chicotada levanta,
 *    bate no casco e fica na água um instante. Cortado = afunda e some.
 *  - VIDA: tentáculos e corpo são bichos da store (`zs_kraken_*`): o estouro da bala de canhão (cannonHit) e o fuzil
 *    pegam pelo caminho de sempre, loot/XP normais, e a sala vê a vida pela foto do mundo.
 *  - ONLINE: o anfitrião simula e manda fase/olhar/chicotadas (`kraken`, ~4×/s); o dano no navio de quem está na sala vai
 *    pelo ship-hit de bicho (vale sem inimizade) e no corpo pelo mob-hit; a pedra vai pela salva de sempre (`cannon`).
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { creatureAnchors, hurtPlayerBy } from '@/components/world/hostile-ai';
import { MIXAMO_RAIDER, mixClipProps } from '@/components/world/raider';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import type { CreatureState } from '@/game/types';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { broadcastCannon, broadcastKraken, broadcastMobHit, broadcastPirateShipHit, isGuestInRoom, netKraken, useNet, type NetKraken } from '@/net/multiplayer';
import { makeShipHpBar, warshipFx, warshipHalfBeam } from './zs-warship-view';
import { ballLanding, damageWarship, WARSHIP, warshipGone, type CannonBall, type ZsWarship } from './zs-warship';
import { elevationFor } from './zs-enemy-fleet';
import {
  allTentaclesCut, hullNearestPoint, isKrakenBoss, KRAKEN_BODY_ID, KRAKEN_BOSS, krakenPhaseStep, krakenTentId, nearestShip, newKraken, slamLean,
  tentacleBase, tentacleStep, tentacleTarget, zsKraken, type KrakenHero, type KrakenShip,
} from './zs-kraken-boss';
import { type ZsTerrain, zsHeightAt, zsWaterYAt } from './zs-terrain-data';

const SEG = 12;
const SEG_LEN = KRAKEN_BOSS.TENT_LEN / SEG;
/** some de vista (corpo e tentáculos) com a câmera a mais disto (m) — longe não pesa */
export const KRAKEN_DRAW_M = 900;
const PHASES: NetKraken['ph'][] = [0, 1, 2, 3];
const PHASE_OF = ['sleep', 'rise', 'fight', 'dead'] as const;
const meId = () => useNet.getState().selfId || 'eu';

/** Bicho da store pro tentáculo / o corpo (sem IA: desenhado e pensado aqui). */
function krakenCreature(id: string, name: string, hp: number, armor: number, at: { x: number; z: number }): CreatureState {
  const def = CREATURES['raider_kraken']!;
  return { id, speciesId: def.id, name, hp, maxHp: hp, attackPower: def.attackPower, armor, attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10 }, behavior: 'patrol', lootTable: [], respawnAt: null };
}

export function ZsKrakenBoss({ shipRef, heroRef, terrain }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3>; terrain: ZsTerrain }) {
  const L = KRAKEN_BOSS.LAIR;
  const waterY = zsWaterYAt(L.x, L.z);
  const body = useRef<THREE.Group>(null);
  const bodyAction = useRef<HeroAction>('idle');
  const mx = MIXAMO_RAIDER['raider_kraken']!;
  const surfaceAt = useMemo(() => (x: number, z: number) => Math.max(zsHeightAt(terrain, x, z), zsWaterYAt(x, z)), [terrain]);
  // tentáculos: 1 InstancedMesh (6 × SEG gomos), afinando da base pra ponta
  const tent = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.82, 1, 1, 8, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#5a2236', roughness: 0.55, metalness: 0.05, emissive: '#1a0610', emissiveIntensity: 0.4 });
    const mesh = new THREE.InstancedMesh(geo, mat, KRAKEN_BOSS.TENTACLES * SEG);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; // a caixa muda com o balanço (6 × 12 gomos: barato)
    mesh.castShadow = true;
    return mesh;
  }, []);
  useEffect(() => () => { tent.geometry.dispose(); (tent.material as THREE.Material).dispose(); }, [tent]);
  const bodyBar = useMemo(() => makeShipHpBar(8, 0.6), []);
  const tentBars = useMemo(() => Array.from({ length: KRAKEN_BOSS.TENTACLES }, () => makeShipHpBar(2.2, 0.22)), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), zero: new THREE.Matrix4().makeScale(0, 0, 0) }), []);
  const st = useRef({ prev: 'sleep' as string, netAcc: 0, posAcc: 0, removeAt: 0, msgAt: 0, rise: 0 });

  /** tira os bichos do Kraken da store (dormiu / caiu e o corpo já saiu) */
  const dropCreatures = () => {
    for (let i = 0; i < KRAKEN_BOSS.TENTACLES; i++) creatureAnchors.delete(krakenTentId(i));
    creatureAnchors.delete(KRAKEN_BODY_ID);
    useGameStore.setState((s) => ({ creatures: s.creatures.filter((c) => !isKrakenBoss(c.id)) }));
  };
  useEffect(() => () => dropCreatures(), []); // eslint-disable-line react-hooks/exhaustive-deps

  /** pancada no NAVIO de `tg.owner` (o meu aqui; o de outro, ele aplica) + em quem estiver perto da pancada */
  const applyHit = (tg: { kind: string; owner: string; x: number; z: number }, shipDmg: number, heroDmg: number, who: string) => {
    const my = shipRef.current, me = meId(), hero = heroRef.current, net = useNet.getState();
    if (tg.kind === 'ship') {
      if (tg.owner === me) {
        if (my && my.sinkT === null) {
          const sank = damageWarship(my, shipDmg);
          if (sank) useGameStore.getState().setMessage('🔥 Seu navio AFUNDOU — o Kraken das Cagarras! Construa outro na âncora ou no card da base.');
          else if (Date.now() - st.current.msgAt > 2500) { st.current.msgAt = Date.now(); useGameStore.getState().setMessage(`🐙 ${who} no seu navio! (${Math.round(my.hp / 1000)} mil / ${WARSHIP.HP / 1000} mil)`); }
        }
      } else broadcastPirateShipHit(tg.owner, shipDmg, 'Kraken das Cagarras');
    }
    if (Math.hypot(hero.x - tg.x, hero.z - tg.z) <= KRAKEN_BOSS.TENT_HERO_R) hurtPlayerBy(who, heroDmg, tg, (dmg, hp, max) => `🐙 ${who}! -${dmg} HP (${hp}/${max})`);
    if (net.connected) for (const r of Object.values(net.players)) if (r.hp > 0 && Math.hypot(r.x - tg.x, r.z - tg.z) <= KRAKEN_BOSS.TENT_HERO_R) broadcastMobHit(r.id, heroDmg, who);
    warshipFx.splashes.push({ x: tg.x, y: zsWaterYAt(tg.x, tg.z), z: tg.z, t0: performance.now() });
    const g = distanceGain(Math.hypot(hero.x - tg.x, hero.z - tg.z));
    if (g > 0.01) audioManager.playWorld('cannon', g * 0.7);
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1), now = Date.now(), K = zsKraken.s, hero = heroRef.current, t = state.clock.elapsedTime;
    const S = st.current;
    // ═══ CONVIDADO: espelha o anfitrião ═══
    if (isGuestInRoom()) {
      const nk = performance.now() - netKraken.at < 3000 ? netKraken.k : null;
      if (!nk) { if (K.phase !== 'sleep') Object.assign(K, newKraken()); }
      else {
        K.phase = PHASE_OF[nk.ph] ?? 'sleep'; K.riseT = nk.rt * KRAKEN_BOSS.RISE_S; K.bodyOut = nk.bo === 1;
        let dy = nk.y - K.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; K.yaw += dy * Math.min(1, dt * 4);
        K.bodyAct = nk.a === 1 ? 'attack' : nk.a === 2 ? 'death' : 'idle';
        K.tents.forEach((tn, i) => {
          const alive = nk.t[i] === 1;
          if (tn.alive && !alive) tn.diedAt = now;
          tn.alive = alive;
          const sl = nk.s[i];
          if (!sl) tn.slam = null;
          else if (!tn.slam || Math.hypot(tn.slam.x - sl[0], tn.slam.z - sl[1]) > 0.5) tn.slam = { kind: 'ship', owner: '', x: sl[0], z: sl[1], age: sl[2], hit: true };
          else tn.slam.age += dt;
        });
      }
    } else {
      // ═══ SOLO / ANFITRIÃO: simula ═══
      const my = shipRef.current, me = meId(), net = useNet.getState(), hb = warshipHalfBeam();
      const ships: KrakenShip[] = [];
      if (my && my.sinkT === null && !warshipGone(my)) ships.push({ owner: me, x: my.x, z: my.z, yaw: my.yaw });
      const heroes: KrakenHero[] = [{ id: me, x: hero.x, z: hero.z, inWater: hero.y <= zsWaterYAt(hero.x, hero.z) + 1.2 }];
      if (net.connected) for (const r of Object.values(net.players)) {
        const v = (r.v ?? []).find((q) => q.k === 's' && (q.h ?? 1) > 0);
        if (v) ships.push({ owner: r.id, x: v.x, z: v.z, yaw: v.yaw });
        if (r.hp > 0) heroes.push({ id: r.id, x: r.x, z: r.z, inWater: Number.isFinite(r.y) ? (r.y as number) <= zsWaterYAt(r.x, r.z) + 1.2 : false });
      }
      const ns = nearestShip(ships, hb);
      const swimD = Math.min(...heroes.filter((h) => h.inWater).map((h) => Math.hypot(h.x - L.x, h.z - L.z)), Infinity);
      const prev = K.phase;
      // acorda só com NAVIO (luta de navio); fica acordado com navio ou alguém nadando por perto
      krakenPhaseStep(K, now, dt, K.phase === 'sleep' ? (ns?.d ?? Infinity) : Math.min(ns?.d ?? Infinity, swimD));
      if (prev !== K.phase) {
        if (K.phase === 'rise') {
          dropCreatures();
          const fresh = Array.from({ length: KRAKEN_BOSS.TENTACLES }, (_, i) => krakenCreature(krakenTentId(i), 'Tentáculo do Kraken', KRAKEN_BOSS.TENT_HP, KRAKEN_BOSS.TENT_ARMOR, tentacleBase(i)));
          useGameStore.setState((s) => ({ creatures: [...s.creatures.filter((c) => !isKrakenBoss(c.id)), ...fresh] }));
          if (ns && ns.ship.owner === me) useGameStore.getState().setMessage('🐙 O KRAKEN DAS CAGARRAS acordou! Corte os 6 tentáculos (canhão/fuzil) — aí o corpo fica exposto. De longe ele arremessa pedra.');
        }
        if (K.phase === 'sleep') { dropCreatures(); if (prev === 'fight' && ns && ns.d < KRAKEN_BOSS.SLEEP_R * 1.5 && ns.ship.owner === me) useGameStore.getState().setMessage('🐙 O Kraken afundou de volta… (volta inteiro)'); }
      }
      if (K.phase === 'fight') {
        const crs = useGameStore.getState().creatures;
        // tentáculo cortado (a vida está na store: canhão/fuzil de qualquer um)
        for (const tn of K.tents) {
          if (!tn.alive) continue;
          const c = crs.find((q) => q.id === krakenTentId(tn.i));
          if (!c || c.behavior === 'dead') { tn.alive = false; tn.diedAt = now; tn.slam = null; }
        }
        if (allTentaclesCut(K) && !K.bodyOut) {
          K.bodyOut = true;
          useGameStore.setState((s) => ({ creatures: [...s.creatures.filter((c) => c.id !== KRAKEN_BODY_ID), krakenCreature(KRAKEN_BODY_ID, 'Kraken das Cagarras', KRAKEN_BOSS.BODY_HP, KRAKEN_BOSS.BODY_ARMOR, L)] }));
          if (ns && ns.d < KRAKEN_BOSS.SLEEP_R) useGameStore.getState().setMessage('🐙 Tentáculos cortados — o corpo do KRAKEN está EXPOSTO! Canhão nele!');
        }
        // chicotadas
        for (const tn of K.tents) {
          const b = tentacleBase(tn.i);
          const hit = tentacleStep(tn, dt, () => tentacleTarget(b, ships, heroes, hb));
          if (hit) applyHit(hit, KRAKEN_BOSS.TENT_SHIP_DMG, KRAKEN_BOSS.TENT_HERO_DMG, 'Tentáculo do Kraken');
        }
        // corpo exposto: bate no navio que chegar perto
        if (K.bodyOut) {
          const body = useGameStore.getState().creatures.find((q) => q.id === KRAKEN_BODY_ID); // a lista DE AGORA (o corpo pode ter acabado de entrar)
          if (!body || body.behavior === 'dead') {
            K.phase = 'dead'; K.nextAt = now + KRAKEN_BOSS.RESPAWN_MS; K.bodyAct = 'death'; S.removeAt = now + 6000;
            if (ns && ns.d < KRAKEN_BOSS.SLEEP_R) useGameStore.getState().setMessage('🏆 O KRAKEN DAS CAGARRAS caiu! (volta em 20 min)');
          } else {
            K.bodyReload -= dt;
            if (K.bodyAct === 'attack' && (K.bodyActT -= dt) <= 0) K.bodyAct = 'idle';
            if (K.bodyReload <= 0 && ns && ns.d <= KRAKEN_BOSS.BODY_REACH) {
              K.bodyReload = KRAKEN_BOSS.BODY_SLAM_S; K.bodyAct = 'attack'; K.bodyActT = 1.2;
              const q = { kind: 'ship', owner: ns.ship.owner, ...hullNearestPoint(ns.ship, L, hb) };
              window.setTimeout(() => { if (zsKraken.s.phase === 'fight') applyHit(q, KRAKEN_BOSS.BODY_SHIP_DMG, KRAKEN_BOSS.BODY_HERO_DMG, 'Pancada do Kraken'); }, 600); // morreu no meio do golpe: não bate
            }
          }
        }
        // de longe: PEDRA no navio mais perto (a salva de sempre: os outros desenham, o anfitrião aplica)
        K.rockReload -= dt;
        if (K.phase === 'fight' && K.rockReload <= 0 && ns && ns.d >= KRAKEN_BOSS.ROCK_MIN && ns.d <= KRAKEN_BOSS.ROCK_RANGE) {
          K.rockReload = KRAKEN_BOSS.ROCK_S;
          const oy = waterY + KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K) * 0.9;
          const aim = { x: ns.ship.x, z: ns.ship.z }, d = Math.hypot(aim.x - L.x, aim.z - L.z), el = elevationFor(d, oy - waterY);
          if (el !== null) {
            const az = Math.atan2(aim.x - L.x, aim.z - L.z), hs = Math.cos(el) * WARSHIP.BALL_SPEED;
            const ball: CannonBall = { ox: L.x, oy, oz: L.z, vx: Math.sin(az) * hs, vy: Math.sin(el) * WARSHIP.BALL_SPEED, vz: Math.cos(az) * hs };
            const land = ballLanding(ball, surfaceAt);
            warshipFx.balls.push({ b: ball, t0: performance.now(), land, hit: false, enemy: 'kraken' });
            broadcastCannon([[ball.ox, ball.oy, ball.oz, ball.vx, ball.vy, ball.vz]], [[land.x, land.y, land.z, land.t]], 0);
            K.bodyAct = 'attack'; K.bodyActT = 0.9;
          }
        }
      }
      if (K.phase === 'dead' && S.removeAt && now >= S.removeAt) { S.removeAt = 0; dropCreatures(); }
      // olha pro navio mais perto
      if (ns) { const want = Math.atan2(ns.ship.x - L.x, ns.ship.z - L.z); let dy = want - K.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; K.yaw += dy * Math.min(1, dt * 1.2); }
      // a SALA vê o mesmo (~4×/s)
      S.netAcc += dt;
      if (net.connected && S.netAcc > 0.25 && (K.phase !== 'sleep' || prev !== 'sleep')) {
        S.netAcc = 0;
        const r1 = (v: number) => Math.round(v * 10) / 10;
        broadcastKraken({
          ph: PHASES[PHASE_OF.indexOf(K.phase)] ?? 0, rt: Math.round(Math.min(1, K.riseT / KRAKEN_BOSS.RISE_S) * 100) / 100, y: Math.round(K.yaw * 100) / 100,
          bo: K.bodyOut ? 1 : 0, a: K.bodyAct === 'attack' ? 1 : K.bodyAct === 'death' ? 2 : 0,
          t: K.tents.map((tn) => (tn.alive ? 1 : 0)), s: K.tents.map((tn) => (tn.slam ? [r1(tn.slam.x), r1(tn.slam.z), r1(tn.slam.age)] as [number, number, number] : null)),
        });
      }
    }

    // ═══ DESENHO (todos) ═══
    const cam = state.camera, far = Math.hypot(cam.position.x - L.x, cam.position.z - L.z) > KRAKEN_DRAW_M;
    const up = K.phase === 'sleep' || far ? 0 : K.phase === 'rise' ? Math.min(1, K.riseT / KRAKEN_BOSS.RISE_S) : 1;
    S.rise += (up - S.rise) * Math.min(1, dt * 2.5);
    const sink = (1 - S.rise) * (KRAKEN_BOSS.BODY_H + 6);
    const visible = S.rise > 0.01 && !far;
    const g = body.current;
    if (g) {
      g.visible = visible;
      const deadSink = K.phase === 'dead' ? Math.min(1, (6000 - Math.max(0, S.removeAt - now)) / 6000) * KRAKEN_BOSS.BODY_H * 0.6 : 0;
      g.position.set(L.x, waterY - KRAKEN_BOSS.BODY_H * KRAKEN_BOSS.SUBMERGED_K - sink - deadSink + Math.sin(t * 0.6) * 0.25, L.z);
      g.rotation.y = K.yaw;
      bodyAction.current = K.bodyAct === 'death' || K.phase === 'dead' ? 'death' : K.bodyAct === 'attack' ? 'attack' : 'idle';
    }
    // corpo: alvo só exposto
    const bodyCr = K.bodyOut ? useGameStore.getState().creatures.find((c) => c.id === KRAKEN_BODY_ID) : undefined;
    creatureAnchors.set(KRAKEN_BODY_ID, { x: L.x, y: waterY, z: L.z, top: KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K), alive: !!bodyCr && bodyCr.behavior !== 'dead' && visible, r: 3.5 });
    bodyBar.group.position.set(L.x, waterY + KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K) + 2.2 - sink, L.z);
    bodyBar.set(bodyCr ? bodyCr.hp / bodyCr.maxHp : 0, !!bodyCr && bodyCr.behavior !== 'dead' && visible, cam);
    // tentáculos
    const crs = useGameStore.getState().creatures;
    for (const tn of K.tents) {
      const b = tentacleBase(tn.i), id = krakenTentId(tn.i);
      const out = Math.atan2(b.x - L.x, b.z - L.z);
      const deadK = tn.alive ? 0 : tn.diedAt ? Math.min(1, (now - tn.diedAt) / 2000) : 1;
      const show = visible && deadK < 1;
      let lean = 0, az = out;
      if (tn.slam) { lean = slamLean(tn.slam.age); az = Math.atan2(tn.slam.x - b.x, tn.slam.z - b.z); }
      tmp.p.set(b.x, waterY - 2.5 - sink - deadK * KRAKEN_BOSS.TENT_LEN, b.z);
      for (let k = 0; k < SEG; k++) {
        const idx = tn.i * SEG + k;
        if (!show) { tent.setMatrixAt(idx, tmp.zero); continue; }
        const f = k / SEG;
        // em pé balançando com a ponta enrolando pra fora; na chicotada, inclina pro alvo (base menos, ponta mais)
        const curl = tn.slam ? 0 : (0.12 + 0.75 * f * f) * (0.7 + 0.3 * Math.sin(t * 1.1 + tn.i * 1.7));
        const theta = lean * Math.min(1, 0.45 + 0.8 * f) + curl + 0.06 * Math.sin(t * 1.9 + k * 0.5 + tn.i);
        const a = az + 0.22 * Math.sin(t * 1.3 + k * 0.4 + tn.i * 2.1) * (tn.slam ? 0.3 : 1);
        tmp.d.set(Math.sin(theta) * Math.sin(a), Math.cos(theta), Math.sin(theta) * Math.cos(a)).normalize();
        tmp.q.setFromUnitVectors(tmp.up, tmp.d);
        const r = 1.15 * (1 - f * 0.82);
        tmp.s.set(r, SEG_LEN * 1.1, r);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        tent.setMatrixAt(idx, tmp.m);
        tmp.p.addScaledVector(tmp.d, SEG_LEN);
      }
      const c = crs.find((q) => q.id === id);
      const aliveC = !!c && c.behavior !== 'dead' && tn.alive;
      creatureAnchors.set(id, { x: b.x, y: waterY, z: b.z, top: 9, alive: aliveC && show && K.phase === 'fight', r: 1.4 });
      const bar = tentBars[tn.i]!;
      bar.group.position.set(b.x, waterY + 10.5 - sink, b.z);
      bar.set(c ? c.hp / c.maxHp : 0, aliveC && show && !!c && c.hp < c.maxHp, cam);
    }
    tent.instanceMatrix.needsUpdate = true;
    tent.visible = visible;
  });

  return (
    <>
      <primitive object={tent} />
      <group ref={body} visible={false}>
        <Suspense fallback={null}>
          <GlbHeroMixamo charUrl={mx.url} actionRef={bodyAction} autoHeight={KRAKEN_BOSS.BODY_H} standFixX={mx.standFixX} bindFix deathClip={mx.death ?? 'back'} {...mixClipProps(mx.clips)} />
        </Suspense>
      </group>
      <primitive object={bodyBar.group} />
      {tentBars.map((b, i) => <primitive key={i} object={b.group} />)}
    </>
  );
}

