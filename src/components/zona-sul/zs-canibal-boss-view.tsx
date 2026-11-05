/**
 * CANIBAL GIGANTE DO COVIL — desenho + simulação (04/11). Regras em zs-canibal-boss.ts.
 *  - O CORPO (o Canibal do pack Meshy, ~110 m) sai do BURACO no meio da arena da cintura pra cima; o buraco é um disco
 *    escuro no chão. As 6 RAÍZES (gomos instanciados = 1 desenho) saem do chão em volta e chicoteiam quem chega perto.
 *  - Anfitrião (ou solo) simula: fases, alvos, chicotadas, pancada do corpo, dano em todos (no MEU herói direto; nos
 *    outros pela rede — mob-hit), agarrão e empurrão no meu herói. Convidado espelha (`canibal` ~4×/s).
 *  - Corpo e raízes são bichos da store (armadura altíssima — a bazuca atravessa), na camada da CAVERNA (só quem está lá
 *    embaixo alcança), com o raio do corpo registrado pra explosão (bigCreatureRadius).
 *  - Barra do chefe na tela e o tema de chefe com o herói no covil. Desenha só com o herói no FUNDO da caverna.
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
import { audioManager } from '@/game/audio/audio-manager';
import { broadcastCanibal, broadcastMobHit, isGuestInRoom, netCanibal, useNet, type NetCanibal } from '@/net/multiplayer';
import { setCreatureLayer } from '@/game/systems/layerSystem';
import { setBigCreatureRadius } from '@/game/systems/bigCreatureRadius';
import { queueKnockback } from '@/game/systems/knockbackSystem';
import { activeGrab, grabTicksDue, startHold } from '@/game/systems/grabSystem';
import {
  CANIBAL, CANIBAL_AT, CANIBAL_BODY_ID, CANIBAL_CRIA_PREFIX, canibalPhaseStep, canibalRootId, criaCount, nearestInArena, newCanibal, pushAway, rootBase,
  rootLean, rootStep, rootTarget, slamHits, zsCanibal, type CanibalPhase,
} from './zs-canibal-boss';
import { setBossBarFor, zsCave } from './zs-context';

const SEG = 10, SEG_LEN = CANIBAL.ROOT_LEN / SEG;
/** BRILHO PRÓPRIO do gigante (a luz da brasa fica no meio da arena — dentro do corpo — e ele virava silhueta preta):
 *  cópia SÓ dele do material, com a própria textura brilhando de leve (os canibais pequenos do mapa não mudam) */
export const CANIBAL_SELF_GLOW = 0.4;
const PHASES: CanibalPhase[] = ['sleep', 'rise', 'fight', 'dead'];
/** perto o bastante pra barra/tema/desenho (m do centro) */
const NEAR_M = 140;
const meId = () => useNet.getState().selfId || 'eu';

function bossCreature(id: string, name: string, hp: number, at: { x: number; z: number }): CreatureState {
  const def = CREATURES['raider_cannibal']!;
  return { id, speciesId: def.id, name, hp, maxHp: hp, attackPower: def.attackPower, armor: CANIBAL.ARMOR, attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: Math.round(at.x * 10) / 10, z: Math.round(at.z * 10) / 10 }, behavior: 'patrol', lootTable: [], respawnAt: null };
}
/** buraco: escuro no meio, a borda some no chão */
function makePitTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d')!, gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(2,1,1,1)'); gr.addColorStop(0.62, 'rgba(8,3,2,0.97)'); gr.addColorStop(0.82, 'rgba(40,14,8,0.55)'); gr.addColorStop(1, 'rgba(40,14,8,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function ZsCanibalBoss({ heroRef }: { heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const body = useRef<THREE.Group>(null);
  const bodyAction = useRef<HeroAction>('idle');
  const mx = MIXAMO_RAIDER['raider_cannibal']!;
  const roots = useMemo(() => {
    const geo = new THREE.CylinderGeometry(0.75, 1, 1, 9, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: '#3b2619', roughness: 0.92, metalness: 0, emissive: '#3a0a02', emissiveIntensity: 0.35 });
    const mesh = new THREE.InstancedMesh(geo, mat, CANIBAL.ROOTS * SEG);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false; mesh.castShadow = true; mesh.visible = false;
    return mesh;
  }, []);
  const pit = useMemo(() => {
    const tx = makePitTexture();
    const m = new THREE.Mesh(new THREE.CircleGeometry(CANIBAL.PIT_R * 1.35, 48), new THREE.MeshBasicMaterial({ map: tx, transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.set(CANIBAL_AT.x, CANIBAL_AT.floor + 0.08, CANIBAL_AT.z); m.renderOrder = 2; m.visible = false;
    return { m, tx };
  }, []);
  const tmp = useMemo(() => ({ m: new THREE.Matrix4(), q: new THREE.Quaternion(), p: new THREE.Vector3(), s: new THREE.Vector3(), d: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), zero: new THREE.Matrix4().makeScale(0, 0, 0) }), []);
  const st = useRef({ rise: 0, netAcc: 0, layerAcc: 1, removeAt: 0, lastPhase: 'sleep' as CanibalPhase, holdBy: '' });
  const litMats = useRef<THREE.Material[]>([]);
  useEffect(() => () => {
    roots.geometry.dispose(); (roots.material as THREE.Material).dispose();
    pit.m.geometry.dispose(); (pit.m.material as THREE.Material).dispose(); pit.tx.dispose();
    audioManager.setBossMusic(false, 'canibal'); setBossBarFor(CANIBAL.NAME, null);
    setBigCreatureRadius(CANIBAL_BODY_ID, null);
    for (const m of litMats.current) m.dispose();
  }, [roots, pit]);

  /** dano de uma chicotada/pancada em todos no raio — o MEU herói direto (empurrão, agarrão), os outros pela rede */
  const strike = (x: number, z: number, r: number, dmg: number, push: number, who: string, grabBy: string | null) => {
    const hero = heroRef.current, net = useNet.getState();
    if (Math.hypot(hero.x - x, hero.z - z) <= r && hero.y < CANIBAL.WAKE_BELOW + 20) {
      hurtPlayerBy(who, dmg, { x, z }, (d, hp, max) => `🪵 ${who}! -${d} HP (${hp}/${max})`);
      const pv = pushAway(x, z, hero.x, hero.z, push);
      if (grabBy && Math.random() < CANIBAL.GRAB_CHANCE && startHold(grabBy, CANIBAL.GRAB_MS, CANIBAL.GRAB_TICKS, CANIBAL.GRAB_DMG / CANIBAL.GRAB_TICKS)) {
        st.current.holdBy = grabBy;
        useGameStore.getState().setMessage('🌿 Uma RAIZ do Canibal te AGARROU! Acerte a raiz pra se soltar!');
      } else queueKnockback('player', pv.x, pv.z);
    }
    if (net.connected) for (const p of Object.values(net.players)) {
      if (p.hp > 0 && Math.hypot(p.x - x, p.z - z) <= r && (!Number.isFinite(p.y) || (p.y as number) < CANIBAL.WAKE_BELOW + 20)) broadcastMobHit(p.id, dmg, who);
    }
  };

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, 0.1), now = Date.now(), C = zsCanibal.s, S = st.current, hero = heroRef.current, t = state.clock.elapsedTime;
    const me = meId(), net = useNet.getState();
    const heroDist = Math.hypot(hero.x - CANIBAL_AT.x, hero.z - CANIBAL_AT.z);
    const heroDown = hero.y < CANIBAL.WAKE_BELOW + 20;
    if (isGuestInRoom()) {
      // ═══ CONVIDADO: espelha o anfitrião ═══
      const nc = performance.now() - netCanibal.at < 3000 ? netCanibal.c : null;
      if (!nc) { if (C.phase !== 'sleep') Object.assign(C, newCanibal()); }
      else {
        C.phase = PHASES[nc.ph] ?? 'sleep'; C.riseT = nc.rt * CANIBAL.RISE_S;
        C.bodyAct = nc.a === 1 ? 'attack' : nc.a === 2 ? 'death' : 'idle';
        C.roots.forEach((r, i) => {
          const alive = nc.r[i] === 1;
          if (r.alive && !alive) r.diedAt = now;
          r.alive = alive;
          const sl = nc.s[i];
          if (!sl) r.slam = null;
          else if (!r.slam || Math.hypot(r.slam.tx - sl[0], r.slam.tz - sl[1]) > 0.5) r.slam = { tx: sl[0], tz: sl[1], age: sl[2], hit: true };
          else r.slam.age += dt;
        });
      }
    } else {
      // ═══ SOLO / ANFITRIÃO: simula ═══
      const heroes: { id: string; x: number; y: number; z: number }[] = [{ id: me, x: hero.x, y: hero.y, z: hero.z }];
      if (net.connected) for (const p of Object.values(net.players)) if (p.hp > 0 && Number.isFinite(p.y)) heroes.push({ id: p.id, x: p.x, y: p.y as number, z: p.z });
      const down = heroes.filter((h) => h.y < CANIBAL.WAKE_BELOW + 20);
      const prev = C.phase;
      canibalPhaseStep(C, now, dt, nearestInArena(heroes));
      const store = useGameStore.getState();
      if (prev !== C.phase) {
        if (C.phase === 'rise') {
          // nasce o corpo e as raízes na store (vida cheia)
          const fresh: CreatureState[] = [bossCreature(CANIBAL_BODY_ID, CANIBAL.NAME, CANIBAL.BODY_HP, CANIBAL_AT)];
          for (let i = 0; i < CANIBAL.ROOTS; i++) fresh.push(bossCreature(canibalRootId(i), 'Raiz do Canibal', CANIBAL.ROOT_HP, rootBase(i)));
          useGameStore.setState((s) => ({ creatures: [...s.creatures.filter((c) => !c.id.startsWith('zs_canibal_')), ...fresh] }));
          if (heroDist < NEAR_M) store.setMessage(`👹 O CANIBAL GIGANTE saiu do buraco! (recomendado nível ${CANIBAL.REC_LEVEL}+ — só a BAZUCA fura a pele dele; em grupo, menos)`);
        }
        if (C.phase === 'sleep') useGameStore.setState((s) => ({ creatures: s.creatures.filter((c) => !c.id.startsWith('zs_canibal_') && !c.id.startsWith(CANIBAL_CRIA_PREFIX)) }));
      }
      const crs = useGameStore.getState().creatures;
      const bodyCr = crs.find((c) => c.id === CANIBAL_BODY_ID);
      if (C.phase === 'fight' || C.phase === 'rise') {
        // MORREU: o corpo zerou → fim (as raízes caem junto)
        if (bodyCr && bodyCr.behavior === 'dead') {
          C.phase = 'dead'; C.nextAt = now + CANIBAL.RESPAWN_MS; C.bodyAct = 'death'; S.removeAt = now + 9000;
          C.roots.forEach((r) => { if (r.alive) { r.alive = false; r.diedAt = now; } r.slam = null; });
          useGameStore.setState((s) => ({ creatures: s.creatures.map((c) => (c.id.startsWith('zs_canibal_r') && c.behavior !== 'dead' ? { ...c, hp: 0, behavior: 'dead' as const } : c)) }));
          if (heroDist < NEAR_M) store.setMessage('🏆 CANIBAL GIGANTE DERROTADO! O covil fica em silêncio… (volta em 20 min)');
        }
      }
      if (C.phase === 'fight') {
        // RAÍZES: cada viva escolhe o mais perto e chicoteia; cortada = cai
        for (const r of C.roots) {
          const cr = crs.find((c) => c.id === canibalRootId(r.i));
          if (r.alive && cr && cr.behavior === 'dead') {
            r.alive = false; r.diedAt = now; r.slam = null;
            // CRIAS: a raiz cortada solta canibais do buraco — cada vez mais (2, 3, 4 … até 6; teto de 12 vivas)
            const cut = C.roots.filter((q) => !q.alive).length;
            const alive = crs.filter((c) => c.id.startsWith(CANIBAL_CRIA_PREFIX) && c.behavior !== 'dead').length;
            const n = criaCount(cut, alive), def = CREATURES['raider_cannibal'];
            if (n > 0 && def) {
              const b = rootBase(r.i), fresh: CreatureState[] = [];
              for (let k = 0; k < n; k++) {
                const a = (k / n) * Math.PI * 2 + r.i, d = 5 + (k % 3) * 2.5, hp = Math.round(def.maxHp * CANIBAL.CRIA_HP_K);
                fresh.push({ id: `${CANIBAL_CRIA_PREFIX}${r.i}_${k}_${now}`, speciesId: def.id, name: 'Cria do Canibal', hp, maxHp: hp, attackPower: Math.round(def.attackPower * CANIBAL.CRIA_ATK_K), armor: def.armor, attackCooldown: def.attackCooldown, lastAttackAt: 0, position: { x: Math.round((b.x + Math.sin(a) * d) * 10) / 10, z: Math.round((b.z + Math.cos(a) * d) * 10) / 10 }, behavior: 'chase', lootTable: [], respawnAt: null });
              }
              useGameStore.setState((s) => ({ creatures: [...s.creatures, ...fresh] }));
              if (heroDist < NEAR_M) useGameStore.getState().setMessage(`🔪 Raiz cortada! ${n} crias do Canibal sobem do buraco! (${cut}/${CANIBAL.ROOTS})`);
            }
          }
          if (!r.alive) continue;
          if (!r.slam && now / 1000 >= r.nextAt) {
            const tg = rootTarget(r.i, down);
            if (tg) { r.slam = { tx: tg.x, tz: tg.z, age: 0, hit: false }; r.nextAt = now / 1000 + CANIBAL.SLAM_EVERY_S + Math.random() * 1.5; }
          }
          if (rootStep(r, dt) && r.slam) strike(r.slam.tx, r.slam.tz, CANIBAL.SLAM_R, CANIBAL.SLAM_DMG, CANIBAL.PUSH_M, 'Raiz do Canibal', canibalRootId(r.i));
        }
        // CORPO: pancada em quem chega perto (empurra longe)
        const close = down.some((h) => Math.hypot(h.x - CANIBAL_AT.x, h.z - CANIBAL_AT.z) <= CANIBAL.BODY_REACH);
        if (close && now >= C.bodyNextAt) {
          C.bodyNextAt = now + CANIBAL.BODY_SLAM_S * 1000; C.bodyAct = 'attack';
          window.setTimeout(() => {
            if (zsCanibal.s.phase !== 'fight') return;
            strike(CANIBAL_AT.x, CANIBAL_AT.z, CANIBAL.BODY_REACH, CANIBAL.BODY_DMG, CANIBAL.BODY_PUSH_M, CANIBAL.NAME, null);
          }, 700);
          window.setTimeout(() => { if (zsCanibal.s.bodyAct === 'attack') zsCanibal.s.bodyAct = 'idle'; }, 1400);
        }
      }
      if (C.phase === 'dead' && S.removeAt && now > S.removeAt) { S.removeAt = 0; useGameStore.setState((s) => ({ creatures: s.creatures.filter((c) => !c.id.startsWith('zs_canibal_')) })); }
      // manda pros convidados (~4×/s)
      S.netAcc += dt;
      if (net.connected && S.netAcc >= 0.25) {
        S.netAcc = 0;
        const r1 = (v: number) => Math.round(v * 10) / 10;
        broadcastCanibal({
          ph: PHASES.indexOf(C.phase) as NetCanibal['ph'], rt: Math.round(Math.min(1, C.riseT / CANIBAL.RISE_S) * 100) / 100,
          a: C.bodyAct === 'attack' ? 1 : C.bodyAct === 'death' ? 2 : 0,
          r: C.roots.map((r) => (r.alive ? 1 : 0)), s: C.roots.map((r) => (r.slam ? [r1(r.slam.tx), r1(r.slam.tz), r1(r.slam.age)] as [number, number, number] : null)),
        });
      }
    }

    // ═══ AGARRÃO: pancadas no MEU herói enquanto a raiz segura; no fim, é jogado longe ═══
    if (S.holdBy) {
      const n = grabTicksDue(S.holdBy);
      for (let k = 0; k < n; k++) hurtPlayerBy('Raiz do Canibal', CANIBAL.GRAB_DMG / CANIBAL.GRAB_TICKS, CANIBAL_AT, (d, hp, max) => `🌿 A raiz te esmaga! -${d} HP (${hp}/${max})`);
      if (!activeGrab()) { const pv = pushAway(CANIBAL_AT.x, CANIBAL_AT.z, hero.x, hero.z, CANIBAL.PUSH_M); queueKnockback('player', pv.x, pv.z); S.holdBy = ''; }
    }

    // ═══ PERTO (no covil, lá embaixo): barra na tela + tema de chefe ═══
    const awake = C.phase === 'rise' || C.phase === 'fight';
    const near = heroDown && heroDist < NEAR_M && zsCave.inCave;
    audioManager.setBossMusic(awake && near, 'canibal');
    if (awake && near) {
      const crs = useGameStore.getState().creatures, bc = crs.find((c) => c.id === CANIBAL_BODY_ID);
      const alive = C.roots.filter((r) => r.alive).length;
      setBossBarFor(CANIBAL.NAME, { name: CANIBAL.NAME, frac: bc && bc.behavior !== 'dead' ? Math.max(0, bc.hp / bc.maxHp) : 1, sub: `raízes ${alive}/${CANIBAL.ROOTS}` });
    } else setBossBarFor(CANIBAL.NAME, null);
    if (S.lastPhase !== 'dead' && C.phase === 'dead') audioManager.setBossMusic(false, 'canibal');
    S.lastPhase = C.phase;

    // ═══ CAMADA DA CAVERNA + raio do corpo (a cada 0,5 s) ═══
    S.layerAcc += dt;
    if (S.layerAcc >= 0.5) {
      S.layerAcc = 0;
      setCreatureLayer(CANIBAL_BODY_ID, 1);
      for (let i = 0; i < CANIBAL.ROOTS; i++) setCreatureLayer(canibalRootId(i), 1);
      setBigCreatureRadius(CANIBAL_BODY_ID, CANIBAL.BODY_R);
    }

    // ═══ DESENHO (só com o herói no fundo da caverna e perto) ═══
    const draw = zsCave.deep && heroDist < 260;
    const up = C.phase === 'sleep' || !draw ? 0 : C.phase === 'rise' ? Math.min(1, C.riseT / CANIBAL.RISE_S) : 1;
    S.rise += (up - S.rise) * Math.min(1, dt * 1.5);
    const visible = draw && S.rise > 0.01;
    const outH = CANIBAL.BODY_H * (1 - CANIBAL.SUBMERGED_K);
    const g = body.current;
    if (g && litMats.current.length === 0 && visible) {
      // 1ª vez com o modelo carregado: material próprio com brilho da textura (ver CANIBAL_SELF_GLOW)
      g.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        const src = mesh.material as THREE.MeshStandardMaterial;
        if (!src || Array.isArray(src) || !src.isMeshStandardMaterial) return;
        const mat = src.clone();
        mat.emissive = new THREE.Color('#ffffff'); mat.emissiveMap = src.map; mat.emissiveIntensity = CANIBAL_SELF_GLOW;
        mesh.material = mat; litMats.current.push(mat);
      });
    }
    if (g) {
      g.visible = visible;
      g.position.set(CANIBAL_AT.x, CANIBAL_AT.floor - CANIBAL.BODY_H * CANIBAL.SUBMERGED_K - (1 - S.rise) * outH * 1.1 + Math.sin(t * 0.6) * 0.4, CANIBAL_AT.z);
      // olha pro herói mais perto lá embaixo (sem girar de vez)
      const want = Math.atan2(hero.x - CANIBAL_AT.x, hero.z - CANIBAL_AT.z);
      let dy = want - C.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2;
      if (heroDown && heroDist < NEAR_M && C.phase === 'fight') C.yaw += dy * Math.min(1, dt * 0.8);
      g.rotation.y = C.yaw;
      bodyAction.current = C.bodyAct === 'death' || C.phase === 'dead' ? 'death' : C.bodyAct === 'attack' ? 'attack' : 'idle';
    }
    pit.m.visible = draw;
    const crsNow = useGameStore.getState().creatures;
    const bodyCr = crsNow.find((c) => c.id === CANIBAL_BODY_ID);
    creatureAnchors.set(CANIBAL_BODY_ID, { x: CANIBAL_AT.x, y: CANIBAL_AT.floor, z: CANIBAL_AT.z, top: outH * S.rise, alive: !!bodyCr && bodyCr.behavior !== 'dead' && visible, r: CANIBAL.BODY_R });
    // raízes (gomos): em pé balançando; na chicotada deitam no alvo; cortada afunda
    roots.visible = visible;
    for (const r of C.roots) {
      const b = rootBase(r.i), id = canibalRootId(r.i);
      const deadK = r.alive ? 0 : r.diedAt ? Math.min(1, (now - r.diedAt) / 2000) : 1;
      const show = visible && deadK < 1 && C.phase !== 'sleep';
      let lean = 0, az = Math.atan2(b.x - CANIBAL_AT.x, b.z - CANIBAL_AT.z);
      if (r.slam) { lean = rootLean(r.slam.age); az = Math.atan2(r.slam.tx - b.x, r.slam.tz - b.z); }
      if (S.holdBy === id && activeGrab()) { lean = 1; az = Math.atan2(hero.x - b.x, hero.z - b.z); }
      tmp.p.set(b.x, CANIBAL_AT.floor - 2 - deadK * CANIBAL.ROOT_LEN - (1 - S.rise) * CANIBAL.ROOT_LEN, b.z);
      for (let k = 0; k < SEG; k++) {
        const idx = r.i * SEG + k;
        if (!show) { roots.setMatrixAt(idx, tmp.zero); continue; }
        const f = k / SEG;
        const curl = r.slam ? 0 : (0.12 + 0.7 * f * f) * (0.7 + 0.3 * Math.sin(t * 0.7 + r.i * 1.9));
        const theta = lean * Math.min(1.35, 0.5 + 1.1 * f) + curl + 0.06 * Math.sin(t * 1.4 + k * 0.6 + r.i);
        const a = az + 0.22 * Math.sin(t * 0.8 + k * 0.4 + r.i * 2.3) * (r.slam ? 0.3 : 1);
        tmp.d.set(Math.sin(theta) * Math.sin(a), Math.cos(theta), Math.sin(theta) * Math.cos(a)).normalize();
        tmp.q.setFromUnitVectors(tmp.up, tmp.d);
        const rr = CANIBAL.ROOT_R * (1 - f * 0.8);
        tmp.s.set(rr, SEG_LEN * 1.1, rr);
        roots.setMatrixAt(idx, tmp.m.compose(tmp.p, tmp.q, tmp.s));
        tmp.p.addScaledVector(tmp.d, SEG_LEN);
      }
      const cr = crsNow.find((c) => c.id === id);
      creatureAnchors.set(id, { x: b.x, y: CANIBAL_AT.floor, z: b.z, top: CANIBAL.ROOT_LEN * 0.5, alive: !!cr && cr.behavior !== 'dead' && show, r: CANIBAL.ROOT_R + 1 });
    }
    roots.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <primitive object={pit.m} />
      <primitive object={roots} />
      <group ref={body} visible={false}>
        <Suspense fallback={null}>
          <GlbHeroMixamo charUrl={mx.url} actionRef={bodyAction} autoHeight={CANIBAL.BODY_H} standFixX={mx.standFixX} bindFix deathClip={mx.death ?? 'back'} {...mixClipProps(mx.clips)} />
        </Suspense>
      </group>
    </>
  );
}
