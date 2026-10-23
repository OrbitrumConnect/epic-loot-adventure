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
import { worldBlocksShot } from './terrain-collision';

export const AIM_ZOOM_MAX = 4;
export const useAim = create<{ active: boolean; zoom: number }>(() => ({ active: false, zoom: 1 }));

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

export type AimTarget = { kind: 'creature'; id: string } | { kind: 'player'; id: string; name: string; x: number; z: number };

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
  cands.sort((a, b) => a.ang - b.ang);
  for (const c of cands) if (!shotBlocked(origin, c.p)) return c.t;
  return null;
}

/** Ponto no chão pra onde o tiro no vazio voa (direção da câmera, ~25 m). */
function missPoint(camera: THREE.Camera): { x: number; z: number } {
  const o = camera.getWorldPosition(new THREE.Vector3());
  const d = camera.getWorldDirection(new THREE.Vector3());
  const flat = Math.hypot(d.x, d.z) || 1;
  return { x: o.x + (d.x / flat) * 25, z: o.z + (d.z / flat) * 25 };
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
  if (!t) return useGameStore.getState().fireMiss(missPoint(aimCamera));
  if (t.kind === 'creature') {
    useGameStore.getState().attack(t.id);
    return true;
  }
  if (pvpStrike(t.name, t.x, t.z, 0.6, (raw) => broadcastPlayerHit(t.id, raw))) markPvpHit(t.id);
  return true;
}
