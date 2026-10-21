/**
 * Mantém a LÓGICA do jogo viva quando a aba está ESCONDIDA (Pedro: "se não olho pra tela, ele
 * congela pra mim"). O navegador estrangula/pausa o `requestAnimationFrame` em aba de fundo, e
 * `tickWorld`/`tickTowers` rodam dentro de `useFrame` — então em background a simulação parava:
 * base indefesa, ondas travadas e, pior, o HOST de uma sala parava de alimentar o broadcast, aí
 * o amigo via bicho que já tinha morrido.
 *
 * Solução mínima e aditiva: enquanto `document.hidden`, um `setInterval` chama os MESMOS ticks.
 * O navegador limita o intervalo de fundo a ~1 s, mas a lógica é toda por TEMPO ABSOLUTO
 * (`Date.now()` em ondas/respawn/torres), então um passo mais lento continua correto. Quando a
 * aba volta, paramos o intervalo e o `useFrame` reassume suave — sem tick duplo (um só roda por
 * vez, alternado pelo `visibilitychange`). No modo solo nada muda em primeiro plano.
 */
import { useEffect, useRef } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import type { TowerSource } from '@/game/systems/towerSystem';
import { tickWorld } from './objective-bridge';

const BG_TICK_MS = 250; // alvo; em background o navegador clampa pra ~1 s (suficiente).

export function BackgroundSim({ paused }: { paused: boolean }) {
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  useEffect(() => {
    let timer: number | null = null;

    const step = () => {
      if (pausedRef.current) return;
      const state = useGameStore.getState();
      if (state.player.dead) return;

      // Mundo (ondas, respawn, acampamentos, auto-poção). Guarda `canSimulateSharedWorld()`
      // lá dentro: convidado de sala não simula (recebe o mundo do host).
      tickWorld();

      // Torres da base atiram (mesmo cálculo do TowerRuntime).
      const pieces = state.playerBase?.pieces;
      if (pieces) {
        const towers: TowerSource[] = [];
        for (const p of pieces) {
          if (p.kind !== 'tower') continue;
          const c = cellCenter(p.cell);
          towers.push({ id: p.id, tier: p.tier, level: p.level, hp: p.hp, x: c.x, z: c.z, baseType: state.playerBase?.baseType });
        }
        if (towers.length) state.tickTowers(towers, Date.now());
      }
    };

    const start = () => { if (timer == null) timer = window.setInterval(step, BG_TICK_MS); };
    const stop = () => { if (timer != null) { window.clearInterval(timer); timer = null; } };
    const onVis = () => { if (document.hidden) start(); else stop(); };

    document.addEventListener('visibilitychange', onVis);
    if (document.hidden) start();
    return () => { document.removeEventListener('visibilitychange', onVis); stop(); };
  }, []);

  return null;
}
