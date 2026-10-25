/**
 * MIRA em 3ª pessoa (Pedro): segurar o botão direito (ou o botão MIRAR no celular) aproxima a
 * câmera no ombro, mostra a mira no centro e o herói vira pra onde a câmera olha. A rodinha
 * dá zoom (mirar de longe). Atirar mirando acerta o que está SOB a mira (não o mais perto),
 * usando o MESMO ataque/PvP de sempre (cadência, alcance, munição e regras do online).
 */
import * as THREE from 'three';
import { create } from 'zustand';
import { useGameStore } from '@/game/state/game-store';
import { broadcastPlayerHit, useNet } from '@/net/multiplayer';
import { creatureAnchors } from './hostile-ai';
import { markPvpHit, pvpStrike } from './pvp-attack';
import { bigWallBetween } from './base-collision';
import { glbSurfaceY, worldBlocksShot, worldShotHitDistance } from './terrain-collision';
import { isHostileBaseOwner, STRIKABLE_REMOTE, strikeRemotePiece, strikeRemoteTroop } from './remote-base-strike';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { weaponFor, weaponRangeFor } from '@/game/data/weapons';

/** Item na mão (igual `held-weapon.selectedItemId` — sem importar modelos 3D: este módulo carrega
 *  ANTES do login e não pode puxar GLB). */
function heldId(st: ReturnType<typeof useGameStore.getState>): string | null {
  const slot = st.player.inventory.hotbar.slots[st.ui.selectedHotbar];
  return slot != null ? st.player.inventory.slots[slot]?.itemId ?? null : null;
}

/** Corpo a corpo e o bicho do centro está além do alcance da arma? (arma de longe → false) */
function meleeOutOfReach(creatureId: string): boolean {
  const st = useGameStore.getState();
  const held = heldId(st);
  if (weaponFor(held).ranged) return false;
  const c = st.creatures.find((x) => x.id === creatureId);
  if (!c) return false;
  return Math.hypot(c.position.x - st.player.position.x, c.position.z - st.player.position.z) > weaponRangeFor(held, st.player.level);
}

/** Tranco da câmera por tiro (rad): pistola ~1,7°, fuzil ~2,6° (mais forte, atira mais devagar), arco/espada 0. */
export function gunKick(itemId: string | null): number {
  const p = weaponFor(itemId);
  if (!p.ranged || p.projectile !== 'bullet') return 0;
  return itemId === 'rifle' ? 0.045 : 0.03;
}

export const AIM_ZOOM_MAX = 4;
export const useAim = create<{ active: boolean; zoom: number }>(() => ({ active: false, zoom: 1 }));
/** Sensibilidade do giro mirando: cai na mesma proporção do campo de visão (52°/zoom vs 65° sem mirar) →
 *  mirar longe não treme (Pedro 25/10, celular). Sem mirar = 1 (igual a antes). */
export function aimSensitivityScale(): number {
  const s = useAim.getState();
  return s.active ? 52 / Math.max(1, s.zoom) / 65 : 1;
}

export function setAiming(on: boolean): void {
  const s = useAim.getState();
  if (s.active === on) return;
  useAim.setState({ active: on, zoom: on ? s.zoom : 1 });
}
export function aimZoomStep(dir: 1 | -1): void {
  const s = useAim.getState();
  if (!s.active) return;
  useAim.setState({ zoom: THREE.MathUtils.clamp(s.zoom + dir * 0.5, 1, AIM_ZOOM_MAX) });
}

let aimCamera: THREE.Camera | null = null;
/** A câmera do mundo se registra aqui (a mira é o centro da tela dela). */
export function setAimCamera(c: THREE.Camera | null): void { aimCamera = c; }

export type AimTarget = { kind: 'creature'; id: string } | { kind: 'player'; id: string; name: string; x: number; z: number }
  | { kind: 'piece'; ownerId: string; pieceId: string }
  | { kind: 'troop'; ownerId: string; troopId: string };

/** Ímã da mira: QUASE NADA (Pedro, 22/10 — "igual CS"). Só perdoa ~meio grau fora do corpo. */
export const AIM_ASSIST_DEG = 0.5;
/** Raio do corpo do JOGADOR (hitbox) pra mira. */
const PLAYER_BODY_R = 0.4;

/** Ângulo (rad) entre o raio do centro da tela e um ponto; acerta se o pontinho está DENTRO do
 *  corpo (raio do alvo) + o ímã mínimo. */
function aimScore(origin: THREE.Vector3, dir: THREE.Vector3, p: THREE.Vector3, radius: number): number | null {
  const to = p.clone().sub(origin);
  const d = to.length();
  if (d < 0.5) return null;
  const ang = to.normalize().angleTo(dir);
  const tol = Math.atan(radius / d) + THREE.MathUtils.degToRad(AIM_ASSIST_DEG);
  return ang <= tol ? ang : null;
}

/** Corpo do bicho pela altura da barra de vida (`top`, local): centro e raio. Sem medida → 1,6 m. */
function creatureBody(a: { y: number; top: number }): { cy: number; r: number } {
  const h = a.top > 0.3 ? a.top : 1.6;
  return { cy: a.y + h * 0.5, r: THREE.MathUtils.clamp(h * 0.35, 0.45, 3) };
}

/** Coisa GRANDE no caminho (morro/mapa/labirinto, casa, fábrica)? Muro/torre da base passam. */
function shotBlocked(origin: THREE.Vector3, p: THREE.Vector3): boolean {
  const me = useGameStore.getState().player.position;
  if (bigWallBetween(me.x, me.z, p.x, p.z)) return true;
  // A câmera fica atrás do ombro: ignora o trecho câmera→herói (barranco atrás das costas).
  const skip = Math.hypot(origin.x - me.x, origin.z - me.z) + 0.3;
  return worldBlocksShot(origin, p, skip);
}

/** O que está sob a mira: o de menor ângulo ao centro da tela (bicho vivo ou jogador inimigo),
 *  e que NÃO esteja atrás de parede grande/morro. */
export function pickAimTarget(camera: THREE.Camera): AimTarget | null {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = camera.getWorldDirection(new THREE.Vector3());
  const cands: { ang: number; t: AimTarget; p: THREE.Vector3 }[] = [];
  for (const [id, a] of creatureAnchors) {
    if (!a.alive) continue;
    const b = creatureBody(a);
    const p = new THREE.Vector3(a.x, b.cy, a.z);
    const s = aimScore(origin, dir, p, b.r);
    if (s !== null) cands.push({ ang: s, t: { kind: 'creature', id }, p });
  }
  const net = useNet.getState();
  for (const r of Object.values(net.players)) {
    if (r.hp <= 0) continue;
    if (r.side !== 'enemy' && net.selfSide !== 'enemy') continue; // aliado: sem fogo amigo
    const y = Number.isFinite(r.y) ? (r.y as number) : 0;
    const p = new THREE.Vector3(r.x, y + 1.0, r.z);
    const s = aimScore(origin, dir, p, PLAYER_BODY_R);
    if (s !== null) cands.push({ ang: s, t: { kind: 'player', id: r.id, name: r.name, x: r.x, z: r.z }, p });
  }
  // Peças da base INIMIGA (muro/torre/porta): o pontinho também acerta (raid em 3ª pessoa).
  for (const ownerId in net.bases) {
    if (!isHostileBaseOwner(ownerId)) continue;
    for (const pc of net.bases[ownerId]?.pieces ?? []) {
      if (!STRIKABLE_REMOTE.has(pc.kind) || pc.hp <= 0) continue;
      const ctr = cellCenter(pc.cell);
      const tower = pc.kind === 'tower';
      const p = new THREE.Vector3(ctr.x, glbSurfaceY(ctr.x, ctr.z, 0) + (tower ? 2.5 : 1.2), ctr.z);
      const s = aimScore(origin, dir, p, tower ? 1.2 : 1.1);
      if (s !== null) cands.push({ ang: s, t: { kind: 'piece', ownerId, pieceId: pc.id }, p });
    }
  }
  // Tropas de jogador INIMIGO (raid): o pontinho acerta também.
  for (const ownerId in net.troops) {
    if (!isHostileBaseOwner(ownerId)) continue;
    for (const t of net.troops[ownerId] ?? []) {
      if (t.h <= 0) continue;
      const p = new THREE.Vector3(t.x, glbSurfaceY(t.x, t.z, 0) + 1.0, t.z);
      const s = aimScore(origin, dir, p, 0.5);
      if (s !== null) cands.push({ ang: s, t: { kind: 'troop', ownerId, troopId: t.i }, p });
    }
  }
  cands.sort((a, b) => a.ang - b.ang);
  for (const c of cands) if (!shotBlocked(origin, c.p)) return c.t;
  return null;
}

/**
 * Ponto 3D pra onde o tiro no vazio voa: segue a LINHA DO PONTINHO (mirou pra cima, sobe; pra
 * baixo, desce — Pedro, 22/10) até o alcance da arma, ou para no morro/parede se bater antes.
 */
export function missPoint(camera: THREE.Camera): { x: number; z: number; y: number } {
  const o = camera.getWorldPosition(new THREE.Vector3());
  const d = camera.getWorldDirection(new THREE.Vector3());
  const st = useGameStore.getState();
  const me = st.player.position;
  const skip = Math.hypot(o.x - me.x, o.z - me.z) + 0.3; // trecho câmera→ombro
  const far = skip + weaponRangeFor(heldId(st), st.player.level);
  const dist = worldShotHitDistance(o, d, far, skip) ?? far;
  const p = o.addScaledVector(d, dist);
  return { x: p.x, z: p.z, y: p.y };
}

/**
 * Atira pelo pontinho (3ª pessoa / mirando) — IGUAL CS: acerta o que está sob a mira; pontinho
 * vazio (ou alvo atrás de parede grande) = tiro NO VAZIO com arma de longe (gasta bala, não
 * acerta). true = tratado. false = arma de corpo a corpo sem alvo → o chamador usa o ataque de
 * sempre (espada/faca acerta o mais perto, alcance curto).
 */
export function aimFire(): boolean {
  if (!aimCamera) return false;
  const t = pickAimTarget(aimCamera);
  if (!t) { const p = missPoint(aimCamera); return useGameStore.getState().fireMiss({ x: p.x, z: p.z }, p.y); }
  if (t.kind === 'creature') {
    // Espada/corpo a corpo: o do centro só se estiver NO ALCANCE; senão cai no ataque normal (o mais perto
    // no alcance) e, sem ninguém, golpe no ar. Antes: 'longe demais' e nem balançava (Pedro 25/10).
    if (meleeOutOfReach(t.id)) return false;
    useGameStore.getState().attack(t.id);
    return true;
  }
  if (t.kind === 'piece') {
    strikeRemotePiece(t.ownerId, t.pieceId);
    return true;
  }
  if (t.kind === 'troop') {
    strikeRemoteTroop(t.ownerId, t.troopId);
    return true;
  }
  if (pvpStrike(t.name, t.x, t.z, 0.6, (raw) => broadcastPlayerHit(t.id, raw))) markPvpHit(t.id);
  return true;
}
