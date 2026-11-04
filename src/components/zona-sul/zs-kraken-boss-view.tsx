/**
 * KRAKEN DAS CAGARRAS (KAIJU, v2 04/11) — desenho, simulação (anfitrião/solo) e espelho (convidado). Regras em
 * `zs-kraken-boss.ts`.
 *  - CORPO: o GLB do Kraken com BODY_H, enterrado até a cintura (~65 m pra fora), olhando pro navio-alvo; anda atrás do
 *    navio depois dos tentáculos (animação de andar); afunda quando despistado / ao morrer.
 *  - ÁGUA TURVA (esconde o que fica embaixo — "consigo ver a perna") + REDEMOINHO girando que puxa o navio
 *    (`warshipDrift`, aplicado pelo mundo no navio do herói — o convés leva junto quem está em pé).
 *  - TENTÁCULOS: 6 correntes de gomos num ÚNICO InstancedMesh (FPS); a chicotada levanta, bate no casco, fica na água.
 *    A bala acerta NO AR (`krakenShapes` → zs-warship-view). Cortado = 1–2 CRIAS sobem no navio mais perto.
 *  - TUBARÕES vêm junto: rondam o Kraken; navio perto = rondam o casco dele e mordem.
 *  - VIDA: tentáculos, corpo e crias são bichos da store (canhão/fuzil pelo caminho de sempre, loot/XP normais).
 *  - ONLINE: o anfitrião simula e manda (`kraken`, ~4×/s: fase, posição, chicotadas, crias); o dano no navio de quem
 *    está na sala vai pelo ship-hit de bicho e no corpo pelo mob-hit; a pedra pela salva de sempre (`cannon`).
 */
import { useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GlbHeroMixamo } from '@/components/world/glb-hero-mixamo';
import type { HeroAction } from '@/components/world/glb-hero';
import { creatureAnchors, creatureLure, hurtPlayerBy } from '@/components/world/hostile-ai';
import { MIXAMO_RAIDER, mixClipProps } from '@/components/world/raider';
import { useGameStore } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import type { CreatureState } from '@/game/types';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { broadcastCannon, broadcastKraken, broadcastMobHit, broadcastPirateShipHit, isGuestInRoom, netKraken, useNet, type NetFleetBoarder, type NetKraken } from '@/net/multiplayer';
import { makeShipHpBar, warshipFx, warshipHalfBeam } from './zs-warship-view';
import { ballLanding, damageWarship, nearWarshipHull, WARSHIP, warshipDrift, warshipGone, warshipLocal, warshipWorld, type CannonBall, type ZsWarship } from './zs-warship';
import { BOARD, boarderStep, elevationFor, FLEET_SHARK_PREFIX, hullRing, hullRingLen, newBoarder, type Boarder } from './zs-enemy-fleet';
import { BoarderBody } from './zs-enemy-fleet-view';
import {
  allTentaclesCut, hullNearestPoint, isKrakenBoss, KRAKEN_BODY_ID, KRAKEN_BOSS, KRAKEN_SPAWN_PREFIX, krakenGaveUp, krakenPhaseStep, krakenShapes,
  krakenTentId, krakenWalk, nearestShip, newKraken, slamLean, spawnCount, tentacleBase, tentacleStep, tentacleTarget, whirlpoolOn, whirlpoolPull,
  zsKraken, type KrakenHero, type KrakenPhase, type KrakenShip,
} from './zs-kraken-boss';
import { type ZsTerrain, zsHeightAt, zsWaterYAt } from './zs-terrain-data';
import { zsNavigable, zsSwimmable } from './zs-world-profile';

const SEG = 16;
const SEG_LEN = KRAKEN_BOSS.TENT_LEN / SEG;
/** some de vista (corpo, tentáculos, água turva) com a câmera a mais disto (m) — longe não pesa */
export const KRAKEN_DRAW_M = 1600;
const PHASE_OF: KrakenPhase[] = ['sleep', 'rise', 'fight', 'dead', 'hunt', 'sink'];
const meId = () => useNet.getState().selfId || 'eu';
const ACT: Record<Boarder['act'], NetFleetBoarder['a']> = { climb: 0, walk: 1, attack: 2, idle: 3 };
const ACT_BACK: Boarder['act'][] = ['climb', 'walk', 'attack', 'idle'];
/** crias no convés (anfitrião simula; convidado espelha) e os tubarões que vêm com ele */
const spawns: { list: Boarder[]; seq: number; sharkIds: string[] } = { list: [], seq: 0, sharkIds: [] };

/** O navio do jogador `owner` agora: o meu ou o de alguém da sala. */
function shipOf(owner: string, my: ZsWarship | null): { x: number; z: number; yaw: number } | null {
  if (owner === meId()) return my && my.sinkT === null && !warshipGone(my) ? my : null;
  const v = (useNet.getState().players[owner]?.v ?? []).find((q) => q.k === 's' && (q.h ?? 1) > 0);
  return v ?? null;
}
/** Todos os navios no mar agora (o meu + os da sala). */
function currentShips(my: ZsWarship | null): KrakenShip[] {
  const out: KrakenShip[] = [], net = useNet.getState();
  if (my && my.sinkT === null && !warshipGone(my)) out.push({ owner: meId(), x: my.x, z: my.z, yaw: my.yaw });
  if (net.connected) for (const r of Object.values(net.players)) {
    const v = (r.v ?? []).find((q) => q.k === 's' && (q.h ?? 1) > 0);
    if (v) out.push({ owner: r.id, x: v.x, z: v.z, yaw: v.yaw });
  }
  return out;
}
/** Bicho da store pro tentáculo / o corpo / a cria (sem IA de terra: desenhado e pensado aqui). */
function krakenCreature(id: string, name: string, hp: number, armor: number, at: { x: number; z: number }, atkK = 1): CreatureState {
  const def = CREATURES['raider_kraken']!;
  return { id, speciesId: def.id, name, hp, maxHp: hp, attackPower: Math.round(def.attackPower * atkK), armor, attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10 }, behavior: 'patrol', lootTable: [], respawnAt: null };
}
/** textura da água TURVA (centro escuro, borda some) e do REDEMOINHO (braços em espiral) */
function makeTextures(): { murk: THREE.CanvasTexture; whirl: THREE.CanvasTexture } {
  const c1 = document.createElement('canvas'); c1.width = c1.height = 256;
  const g1 = c1.getContext('2d')!, gr = g1.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(14,26,22,0.94)'); gr.addColorStop(0.55, 'rgba(18,34,28,0.86)'); gr.addColorStop(0.8, 'rgba(22,42,36,0.45)'); gr.addColorStop(1, 'rgba(22,42,36,0)');
  g1.fillStyle = gr; g1.fillRect(0, 0, 256, 256);
  const c2 = document.createElement('canvas'); c2.width = c2.height = 512;
  const g2 = c2.getContext('2d')!;
  g2.lineCap = 'round';
  for (let arm = 0; arm < 5; arm++) {
    const a0 = (arm / 5) * Math.PI * 2;
    for (let k = 0; k < 60; k++) {
      const r0 = 0.12 + (k / 60) * 0.86, r1 = r0 + 0.015, w0 = a0 + r0 * 7, w1 = a0 + r1 * 7;
      g2.strokeStyle = `rgba(225,238,240,${(0.42 * (1 - r0)).toFixed(3)})`; g2.lineWidth = 3 + 7 * (1 - r0);
      g2.beginPath(); g2.moveTo(256 + Math.cos(w0) * r0 * 256, 256 + Math.sin(w0) * r0 * 256); g2.lineTo(256 + Math.cos(w1) * r1 * 256, 256 + Math.sin(w1) * r1 * 256); g2.stroke();
    }
  }
  const t1 = new THREE.CanvasTexture(c1), t2 = new THREE.CanvasTexture(c2);
  t1.colorSpace = THREE.SRGBColorSpace; t2.colorSpace = THREE.SRGBColorSpace;
  return { murk: t1, whirl: t2 };
}

export function ZsKrakenBoss({ shipRef, heroRef, terrain }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3>; terrain: ZsTerrain }) {
  const body = useRef<THREE.Group>(null);
  const bodyAction = useRef<HeroAction>('idle');
  const [roster, setRoster] = useState('');
  const mx = MIXAMO_RAIDER['raider_kraken']!;
  const surfaceAt = useMemo(() => (x: number, z: number) => Math.max(zsHeightAt(terrain, x, z), zsWaterYAt(x, z)), [terrain]);
  // anda só por mar fundo (o centro e um anel em volta: não sobe em ilha nem praia)
  const canStand = useMemo(() => (x: number, z: number) => zsNavigable(terrain, x, z, 6) && [0, 1, 2, 3].every((i) => zsNavigable(terrain, x + Math.sin(i * 1.571) * 15, z + Math.cos(i * 1.571) * 15, 3)), [terrain]);
  const sharkSwim = useMemo(() => (x: number, z: number) => zsSwimmable(terrain, x, z), [terrain]);
  const tent = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.82, 1, 1, 10, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#5a2236', roughness: 0.55, metalness: 0.05, emissive: '#1a0610', emissiveIntensity: 0.4 });
    const mesh = new THREE.InstancedMesh(geo, mat, KRAKEN_BOSS.TENTACLES * SEG);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = true;
    return mesh;
  }, []);
  const water = useMemo(() => {
    const tx = makeTextures();
    const murk = new THREE.Mesh(new THREE.CircleGeometry(KRAKEN_BOSS.MURK_R, 48), new THREE.MeshBasicMaterial({ map: tx.murk, transparent: true, depthWrite: false }));
    murk.rotation.x = -Math.PI / 2; murk.renderOrder = 3;
    const whirl = new THREE.Mesh(new THREE.CircleGeometry(KRAKEN_BOSS.PULL_R, 64), new THREE.MeshBasicMaterial({ map: tx.whirl, transparent: true, depthWrite: false, opacity: 0.8 }));
    whirl.rotation.x = -Math.PI / 2; whirl.renderOrder = 4; whirl.position.y = 0.05;
    const g = new THREE.Group(); g.add(murk, whirl); g.visible = false;
    return { g, murk, whirl, tx };
  }, []);
  useEffect(() => () => {
    tent.geometry.dispose(); (tent.material as THREE.Material).dispose();
    for (const m of [water.murk, water.whirl]) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    water.tx.murk.dispose(); water.tx.whirl.dispose();
    warshipDrift.x = 0; warshipDrift.z = 0; krakenShapes.segs = []; krakenShapes.body = null;
  }, [tent, water]);
  const bodyBar = useMemo(() => makeShipHpBar(14, 1.0), []);
  const tentBars = useMemo(() => Array.from({ length: KRAKEN_BOSS.TENTACLES }, () => makeShipHpBar(5, 0.45)), []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), zero: new THREE.Matrix4().makeScale(0, 0, 0) }), []);
  const st = useRef({ netAcc: 0, posAcc: 0, removeAt: 0, msgAt: 0, rise: 0, deadAt: new Map<string, number>(), lastBite: new Map<string, number>() });

  /** tira os bichos do Kraken (tentáculos/corpo) e os tubarões dele; as crias ficam até morrer */
  const dropCreatures = () => {
    for (let i = 0; i < KRAKEN_BOSS.TENTACLES; i++) creatureAnchors.delete(krakenTentId(i));
    creatureAnchors.delete(KRAKEN_BODY_ID);
    const sh = new Set(spawns.sharkIds); spawns.sharkIds = [];
    for (const id of sh) creatureLure.delete(id);
    useGameStore.setState((s) => ({ creatures: s.creatures.filter((c) => !isKrakenBoss(c.id) && !sh.has(c.id)) }));
  };
  const rosterOf = () => spawns.list.map((b) => b.id).join('|');
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
    if (heroDmg > 0) {
      if (Math.hypot(hero.x - tg.x, hero.z - tg.z) <= KRAKEN_BOSS.TENT_HERO_R) hurtPlayerBy(who, heroDmg, tg, (dmg, hp, max) => `🐙 ${who}! -${dmg} HP (${hp}/${max})`);
      if (net.connected) for (const r of Object.values(net.players)) if (r.hp > 0 && Math.hypot(r.x - tg.x, r.z - tg.z) <= KRAKEN_BOSS.TENT_HERO_R) broadcastMobHit(r.id, heroDmg, who);
    }
    warshipFx.splashes.push({ x: tg.x, y: zsWaterYAt(tg.x, tg.z), z: tg.z, t0: performance.now() });
    const g = distanceGain(Math.hypot(hero.x - tg.x, hero.z - tg.z));
    if (g > 0.01 && heroDmg > 0) audioManager.playWorld('cannon', g * 0.8);
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1), now = Date.now(), K = zsKraken.s, hero = heroRef.current, t = state.clock.elapsedTime, S = st.current;
    const waterY = zsWaterYAt(K.x, K.z);
    const my = shipRef.current, me = meId(), net = useNet.getState(), hb = warshipHalfBeam();
    // ═══ CONVIDADO: espelha o anfitrião ═══
    if (isGuestInRoom()) {
      const nk = performance.now() - netKraken.at < 3000 ? netKraken.k : null;
      if (!nk) { if (K.phase !== 'sleep') Object.assign(K, newKraken()); spawns.list = []; }
      else {
        K.phase = PHASE_OF[nk.ph] ?? 'sleep'; K.riseT = nk.rt * KRAKEN_BOSS.RISE_S; K.sinkT = nk.sk * KRAKEN_BOSS.SINK_S; K.bodyOut = nk.bo === 1; K.moving = nk.mv === 1;
        const kk = Math.min(1, dt * 4), jump = Math.hypot(nk.x - K.x, nk.z - K.z) > 60;
        K.x = jump ? nk.x : K.x + (nk.x - K.x) * kk; K.z = jump ? nk.z : K.z + (nk.z - K.z) * kk;
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
        const byId = new Map(spawns.list.map((b) => [b.id, b]));
        spawns.list = (nk.b ?? []).map((n) => {
          const b = byId.get(n.i) ?? { id: n.i, owner: n.o, u: n.u, v: n.v, climb: n.c, atkT: 0, side: (n.u >= 0 ? 1 : -1) as 1 | -1, act: 'climb' as Boarder['act'] };
          const k2 = Math.min(1, dt * 6); b.u += (n.u - b.u) * k2; b.v += (n.v - b.v) * k2; b.climb = n.c; b.act = ACT_BACK[n.a] ?? 'idle';
          return b;
        });
      }
    } else {
      // ═══ SOLO / ANFITRIÃO: simula ═══
      const ships = currentShips(my);
      const heroes: KrakenHero[] = [{ id: me, x: hero.x, z: hero.z, inWater: hero.y <= zsWaterYAt(hero.x, hero.z) + 1.2 }];
      if (net.connected) for (const r of Object.values(net.players)) {
        if (r.hp > 0) heroes.push({ id: r.id, x: r.x, z: r.z, inWater: Number.isFinite(r.y) ? (r.y as number) <= zsWaterYAt(r.x, r.z) + 1.2 : false });
      }
      const ns = nearestShip(ships, hb, K);
      const swimD = Math.min(...heroes.filter((h) => h.inWater).map((h) => Math.hypot(h.x - K.x, h.z - K.z)), Infinity);
      const prev = K.phase;
      // acorda só com NAVIO (luta de navio); fica acordado com navio ou alguém nadando por perto
      krakenPhaseStep(K, now, dt, K.phase === 'sleep' ? (ns?.d ?? Infinity) : Math.min(ns?.d ?? Infinity, swimD));
      const near = (d: number = KRAKEN_BOSS.SLEEP_R) => !!ns && ns.d < d && ns.ship.owner === me;
      if (prev !== K.phase) {
        if (K.phase === 'rise') {
          dropCreatures();
          const fresh = Array.from({ length: KRAKEN_BOSS.TENTACLES }, (_, i) => krakenCreature(krakenTentId(i), 'Tentáculo do Kraken', KRAKEN_BOSS.TENT_HP, KRAKEN_BOSS.TENT_ARMOR, tentacleBase(i, K)));
          // TUBARÕES vêm junto: rondam ele; navio perto = rondam o casco do navio e mordem
          const def = CREATURES['shark'];
          if (def) for (let i = 0; i < KRAKEN_BOSS.SHARKS; i++) {
            for (let k = 0; k < 40; k++) {
              const a = Math.random() * Math.PI * 2, r = 60 + Math.random() * 40, x = K.x + Math.sin(a) * r, z = K.z + Math.cos(a) * r;
              if (!sharkSwim(x, z)) continue;
              const id = `${FLEET_SHARK_PREFIX}k${++spawns.seq}`, off = i / KRAKEN_BOSS.SHARKS;
              fresh.push({ id, speciesId: 'shark', name: def.name, hp: def.maxHp, maxHp: def.maxHp, attackPower: def.attackPower, armor: def.armor, attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x, z }, behavior: 'patrol', lootTable: [], respawnAt: null });
              spawns.sharkIds.push(id);
              creatureLure.set(id, (tt) => {
                const kk = zsKraken.s, hb2 = warshipHalfBeam(), n2 = nearestShip(currentShips(shipRef.current), hb2, kk);
                const tgt = n2 && n2.d < KRAKEN_BOSS.PULL_R ? shipOf(n2.ship.owner, shipRef.current) : null;
                if (tgt) { const ring = hullRingLen(hb2, WARSHIP.LENGTH, BOARD.SHARK_RING_GAP), q = hullRing(off * ring + tt * BOARD.SHARK_RING_SPEED, hb2, WARSHIP.LENGTH, BOARD.SHARK_RING_GAP); return warshipWorld(tgt, q.u, q.v); }
                const a2 = off * Math.PI * 2 + tt * 0.06;
                return { x: kk.x + Math.sin(a2) * 70, z: kk.z + Math.cos(a2) * 70 };
              });
              break;
            }
          }
          useGameStore.setState((s) => ({ creatures: [...s.creatures.filter((c) => !isKrakenBoss(c.id)), ...fresh] }));
          if (near()) useGameStore.getState().setMessage('🐙 O KRAKEN DAS CAGARRAS acordou! Corte os 6 tentáculos (canhão/fuzil) — o REDEMOINHO puxa o navio pra ele: não fique perto!');
        }
        if (K.phase === 'sleep') {
          dropCreatures();
          if (prev === 'sink' && near(KRAKEN_BOSS.SLEEP_R * 2)) useGameStore.getState().setMessage('🐙 O Kraken voltou inteiro pro covil nas Cagarras.');
        }
      }
      if (K.phase === 'fight' || K.phase === 'hunt') {
        const crs = useGameStore.getState().creatures;
        // tentáculo cortado (a vida está na store: canhão/fuzil de qualquer um) → sobem 1–2 CRIAS no navio mais perto
        for (const tn of K.tents) {
          if (!tn.alive) continue;
          const c = crs.find((q) => q.id === krakenTentId(tn.i));
          if (c && c.behavior !== 'dead') continue;
          tn.alive = false; tn.diedAt = now; tn.slam = null;
          const b = tentacleBase(tn.i, K), ts = nearestShip(ships, hb, b), shp = ts && ts.d < 260 ? shipOf(ts.ship.owner, my) : null;
          const n = shp ? spawnCount(spawns.list.length, Math.random) : 0;
          const def = CREATURES['raider_kraken']!, hp = Math.round(def.maxHp * KRAKEN_BOSS.SPAWN_HP_K), fresh: CreatureState[] = [];
          for (let i = 0; i < n && shp && ts; i++) {
            const id = `${KRAKEN_SPAWN_PREFIX}${++spawns.seq}`, bd = newBoarder(id, ts.ship.owner, shp, b, hb, WARSHIP.LENGTH, Math.random);
            bd.climb = -0.4 * i; // a 2ª sobe logo depois
            spawns.list.push(bd);
            fresh.push(krakenCreature(id, 'Cria do Kraken', hp, def.armor, warshipWorld(shp, bd.u, bd.v), KRAKEN_BOSS.SPAWN_ATK_K));
          }
          if (fresh.length) useGameStore.setState((s) => ({ creatures: [...s.creatures, ...fresh] }));
          const cut = K.tents.filter((x) => !x.alive).length;
          if (near()) useGameStore.getState().setMessage(`🐙 Tentáculo cortado! (${cut}/6)${fresh.length && ts?.ship.owner === me ? ` — ${fresh.length === 1 ? 'uma CRIA subiu' : 'duas CRIAS subiram'} no seu navio!` : ''}`);
        }
        if (allTentaclesCut(K) && !K.bodyOut) {
          K.bodyOut = true; K.phase = 'hunt';
          useGameStore.setState((s) => ({ creatures: [...s.creatures.filter((c) => c.id !== KRAKEN_BODY_ID), krakenCreature(KRAKEN_BODY_ID, 'Kraken das Cagarras', KRAKEN_BOSS.BODY_HP, KRAKEN_BOSS.BODY_ARMOR, K)] }));
          if (near()) useGameStore.getState().setMessage('🐙 Os tentáculos caíram — o KRAKEN SAIU do covil e vem atrás de você! Seu navio é só um pouco mais rápido.');
        }
        // chicotadas
        for (const tn of K.tents) {
          const b = tentacleBase(tn.i, K);
          const hit = tentacleStep(tn, dt, () => tentacleTarget(b, ships, heroes, hb));
          if (hit) applyHit(hit, KRAKEN_BOSS.TENT_SHIP_DMG, KRAKEN_BOSS.TENT_HERO_DMG, 'Tentáculo do Kraken');
        }
        // SAIU DO COVIL: anda atrás do navio mais perto, bate no que chegar perto; despistado = afunda e volta inteiro
        if (K.phase === 'hunt') {
          const bodyC = useGameStore.getState().creatures.find((q) => q.id === KRAKEN_BODY_ID); // a lista DE AGORA (pode ter acabado de entrar)
          if (!bodyC || bodyC.behavior === 'dead') {
            K.phase = 'dead'; K.nextAt = now + KRAKEN_BOSS.RESPAWN_MS; K.bodyAct = 'death'; K.moving = false; S.removeAt = now + 7000;
            if (near()) useGameStore.getState().setMessage('🏆 O KRAKEN DAS CAGARRAS caiu! (volta em 20 min)');
          } else if (!ns || krakenGaveUp(ns.d)) {
            K.phase = 'sink'; K.sinkT = 0; K.moving = false;
            useGameStore.setState((s) => ({ creatures: s.creatures.filter((c) => c.id !== KRAKEN_BODY_ID) }));
            if (near(KRAKEN_BOSS.SLEEP_R * 2)) useGameStore.getState().setMessage('🐙 Você despistou o Kraken — ele afundou e volta INTEIRO pro covil.');
          } else {
            krakenWalk(K, ns.ship, ns.d, dt, canStand);
            K.bodyReload -= dt;
            if (K.bodyReload <= 0 && ns.d <= KRAKEN_BOSS.BODY_REACH) {
              K.bodyReload = KRAKEN_BOSS.BODY_SLAM_S; K.bodyAct = 'attack'; K.bodyActT = 1.4;
              const q = { kind: 'ship', owner: ns.ship.owner, ...hullNearestPoint(ns.ship, K, hb) };
              window.setTimeout(() => { if (zsKraken.s.phase === 'hunt') applyHit(q, KRAKEN_BOSS.BODY_SHIP_DMG, KRAKEN_BOSS.BODY_HERO_DMG, 'Pancada do Kraken'); }, 700); // morreu/afundou no meio do golpe: não bate
            }
          }
        }
        if (K.bodyAct === 'attack' && (K.bodyActT -= dt) <= 0) K.bodyAct = 'idle';
        // de longe: PEDRA no navio mais perto (a salva de sempre: os outros desenham, o anfitrião aplica)
        K.rockReload -= dt;
        if ((K.phase === 'fight' || K.phase === 'hunt') && K.rockReload <= 0 && ns && ns.d >= KRAKEN_BOSS.ROCK_MIN && ns.d <= KRAKEN_BOSS.ROCK_RANGE) {
          K.rockReload = KRAKEN_BOSS.ROCK_S;
          const oy = waterY + KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K) * 0.8;
          const aim = { x: ns.ship.x, z: ns.ship.z }, d = Math.hypot(aim.x - K.x, aim.z - K.z), el = elevationFor(d, oy - waterY);
          if (el !== null) {
            const az = Math.atan2(aim.x - K.x, aim.z - K.z), hs = Math.cos(el) * WARSHIP.BALL_SPEED;
            const ball: CannonBall = { ox: K.x + Math.sin(az) * KRAKEN_BOSS.BODY_R, oy, oz: K.z + Math.cos(az) * KRAKEN_BOSS.BODY_R, vx: Math.sin(az) * hs, vy: Math.sin(el) * WARSHIP.BALL_SPEED, vz: Math.cos(az) * hs };
            const land = ballLanding(ball, surfaceAt);
            warshipFx.balls.push({ b: ball, t0: performance.now(), land, hit: false, enemy: 'kraken' });
            broadcastCannon([[ball.ox, ball.oy, ball.oz, ball.vx, ball.vy, ball.vz]], [[land.x, land.y, land.z, land.t]], 0);
            if (K.bodyAct !== 'attack') { K.bodyAct = 'attack'; K.bodyActT = 0.9; }
          }
        }
        // tubarões dele colados no casco do navio mais perto: mordem o navio
        if (ns && ns.d < KRAKEN_BOSS.PULL_R) {
          const shp = shipOf(ns.ship.owner, my);
          for (const id of spawns.sharkIds) {
            const c = crs.find((q) => q.id === id), a = creatureAnchors.get(id);
            if (!shp || !c || c.behavior === 'dead' || !nearWarshipHull(shp, a?.x ?? c.position.x, a?.z ?? c.position.z, hb, BOARD.SHARK_BITE_R)) continue;
            if (now - (S.lastBite.get(id) ?? 0) < BOARD.SHARK_BITE_S * 1000) continue;
            S.lastBite.set(id, now);
            applyHit({ kind: 'ship', owner: ns.ship.owner, x: a?.x ?? c.position.x, z: a?.z ?? c.position.z }, BOARD.SHARK_BITE, 0, 'Tubarão do Kraken');
          }
        }
      }
      if (K.phase === 'dead' && S.removeAt && now >= S.removeAt) { S.removeAt = 0; dropCreatures(); }
      // CRIAS no convés: sobem, andam até quem está no convés daquele navio e batem
      if (spawns.list.length) {
        const crs = useGameStore.getState().creatures, gone: string[] = [];
        for (const b of spawns.list) {
          const sh = shipOf(b.owner, my), c = crs.find((q) => q.id === b.id);
          if (!sh || !c) { gone.push(b.id); continue; }
          if (c.behavior === 'dead') { const d0 = S.deadAt.get(b.id) ?? now; S.deadAt.set(b.id, d0); if (now - d0 > 4000) gone.push(b.id); continue; }
          const meOwner = b.owner === me, r = meOwner ? null : net.players[b.owner];
          const pos = meOwner ? { x: hero.x, z: hero.z, y: hero.y } : r && r.hp > 0 ? { x: r.x, z: r.z, y: Number.isFinite(r.y) ? (r.y as number) : 99 } : null;
          const onDeck = !!pos && nearWarshipHull(sh, pos.x, pos.z, hb, 0.3) && pos.y > zsWaterYAt(pos.x, pos.z) + 1;
          if (boarderStep(b, onDeck ? warshipLocal(sh, pos!.x, pos!.z) : null, dt, hb, WARSHIP.LENGTH)) {
            const w = warshipWorld(sh, b.u, b.v);
            if (meOwner) hurtPlayerBy('Cria do Kraken', c.attackPower, w, (dmg, hp, max) => `🐙 Cria do Kraken! -${dmg} HP (${hp}/${max})`);
            else broadcastMobHit(b.owner, c.attackPower, 'Cria do Kraken');
          }
        }
        if (gone.length) {
          const gs = new Set(gone);
          spawns.list = spawns.list.filter((b) => !gs.has(b.id));
          for (const id of gone) { S.deadAt.delete(id); creatureAnchors.delete(id); }
          useGameStore.setState((s) => ({ creatures: s.creatures.filter((c) => !gs.has(c.id)) }));
        }
      }
      // olha pro navio mais perto
      if (ns && K.phase !== 'dead') { const want = Math.atan2(ns.ship.x - K.x, ns.ship.z - K.z); let dy = want - K.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; K.yaw += dy * Math.min(1, dt * 0.8); }
      // a posição do corpo e das crias na store acompanha (canhão de quem está na sala, rede) ~3×/s
      S.posAcc += dt;
      if (S.posAcc > 0.33 && (K.bodyOut || spawns.list.length)) {
        S.posAcc = 0;
        const at = new Map<string, { x: number; z: number }>();
        if (K.bodyOut) at.set(KRAKEN_BODY_ID, { x: K.x, z: K.z });
        for (const b of spawns.list) { const sh = shipOf(b.owner, my); if (sh) at.set(b.id, warshipWorld(sh, b.u, b.v)); }
        useGameStore.setState((s) => ({ creatures: s.creatures.map((c) => { const p = at.get(c.id); return p ? { ...c, position: { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 } } : c; }) }));
      }
      // a SALA vê o mesmo (~4×/s)
      S.netAcc += dt;
      if (net.connected && S.netAcc > 0.25 && (K.phase !== 'sleep' || prev !== 'sleep' || spawns.list.length)) {
        S.netAcc = 0;
        const r1 = (v: number) => Math.round(v * 10) / 10;
        broadcastKraken({
          ph: PHASE_OF.indexOf(K.phase) as NetKraken['ph'], rt: Math.round(Math.min(1, K.riseT / KRAKEN_BOSS.RISE_S) * 100) / 100, sk: Math.round(Math.min(1, K.sinkT / KRAKEN_BOSS.SINK_S) * 100) / 100,
          x: r1(K.x), z: r1(K.z), mv: K.moving ? 1 : 0, y: Math.round(K.yaw * 100) / 100, bo: K.bodyOut ? 1 : 0, a: K.bodyAct === 'attack' ? 1 : K.bodyAct === 'death' ? 2 : 0,
          t: K.tents.map((tn) => (tn.alive ? 1 : 0)), s: K.tents.map((tn) => (tn.slam ? [r1(tn.slam.x), r1(tn.slam.z), r1(tn.slam.age)] as [number, number, number] : null)),
          b: spawns.list.map((b) => ({ i: b.id, o: b.owner, u: r1(b.u), v: r1(b.v), c: Math.round(Math.max(0, b.climb) * 100) / 100, a: ACT[b.act] })),
        });
      }
    }
    const r0 = rosterOf();
    if (r0 !== roster) setRoster(r0);

    // ═══ REDEMOINHO puxa o MEU navio (cada um aplica no seu — o mundo move junto quem está no convés) ═══
    if (my && whirlpoolOn(K.phase) && my.sinkT === null) { const v = whirlpoolPull(K, my); warshipDrift.x = v.x; warshipDrift.z = v.z; }
    else { warshipDrift.x = 0; warshipDrift.z = 0; }

    // ═══ DESENHO (todos) ═══
    const cam = state.camera, far = Math.hypot(cam.position.x - K.x, cam.position.z - K.z) > KRAKEN_DRAW_M;
    const up = K.phase === 'sleep' || far ? 0 : K.phase === 'rise' ? Math.min(1, K.riseT / KRAKEN_BOSS.RISE_S) : K.phase === 'sink' ? Math.max(0, 1 - K.sinkT / KRAKEN_BOSS.SINK_S) : 1;
    S.rise += (up - S.rise) * Math.min(1, dt * (K.phase === 'sink' ? 6 : 2));
    const sink = (1 - S.rise) * (KRAKEN_BOSS.BODY_H * 0.6);
    const visible = S.rise > 0.01 && !far;
    const outH = KRAKEN_BOSS.BODY_H * (1 - KRAKEN_BOSS.SUBMERGED_K);
    const g = body.current;
    const deadSink = K.phase === 'dead' ? Math.min(1, (7000 - Math.max(0, S.removeAt - now)) / 7000) * outH * 1.1 : 0;
    if (g) {
      g.visible = visible;
      g.position.set(K.x, waterY - KRAKEN_BOSS.BODY_H * KRAKEN_BOSS.SUBMERGED_K - sink - deadSink + Math.sin(t * 0.5) * 0.6, K.z);
      g.rotation.y = K.yaw;
      bodyAction.current = K.bodyAct === 'death' || K.phase === 'dead' ? 'death' : K.bodyAct === 'attack' ? 'attack' : K.moving ? 'walk' : 'idle';
    }
    // água turva + redemoinho (com ele acordado)
    water.g.visible = visible && K.phase !== 'dead';
    water.g.position.set(K.x, waterY + 0.25, K.z);
    water.whirl.visible = whirlpoolOn(K.phase);
    water.whirl.rotation.z = -t * 0.35;
    (water.whirl.material as THREE.MeshBasicMaterial).opacity = 0.8 * S.rise;
    (water.murk.material as THREE.MeshBasicMaterial).opacity = Math.min(1, S.rise * 1.2);
    // corpo: alvo e bala só exposto (protegido = a bala estoura nele sem dano)
    const bodyCr = K.bodyOut ? useGameStore.getState().creatures.find((c) => c.id === KRAKEN_BODY_ID) : undefined;
    const bodyAlive = !!bodyCr && bodyCr.behavior !== 'dead' && visible;
    creatureAnchors.set(KRAKEN_BODY_ID, { x: K.x, y: waterY, z: K.z, top: outH - sink, alive: bodyAlive, r: KRAKEN_BOSS.BODY_R });
    krakenShapes.body = visible && K.phase !== 'dead' ? { x: K.x, z: K.z, y0: waterY - 4, y1: waterY + outH - sink, r: KRAKEN_BOSS.BODY_R * 0.8, id: bodyAlive ? KRAKEN_BODY_ID : '' } : null;
    bodyBar.group.position.set(K.x, waterY + outH + 6 - sink, K.z);
    bodyBar.set(bodyCr ? bodyCr.hp / bodyCr.maxHp : 0, bodyAlive, cam);
    // tentáculos (e as formas pra bala)
    const crs = useGameStore.getState().creatures, segs: typeof krakenShapes.segs = [];
    for (const tn of K.tents) {
      const b = tentacleBase(tn.i, K), id = krakenTentId(tn.i);
      const out = Math.atan2(b.x - K.x, b.z - K.z);
      const deadK = tn.alive ? 0 : tn.diedAt ? Math.min(1, (now - tn.diedAt) / 2500) : 1;
      const show = visible && deadK < 1;
      let lean = 0, az = out;
      if (tn.slam) { lean = slamLean(tn.slam.age); az = Math.atan2(tn.slam.x - b.x, tn.slam.z - b.z); }
      tmp.p.set(b.x, waterY - 8 - sink - deadK * KRAKEN_BOSS.TENT_LEN, b.z);
      const c = crs.find((q) => q.id === id), aliveC = !!c && c.behavior !== 'dead' && tn.alive;
      for (let k = 0; k < SEG; k++) {
        const idx = tn.i * SEG + k;
        if (!show) { tent.setMatrixAt(idx, tmp.zero); continue; }
        const f = k / SEG;
        // em pé balançando com a ponta enrolando pra fora; na chicotada, inclina pro alvo (base menos, ponta mais)
        const curl = tn.slam ? 0 : (0.1 + 0.8 * f * f) * (0.7 + 0.3 * Math.sin(t * 0.8 + tn.i * 1.7));
        const theta = lean * Math.min(1, 0.45 + 0.8 * f) + curl + 0.05 * Math.sin(t * 1.3 + k * 0.5 + tn.i);
        const a = az + 0.2 * Math.sin(t * 0.9 + k * 0.35 + tn.i * 2.1) * (tn.slam ? 0.3 : 1);
        tmp.d.set(Math.sin(theta) * Math.sin(a), Math.cos(theta), Math.sin(theta) * Math.cos(a)).normalize();
        tmp.q.setFromUnitVectors(tmp.up, tmp.d);
        const r = KRAKEN_BOSS.TENT_R * (1 - f * 0.85);
        tmp.s.set(r, SEG_LEN * 1.1, r);
        tmp.m.compose(tmp.p, tmp.q, tmp.s);
        tent.setMatrixAt(idx, tmp.m);
        // forma pra bala: o meio do gomo (vale acima e um pouco abaixo d'água)
        if (aliveC && tmp.p.y + tmp.d.y * SEG_LEN * 0.5 > waterY - 3) segs.push({ x: tmp.p.x + tmp.d.x * SEG_LEN * 0.5, y: tmp.p.y + tmp.d.y * SEG_LEN * 0.5, z: tmp.p.z + tmp.d.z * SEG_LEN * 0.5, r: Math.max(r, SEG_LEN * 0.5) + 1.5, id });
        tmp.p.addScaledVector(tmp.d, SEG_LEN);
      }
      creatureAnchors.set(id, { x: b.x, y: waterY, z: b.z, top: 30, alive: aliveC && show && K.phase === 'fight', r: KRAKEN_BOSS.TENT_R });
      const bar = tentBars[tn.i]!;
      bar.group.position.set(b.x, waterY + 34 - sink, b.z);
      bar.set(c ? c.hp / c.maxHp : 0, aliveC && show && !!c && c.hp < c.maxHp, cam);
    }
    krakenShapes.segs = segs;
    tent.instanceMatrix.needsUpdate = true;
    tent.visible = visible;
  });

  return (
    <>
      <primitive object={tent} />
      <primitive object={water.g} />
      <group ref={body} visible={false}>
        <Suspense fallback={null}>
          <GlbHeroMixamo charUrl={mx.url} actionRef={bodyAction} autoHeight={KRAKEN_BOSS.BODY_H} standFixX={mx.standFixX} bindFix deathClip={mx.death ?? 'back'} {...mixClipProps(mx.clips)} />
        </Suspense>
      </group>
      <primitive object={bodyBar.group} />
      {tentBars.map((b, i) => <primitive key={i} object={b.group} />)}
      {roster && spawns.list.map((b) => <BoarderBody key={b.id} b={b} shipRef={shipRef} heroRef={heroRef} />)}
    </>
  );
}
