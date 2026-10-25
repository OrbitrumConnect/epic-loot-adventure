/**
 * Controles de toque (mobile), sobre o mundo — Pedro: "manete semi-invisível na esquerda,
 * pular e atacar na direita". ADITIVO: só monta no mobile; no desktop nada muda.
 *
 * - Joystick FLUTUANTE na metade esquerda: onde o dedo toca nasce a base; o vetor analógico
 *   (−1..1) vai pro `virtualMove`, que o laço de movimento do herói soma ao WASD.
 *   Empurrar até a BORDA = correr (Shift), padrão de jogo de celular (25/10: tirou o botão Correr).
 * - Direita, em ARCO em volta do ATACAR grande (Pedro 25/10: "trigger central atacar e os outros em volta,
 *   meio círculo"): anel de dentro = Pular, Mirar, Q, R; anel de fora = os poderes liberados (F, Z, X, C).
 *   Cada botão chama EXATAMENTE a mesma ação de antes (as do rodapé, que no celular saem de lá).
 */
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronsUp, Crosshair, Swords } from 'lucide-react';
import { aimFire, setAiming, useAim } from './aim';
import { clearVirtualMove, setVirtualMove } from './virtual-input';
import { useGameStore } from '@/game/state/game-store';

const RADIUS = 54; // px: distância máxima do knob ao centro (satura em magnitude 1).
/** Empurrou até aqui (fração do raio) → corre; voltou abaixo de RUN_OFF → para de correr. */
export const RUN_ON = 0.95;
export const RUN_OFF = 0.8;
/** Raios dos anéis (px, do centro do ATACAR) e faixa de ângulo (graus: 90 = em cima, 180 = à esquerda). */
export const ARC_INNER = 96;
export const ARC_OUTER = 166;
export const ARC_FROM = 95;
export const ARC_TO = 178;
/** Distância mínima entre centros de botões vizinhos no arco (botão 52 px + folga). */
export const ARC_GAP = 58;

/** Raio que cabe `n` botões na abertura `from→to` sem encostar (nunca menor que `min`). */
export function arcRadius(n: number, min: number, from = ARC_FROM, to = ARC_TO): number {
  if (n <= 1) return min;
  const span = ((to - from) * Math.PI) / 180;
  return Math.max(min, Math.ceil((ARC_GAP * (n - 1)) / span));
}

/** Posições (dx, dy em px a partir do centro do ATACAR; dy negativo = pra cima) de `n` botões num arco. */
export function arcLayout(n: number, radius: number, from = ARC_FROM, to = ARC_TO): { dx: number; dy: number }[] {
  if (n <= 0) return [];
  return Array.from({ length: n }, (_, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = ((from + (to - from) * t) * Math.PI) / 180;
    return { dx: Math.round(Math.cos(a) * radius), dy: Math.round(-Math.sin(a) * radius) };
  });
}

/** Botão de poder/especial vindo da tela principal (mesma ação do rodapé). */
export type ArcButton = { id: string; label: string; icon: ReactNode; onPress: () => void; cooldown?: number };

type Stick = { bx: number; by: number; kx: number; ky: number };

export function MobileControls({ onAttack, canAim = false, powers = [] }: { onAttack: () => void; canAim?: boolean; powers?: ArcButton[] }) {
  const aiming = useAim(s => s.active);
  // Sem 3ª pessoa (ou desmontou): nunca fica preso mirando.
  useEffect(() => { if (!canAim) setAiming(false); return () => setAiming(false); }, [canAim]);
  const toggleAim = (e: React.PointerEvent) => { e.preventDefault(); setAiming(!useAim.getState().active); };
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const [stick, setStick] = useState<Stick | null>(null);
  const runningRef = useRef(false);
  const setRun = (on: boolean) => {
    if (runningRef.current === on) return;
    runningRef.current = on;
    window.dispatchEvent(new KeyboardEvent(on ? 'keydown' : 'keyup', { code: 'ShiftLeft' }));
  };
  useEffect(() => () => setRun(false), []); // eslint-disable-line react-hooks/exhaustive-deps

  const start = (e: React.PointerEvent) => {
    origin.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setStick({ bx: e.clientX, by: e.clientY, kx: e.clientX, ky: e.clientY });
  };
  const move = (e: React.PointerEvent) => {
    const o = origin.current;
    if (!o || o.id !== e.pointerId) return;
    let dx = e.clientX - o.x;
    let dy = e.clientY - o.y;
    const len = Math.hypot(dx, dy);
    if (len > RADIUS) { dx = (dx / len) * RADIUS; dy = (dy / len) * RADIUS; }
    setStick({ bx: o.x, by: o.y, kx: o.x + dx, ky: o.y + dy });
    setVirtualMove(dx / RADIUS, dy / RADIUS); // x: direita+ (D), z: baixo+ (S)
    // Borda do joystick = correr; voltou um pouco = anda (folga entre os dois pra não piscar).
    if (len >= RADIUS * RUN_ON) setRun(true);
    else if (len < RADIUS * RUN_OFF) setRun(false);
    // Joystick = assumir o controle, IGUAL ao WASD no PC (Pedro, 23/10): antes o automático seguia
    // ligado por baixo e, ao soltar o dedo, o piloto voltava pro alvo do lugar antigo.
    if (len > 8) {
      const st = useGameStore.getState();
      if (st.objectives.mode === 'idle') st.setAutoMode('manual');
    }
  };
  const end = (e: React.PointerEvent) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    setStick(null);
    clearVirtualMove();
    setRun(false);
  };

  const jump = (e: React.PointerEvent) => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  };
  const attack = (e: React.PointerEvent) => {
    e.preventDefault();
    // Mirando: atira no que está no pontinho; sem nada na mira, o ataque de sempre.
    if (!(useAim.getState().active && aimFire())) onAttack();
  };

  // Anel de dentro: Pular, Mirar (3ª pessoa) e os especiais Q/R; anel de fora: poderes liberados.
  const inner: ArcButton[] = [
    { id: 'jump', label: 'Pular', icon: <ChevronsUp />, onPress: () => window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' })) },
    ...powers.filter((p) => p.id === 'Q' || p.id === 'R'),
    ...(canAim ? [{ id: 'aim', label: 'Mirar', icon: <Crosshair />, onPress: () => setAiming(!useAim.getState().active) }] : []),
  ];
  const outer = powers.filter((p) => p.id !== 'Q' && p.id !== 'R');
  const innerR = arcRadius(inner.length, ARC_INNER);
  const outerR = arcRadius(outer.length, Math.max(ARC_OUTER, innerR + 66), ARC_FROM + 4, ARC_TO - 4);
  const innerPos = arcLayout(inner.length, innerR);
  const outerPos = arcLayout(outer.length, outerR, ARC_FROM + 4, ARC_TO - 4);

  const arcBtn = (b: ArcButton, pos: { dx: number; dy: number }) => (
    <button key={b.id} type="button" aria-label={b.label}
      className={`mobile-btn mobile-btn--arc${b.id === 'aim' && aiming ? ' is-on' : ''}${b.cooldown ? ' is-cd' : ''}`}
      style={{ transform: `translate(${pos.dx}px, ${pos.dy}px)` }}
      onPointerDown={(e) => { e.preventDefault(); if (b.id === 'jump') jump(e); else if (b.id === 'aim') toggleAim(e); else b.onPress(); }}>
      {b.icon}{b.cooldown ? <span className="mobile-cd">{b.cooldown}</span> : null}
    </button>
  );

  return (
    <>
      <div className="mobile-stick-zone" onPointerDown={start} onPointerMove={move}
        onPointerUp={end} onPointerCancel={end}>
        {stick && <>
          <span className="mobile-stick-base" style={{ left: stick.bx, top: stick.by }} />
          <span className="mobile-stick-knob" style={{ left: stick.kx, top: stick.ky }} />
        </>}
      </div>
      <div className="mobile-arc">
        {inner.map((b, i) => arcBtn(b, innerPos[i]!))}
        {outer.map((b, i) => arcBtn(b, outerPos[i]!))}
        <button className="mobile-btn mobile-btn--attack" aria-label="Atacar" onPointerDown={attack}><Swords /></button>
      </div>
    </>
  );
}
