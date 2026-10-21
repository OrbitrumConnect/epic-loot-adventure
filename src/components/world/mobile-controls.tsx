/**
 * Controles de toque (mobile), sobre o mundo — Pedro: "manete semi-invisível na esquerda,
 * pular e atacar na direita". ADITIVO: só monta no mobile; no desktop nada muda.
 *
 * - Joystick FLUTUANTE na metade esquerda: onde o dedo toca nasce a base; o vetor analógico
 *   (−1..1) vai pro `virtualMove`, que o laço de movimento do herói soma ao WASD.
 * - Direita: PULAR (dispara a tecla Espaço, mesma mecânica do salto) e ATACAR (mesmo
 *   `onAttack` do clique esquerdo). Não duplica lógica nem toca nos gatilhos de auto-farm.
 */
import { useRef, useState } from 'react';
import { ChevronsUp, Swords, Footprints } from 'lucide-react';
import { clearVirtualMove, setVirtualMove } from './virtual-input';

const RADIUS = 54; // px: distância máxima do knob ao centro (satura em magnitude 1).

type Stick = { bx: number; by: number; kx: number; ky: number };

export function MobileControls({ onAttack }: { onAttack: () => void }) {
  const origin = useRef<{ x: number; y: number; id: number } | null>(null);
  const [stick, setStick] = useState<Stick | null>(null);

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
  };
  const end = (e: React.PointerEvent) => {
    if (origin.current?.id !== e.pointerId) return;
    origin.current = null;
    setStick(null);
    clearVirtualMove();
  };

  const [running, setRunning] = useState(false);

  const jump = (e: React.PointerEvent) => {
    e.preventDefault();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space' }));
  };
  const attack = (e: React.PointerEvent) => {
    e.preventDefault();
    onAttack();
  };
  // CORRER = alterna o sprint (tecla Shift). Toggle (não precisa segurar: o outro dedo
  // fica no joystick). Ligado = keydown ShiftLeft fica "preso"; desligado = keyup.
  const toggleRun = (e: React.PointerEvent) => {
    e.preventDefault();
    setRunning(r => {
      const next = !r;
      window.dispatchEvent(new KeyboardEvent(next ? 'keydown' : 'keyup', { code: 'ShiftLeft' }));
      return next;
    });
  };

  return (
    <>
      <div className="mobile-stick-zone" onPointerDown={start} onPointerMove={move}
        onPointerUp={end} onPointerCancel={end}>
        {stick && <>
          <span className="mobile-stick-base" style={{ left: stick.bx, top: stick.by }} />
          <span className="mobile-stick-knob" style={{ left: stick.kx, top: stick.ky }} />
        </>}
      </div>
      <div className="mobile-action-btns">
        <button className={`mobile-btn mobile-btn--run${running ? ' is-on' : ''}`} aria-label="Correr"
          aria-pressed={running} onPointerDown={toggleRun}><Footprints /></button>
        <button className="mobile-btn mobile-btn--jump" aria-label="Pular" onPointerDown={jump}><ChevronsUp /></button>
        <button className="mobile-btn mobile-btn--attack" aria-label="Atacar" onPointerDown={attack}><Swords /></button>
      </div>
    </>
  );
}
