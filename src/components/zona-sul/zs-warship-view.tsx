/**
 * ZONA SUL — NAVIO DE GUERRA: o desenho (01/11). GLB do Pedro (navio "A": galeão com canhões no costado) compactado
 * 488 mil → 45 mil triângulos. Medido no modelo: a PROA aponta pro −Z (a ponta fina é o gurupés) → gira 180° pra frente
 * do jogo (+Z); o costado no meio fica a ~23% da altura (mastros inclusos). Calado 2 m: quilha 2 m abaixo d'água.
 * Também desenha as BALAS (arco com gravidade), o SPLASH onde caem (e aplica o dano em área no jogo) e a MIRA (arco + anel
 * de onde cai) enquanto o botão direito / mira está apertado.
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { acceleratedRaycast, computeBoundsTree } from 'three-mesh-bvh';
import { type ShipCollider, shipGround } from './zs-ship';
import { useGameStore } from '@/game/state/game-store';
import { broadcastFleetHit, broadcastShipHit, isGuestInRoom, netCannonInbox } from '@/net/multiplayer';
import { remoteDecks } from './zs-remote-vehicles';
import { audioManager, distanceGain } from '@/game/audio/audio-manager';
import { ballAt, type CannonBall, WARSHIP, warshipGone, warshipLocal, warshipWorld, type ZsWarship } from './zs-warship';
import { zsWaterYAt } from './zs-terrain-data';
import { fleetShipAt, zsFleet } from './zs-enemy-fleet';
import { krakenBallHit } from './zs-kraken-boss';
import { enemyBallLanded, fleetShipHit } from './zs-enemy-fleet-hits';

const URL = '/zona-sul/warship.glb';
/** quilha abaixo da superfície (m) — 01/11: navio 15% maior → calado junto (era 2,0) */
export const WARSHIP_DRAFT = 2.3;
/** costado (onde ficam os canhões) e convés de popa (timão), em fração da altura do modelo — medidos */
export const GUNWALE_K = 0.23, HELM_DECK_K = 0.27;
/** timão: fração do comprimento atrás do meio (popa) */
export const HELM_U = -0.36;

/** Altura do convés/canhões acima da quilha (m) — preenchida quando o modelo carrega. */
export const warshipDims = { gunY: 4.2, helmY: 4.9, height: 18 };

/**
 * CONVÉS ANDÁVEL (Pedro 01/11: "o player nada dentro do navio — sem colisão, não consigo andar em cima dele"; "aperta E
 * sobe no navio, na parte de trás acessa e dirige; amigos e inimigos sobem também — pirataria"). Igual ao galeão
 * encalhado (`zs-ship`): o modelo é escaneado UMA vez com raios de cima pra baixo (grade de 1 m, árvore de raio = ms) →
 * mapa de altura do convés relativo à QUILHA. Todo quadro o mundo põe a pose do navio (posição, giro, balanço) no
 * colisor (`syncWarshipDeck`) — o mesmo `shipGround` do galeão vale: convés = chão, casco = parede pra quem vem da água,
 * mastro/amurada = obstáculo (mais alto que um degrau).
 */
export const zsWarshipDeck: { c: ShipCollider | null; main: number; scan: ShipCollider | null } = { c: null, main: 0, scan: null };
/** raios saem desta fração da altura do modelo (acima do convés de popa ~0,27, abaixo das vergas/velas) */
const DECK_TOP_K = 0.36;
const DECK_CELL = 1;

/** Balanço do navio no tempo `t` (s): o MESMO no desenho e no colisor (quem está no convés sobe e desce junto).
 *  Afundando (`sinkT`, 01/11): tomba pro lado, embica e desce até sumir (WARSHIP.SINK_S). */
export function warshipPose(s: Pick<ZsWarship, 'x' | 'z' | 'roll'> & { sinkT?: number | null }, t: number): { y0: number; roll: number; pitch: number } {
  const k = s.sinkT != null ? Math.min(1, s.sinkT / WARSHIP.SINK_S) : 0;
  return {
    y0: zsWaterYAt(s.x, s.z) - WARSHIP_DRAFT + Math.sin(t * 0.7) * 0.15 * (1 - k) - k * k * (warshipDims.height + 4),
    roll: s.roll + Math.sin(t * 0.6 + 1) * 0.02 + k * 0.55,
    pitch: Math.sin(t * 0.5) * 0.012 + k * 0.25,
  };
}

/** Altura da barra de vida do navio (fração da altura do modelo): logo abaixo da ponta dos mastros — acima deles saía
 *  da tela com a câmera baixa e perto. */
export const SHIP_BAR_K = 0.82;
/** BARRA DE VIDA do navio (Pedro: "barra de vida igual à do herói"): 2 planos virados pra câmera, no alto dos mastros. */
export function makeShipHpBar(W = 10, H = 0.7): { group: THREE.Group; set: (frac: number, show: boolean, camera: THREE.Camera) => void } {
  const group = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#111418', transparent: true, opacity: 0.75, depthWrite: false }));
  // (transparente também: os dois na MESMA fila de desenho — o fundo, semitransparente, não cobre o verde; renderOrder 9 > 8)
  const fill = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#3fbf5a', transparent: true, opacity: 1, depthWrite: false }));
  bg.scale.set(W * 1.04, H / 0.7, 1); fill.scale.set(W, H, 1); fill.position.z = 0.01;
  bg.renderOrder = 8; fill.renderOrder = 9;
  group.add(bg, fill); group.visible = false;
  const green = new THREE.Color('#3fbf5a'), red = new THREE.Color('#d8452f');
  return {
    group,
    set: (frac, show, camera) => {
      group.visible = show;
      if (!show) return;
      const f = Math.max(0, Math.min(1, frac));
      fill.scale.x = Math.max(0.001, W * f); fill.position.x = -(W / 2) * (1 - f);
      (fill.material as THREE.MeshBasicMaterial).color.copy(red).lerp(green, f);
      group.quaternion.copy(camera.quaternion);
    },
  };
}
/** Põe a pose do quadro no colisor do convés (centro, giro, quilha, adernar/arfar). */
export function syncWarshipDeck(s: ZsWarship, t: number): void {
  const c = zsWarshipDeck.c;
  if (!c) return;
  const ps = warshipPose(s, t);
  c.cx = s.x; c.cz = s.z; c.cos = Math.cos(s.yaw); c.sin = Math.sin(s.yaw);
  c.y0 = ps.y0; c.tiltU = Math.sin(ps.roll); c.tiltV = -Math.sin(ps.pitch);
}

/** Meia boca do convés escaneado (m) — pra "perto do casco". */
export function warshipHalfBeam(): number { return zsWarshipDeck.scan ? -zsWarshipDeck.scan.u0 - 0.5 : WARSHIP.LENGTH * 0.12; }

/** Altura CRUA do convés (relativa à quilha) na célula sob (x, z); NaN = fora do navio. */
function deckCell(c: ShipCollider, s: Pick<ZsWarship, 'x' | 'z' | 'yaw'>, x: number, z: number): number {
  const { u, v } = warshipLocal(s, x, z);
  const i = Math.floor((u - c.u0) / c.cell), j = Math.floor((v - c.v0) / c.cell);
  return i < 0 || j < 0 || i >= c.nu || j >= c.nv ? NaN : c.deck[j * c.nu + i]!;
}

/** SUBIR A BORDO (E perto do casco): o ponto do convés PRINCIPAL mais perto de quem chegou — do lado dele, longe da
 *  amurada, fora de mastro/canhão. `y` = altura do convés lá agora. */
export function warshipBoardSpot(s: Pick<ZsWarship, 'x' | 'z' | 'yaw'>, x: number, z: number, c: ShipCollider | null = zsWarshipDeck.c): { x: number; z: number; y: number } | null {
  if (!c) return null;
  const { u, v } = warshipLocal(s, x, z);
  const inU = Math.max(0.5, warshipHalfBeam() - 1.4), vMax = WARSHIP.LENGTH / 2 - 5;
  const u0 = Math.sign(u || 1) * Math.min(Math.abs(u), inU), v0 = Math.max(-vMax, Math.min(vMax, v));
  for (const dv of [0, 1, -1, 2, -2, 3, -3, 4, -4, 6, -6, 8, -8]) for (const uu of [u0, u0 * 0.5, 0]) {
    const p = warshipWorld(s, uu, v0 + dv), d = deckCell(c, s, p.x, p.z);
    if (Number.isNaN(d) || Math.abs(d - zsWarshipDeck.main) > 0.6) continue;
    const g = shipGround(c, p.x, p.z, 1e6);
    if (g && 'y' in g) return { x: p.x, z: p.z, y: g.y };
  }
  return null;
}

/** Escaneia o convés do modelo já montado (quilha em y = 0, meio no centro, proa pro +Z). */
function scanWarshipDeck(holder: THREE.Object3D, height: number): { c: ShipCollider; main: number } {
  holder.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  holder.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const g = m.geometry as THREE.BufferGeometry & { boundsTree?: unknown };
    if (!g.boundsTree) computeBoundsTree.call(g);
    m.raycast = acceleratedRaycast; meshes.push(m);
  });
  const box = new THREE.Box3().setFromObject(holder);
  const halfU = Math.max(Math.abs(box.min.x), Math.abs(box.max.x)) + 0.5, halfV = WARSHIP.LENGTH / 2 + 0.5;
  const nu = Math.ceil((halfU * 2) / DECK_CELL), nv = Math.ceil((halfV * 2) / DECK_CELL);
  const deck = new Float32Array(nu * nv).fill(NaN);
  const top = height * DECK_TOP_K;
  const ray = new THREE.Raycaster(), o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
  (ray as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;
  ray.far = top + 0.5;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    o.set(-halfU + (i + 0.5) * DECK_CELL, top, -halfV + (j + 0.5) * DECK_CELL);
    ray.set(o, down);
    const hit = ray.intersectObjects(meshes, false)[0];
    if (hit && hit.point.y > WARSHIP_DRAFT + 0.3) deck[j * nu + i] = hit.point.y; // acima da linha d'água: é navio
  }
  for (const m of meshes) m.raycast = () => {}; // de volta: o navio não pega clique
  // convés principal = a altura MAIS COMUM (mediana); costado inclinado bem abaixo dela vira borda do convés (como o galeão)
  const ys = Array.from(deck).filter((y) => !Number.isNaN(y)).sort((a, b) => a - b);
  const main = ys.length ? ys[Math.floor(ys.length / 2)]! : height * 0.23;
  for (let n = 0; n < deck.length; n++) if (deck[n]! < main - 0.8) deck[n] = main;
  return { c: { cx: 0, cz: 0, cos: 1, sin: 0, u0: -halfU, v0: -halfV, nu, nv, cell: DECK_CELL, deck, plank: null, ladder: null, y0: 0, tiltU: 0, tiltV: 0 }, main };
}

/** Balas no ar (o mundo empurra ao atirar; o desenho anima e resolve o impacto). `remote` = salva de OUTRO jogador
 *  (online): só desenho/splash/som — o dano já foi resolvido por quem atirou. */
/** `enemy` (03/11): bala da ESQUADRA PIRATA — ao cair tira vida do MEU navio / de mim (zs-enemy-fleet-hits). */
export type FlyingBall = { b: CannonBall; t0: number; land: { x: number; y: number; z: number; t: number }; hit: boolean; remote?: boolean; enemy?: boolean | 'kraken' };
export const warshipFx: { balls: FlyingBall[]; splashes: { x: number; y: number; z: number; t0: number }[] } = { balls: [], splashes: [] };
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __zsWarshipFx?: unknown }).__zsWarshipFx = warshipFx; // testes de tela
/** Mira (o mundo escreve todo quadro): arco da bala do meio da salva + onde cai. */
export const warshipAim: { on: boolean; ball: CannonBall | null; land: { x: number; y: number; z: number; t: number } | null } = { on: false, ball: null, land: null };

const MAX_BALLS = 24, MAX_SPLASH = 12, ARC_PTS = 28; // 03/11: + as salvas da esquadra pirata (3 navios × 3 balas)

/** Monta o navio a partir do GLB: escala pro comprimento, proa pro +Z, quilha em y = 0, meio no centro (sem pegar
 *  clique). O MESMO do navio local e do navio de OUTRO jogador (zs-remote-vehicles) — geometria compartilhada. */
export function buildWarshipModel(scene: THREE.Object3D): { holder: THREE.Group; h: number } {
  const r = scene.clone(true);
  r.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.raycast = () => {}; } });
  r.updateMatrixWorld(true);
  const b0 = new THREE.Box3().setFromObject(r), s0 = b0.getSize(new THREE.Vector3());
  const k = WARSHIP.LENGTH / Math.max(s0.z, 1e-6);
  r.scale.setScalar(k);
  r.rotation.y = Math.PI; // proa (−Z no arquivo) → +Z (frente do jogo)
  r.updateMatrixWorld(true);
  const b1 = new THREE.Box3().setFromObject(r), c1 = b1.getCenter(new THREE.Vector3());
  r.position.set(-c1.x, -b1.min.y, -c1.z); // quilha em y = 0, meio do navio no centro
  const holder = new THREE.Group(); holder.add(r);
  return { holder, h: b1.max.y - b1.min.y };
}
export const WARSHIP_URL = URL;

export function ZsWarshipView({ shipRef, heroRef }: { shipRef: React.MutableRefObject<ZsWarship | null>; heroRef: React.MutableRefObject<THREE.Vector3> }) {
  const { scene } = useGLTF(URL);
  const model = useMemo(() => {
    const { holder, h } = buildWarshipModel(scene);
    warshipDims.height = h; warshipDims.gunY = h * GUNWALE_K; warshipDims.helmY = h * HELM_DECK_K;
    return { holder, scan: scanWarshipDeck(holder, h) };
  }, [scene]);
  // o colisor do convés vale enquanto o navio está na cena (montar/desmontar do React não perde o escaneamento)
  useEffect(() => {
    zsWarshipDeck.c = model.scan.c; zsWarshipDeck.main = model.scan.main; zsWarshipDeck.scan = model.scan.c;
    return () => { if (zsWarshipDeck.c === model.scan.c) zsWarshipDeck.c = null; if (zsWarshipDeck.scan === model.scan.c) zsWarshipDeck.scan = null; };
  }, [model]);
  const ship = useRef<THREE.Group>(null);
  const balls = useRef<THREE.InstancedMesh>(null);
  const splashes = useRef<THREE.InstancedMesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const pillar = useRef<THREE.Mesh>(null);
  /** o ARCO = fileira de bolinhas (linha de 1 px some de longe e de frente) */
  const arcDots = useRef<THREE.InstancedMesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const hpBar = useMemo(() => makeShipHpBar(), []);

  useFrame((state) => {
    const s = shipRef.current, g = ship.current;
    if (!s || !g) return;
    const now = performance.now(), t = state.clock.elapsedTime;
    // ── o navio: na água (com a onda), balanço leve + adernar na curva (a MESMA pose do colisor do convés) ──
    const ps = warshipPose(s, t);
    g.position.set(s.x, ps.y0, s.z);
    g.rotation.set(ps.pitch, s.yaw, ps.roll, 'YXZ');
    // afundando: o convés deixa de ser chão (quem está nele cai na água); afundou de vez: some
    const sinking = s.sinkT !== null;
    zsWarshipDeck.c = sinking ? null : model.scan.c;
    g.visible = !warshipGone(s);
    // barra de vida: ferido, ou com o herói perto
    const hero = heroRef.current, nearHero = Math.hypot(hero.x - s.x, hero.z - s.z) < 90;
    hpBar.group.position.set(s.x, ps.y0 + warshipDims.height * SHIP_BAR_K, s.z);
    hpBar.set(s.hp / WARSHIP.HP, !sinking && (s.hp < WARSHIP.HP || nearHero), state.camera);
    // ── salvas de OUTROS jogadores (online): entram como balas "só de desenho" + o estrondo pela distância ──────
    while (netCannonInbox.length) {
      const nc = netCannonInbox.shift()!;
      const h = heroRef.current;
      nc.b.forEach((a, i) => {
        const l = nc.l[i];
        if (!l || a.length < 6 || l.length < 4) return;
        warshipFx.balls.push({ b: { ox: a[0]!, oy: a[1]!, oz: a[2]!, vx: a[3]!, vy: a[4]!, vz: a[5]! }, t0: now + i * nc.gap, land: { x: l[0]!, y: l[1]!, z: l[2]!, t: l[3]! }, hit: false, remote: true });
        const g = distanceGain(Math.hypot(a[0]! - h.x, a[2]! - h.z));
        if (g > 0.01) window.setTimeout(() => audioManager.playWorld('cannon', g), i * nc.gap);
      });
    }
    // ── balas no ar + impacto ────────────────────────────────────────────────────────────────────────────
    const bm = balls.current;
    let nb = 0;
    const fx = warshipFx;
    for (const fb of fx.balls) {
      const age = (now - fb.t0) / 1000;
      if (age < 0) continue; // ainda não saiu (salva escalonada)
      if (age >= fb.land.t) {
        if (!fb.hit) {
          fb.hit = true;
          fx.splashes.push({ x: fb.land.x, y: fb.land.y, z: fb.land.z, t0: now });
          if (fb.enemy) enemyBallLanded(fb.land, shipRef.current, heroRef.current, warshipHalfBeam(), fb.enemy === 'kraken' ? 'kraken' : 'pirata'); // esquadra pirata → meu navio / eu
          else if (!fb.remote) {
            useGameStore.getState().cannonHit({ x: fb.land.x, z: fb.land.z }, WARSHIP.SPLASH_R); // dano: só de quem atirou
            // caiu num navio da ESQUADRA PIRATA (03/11): tira vida dele (afundou = loot, o capitão vai junto)
            const es = fleetShipAt(zsFleet.ships, fb.land.x, fb.land.z);
            // (online: sou convidado → o anfitrião aplica; solo/anfitrião → aqui; o loot vai pra quem afundou)
            if (es) { if (isGuestInRoom()) broadcastFleetHit(es.id, useGameStore.getState().cannonPower()); else fleetShipHit(es, useGameStore.getState().cannonPower()); }
            // caiu NO navio de outro jogador (online, 01/11 — "navio 5k vida"): o dono aplica (com inimizade)
            for (const d of remoteDecks.values()) {
              if (shipGround(d.c, fb.land.x, fb.land.z, 1e6)) { broadcastShipHit(d.id, useGameStore.getState().cannonPower()); break; }
            }
          }
          const h = heroRef.current;
          audioManager.playWorld('gun', distanceGain(Math.hypot(fb.land.x - h.x, fb.land.z - h.z)) * 0.8, now);
        }
        continue;
      }
      const p = ballAt(fb.b, age);
      // (04/11) bala (minha ou de outro da sala) no KRAKEN DAS CAGARRAS: bate NO AR no tentáculo/corpo ("canhões nos
      // tentáculos"), não só onde cairia na água. Id vazio = o corpo protegido: estoura sem dano. Dano: só de quem atirou,
      // pelo cannonHit de sempre em cima daquele bicho (convidado → o anfitrião aplica)
      if (!fb.enemy) {
        const kid = krakenBallHit(p);
        if (kid !== null) {
          fb.hit = true; fb.land = { x: p.x, y: p.y, z: p.z, t: age };
          fx.splashes.push({ x: p.x, y: p.y, z: p.z, t0: now });
          if (!fb.remote && kid) { const c = useGameStore.getState().creatures.find((q) => q.id === kid); if (c && c.behavior !== 'dead') useGameStore.getState().cannonHit({ x: c.position.x, z: c.position.z }, 0.5); }
          const h = heroRef.current;
          audioManager.playWorld('gun', distanceGain(Math.hypot(p.x - h.x, p.z - h.z)) * 0.8, now);
          continue;
        }
      }
      if (bm && nb < MAX_BALLS) { dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(1); dummy.updateMatrix(); bm.setMatrixAt(nb++, dummy.matrix); }
    }
    fx.balls = fx.balls.filter((fb) => !fb.hit || (now - fb.t0) / 1000 < fb.land.t + 0.1);
    if (bm) { bm.count = nb; bm.instanceMatrix.needsUpdate = true; }
    // ── splash: anel de espuma que abre e some em 0,9 s ──────────────────────────────────────────────────
    const sm = splashes.current;
    fx.splashes = fx.splashes.filter((sp) => now - sp.t0 < 900).slice(-MAX_SPLASH);
    if (sm) {
      let ns = 0;
      for (const sp of fx.splashes) { const k = (now - sp.t0) / 900; dummy.position.set(sp.x, sp.y + 0.15 + k * 1.2, sp.z); dummy.scale.set(1 + k * 5, 1 + k * 3.5 * (1 - k), 1 + k * 5); dummy.updateMatrix(); sm.setMatrixAt(ns++, dummy.matrix); }
      sm.count = ns; sm.instanceMatrix.needsUpdate = true;
    }
    // ── mira: arco da bala do meio + anel onde cai ───────────────────────────────────────────────────────
    const a = warshipAim, rg = ring.current, pl = pillar.current, dots = arcDots.current;
    if (rg && pl && dots) {
      const show = a.on && !!a.ball && !!a.land;
      rg.visible = show; pl.visible = show;
      if (show) {
        for (let i = 0; i < ARC_PTS; i++) { const p = ballAt(a.ball!, (a.land!.t * (i + 1)) / ARC_PTS); dummy.position.set(p.x, p.y, p.z); dummy.scale.setScalar(1); dummy.updateMatrix(); dots.setMatrixAt(i, dummy.matrix); }
        dots.count = ARC_PTS; dots.instanceMatrix.needsUpdate = true;
        rg.position.set(a.land!.x, a.land!.y + 0.2, a.land!.z);
        pl.position.set(a.land!.x, a.land!.y + 5, a.land!.z);
      } else dots.count = 0;
    }
  });

  return (
    <>
      <group ref={ship}><primitive object={model.holder} /></group>
      <primitive object={hpBar.group} />
      <instancedMesh ref={balls} args={[undefined, undefined, MAX_BALLS]} frustumCulled={false}>
        <sphereGeometry args={[0.45, 10, 8]} />
        <meshStandardMaterial color="#1c1c1e" roughness={0.6} metalness={0.4} />
      </instancedMesh>
      <instancedMesh ref={splashes} args={[undefined, undefined, MAX_SPLASH]} frustumCulled={false}>
        <cylinderGeometry args={[1.2, 1.8, 1, 14, 1, true]} />
        <meshBasicMaterial color="#e9f4f6" transparent opacity={0.55} side={THREE.DoubleSide} depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={arcDots} args={[undefined, undefined, ARC_PTS]} frustumCulled={false} renderOrder={10}>
        <sphereGeometry args={[0.32, 6, 4]} />
        <meshBasicMaterial color="#ffd166" transparent opacity={0.9} depthTest={false} />
      </instancedMesh>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} visible={false} renderOrder={10}>
        <ringGeometry args={[WARSHIP.SPLASH_R - 0.8, WARSHIP.SPLASH_R, 40]} />
        <meshBasicMaterial color="#ff5a3c" transparent opacity={0.85} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      {/* coluna de luz no ponto de queda: dá pra ver de longe e de qualquer ângulo */}
      <mesh ref={pillar} visible={false} renderOrder={9}>
        <cylinderGeometry args={[0.45, 0.45, 10, 10, 1, true]} />
        <meshBasicMaterial color="#ff5a3c" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} />
      </mesh>
    </>
  );
}
