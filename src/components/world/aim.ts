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

/** Ângulo (rad) entre o raio do centro da tela e um ponto, com folga pelo tamanho do alvo. */
function aimScore(origin: THREE.Vector3, dir: THREE.Vector3, p: THREE.Vector3, radius: number): number | null {
  const to = p.clone().sub(origin);
  const d = to.length();
  if (d < 0.5) return null;
  const ang = to.normalize().angleTo(dir);
  const tol = Math.max(Math.atan(radius / d), THREE.MathUtils.degToRad(1.5));
  return ang <= tol ? ang : null;
}

/** O que está sob a mira: o de menor ângulo ao centro da tela (bicho vivo ou jogador inimigo). */
export function pickAimTarget(camera: THREE.Camera): AimTarget | null {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = camera.getWorldDirection(new THREE.Vector3());
  let best: AimTarget | null = null;
  let bestAng = Infinity;
  const p = new THREE.Vector3();
  for (const [id, a] of creatureAnchors) {
    if (!a.alive) continue;
    const s = aimScore(origin, dir, p.set(a.x, a.y + 0.8, a.z), 0.9);
    if (s !== null && s < bestAng) { bestAng = s; best = { kind: 'creature', id }; }
  }
  const net = useNet.getState();
  for (const r of Object.values(net.players)) {
    if (r.hp <= 0) continue;
    if (r.side !== 'enemy' && net.selfSide !== 'enemy') continue; // aliado: sem fogo amigo
    const y = Number.isFinite(r.y) ? (r.y as number) : 0;
    const s = aimScore(origin, dir, p.set(r.x, y + 1.0, r.z), 0.6);
    if (s !== null && s < bestAng) { bestAng = s; best = { kind: 'player', id: r.id, name: r.name, x: r.x, z: r.z }; }
  }
  return best;
}

/** Atira no que está sob a mira. true = havia alvo (o ataque segue as regras de sempre). */
export function aimFire(): boolean {
  if (!aimCamera) return false;
  const t = pickAimTarget(aimCamera);
  if (!t) return false;
  if (t.kind === 'creature') {
    useGameStore.getState().attack(t.id);
    return true;
  }
  if (pvpStrike(t.name, t.x, t.z, 0.6, (raw) => broadcastPlayerHit(t.id, raw))) markPvpHit(t.id);
  return true;
}
