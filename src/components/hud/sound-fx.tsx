/**
 * Toca SFX procedurais nos eventos de feedback que JÁ existem (golpe, crítico,
 * dano no jogador, coleta, loot, cura, level-up, morte, tiro). Não é estado do
 * jogo — só escuta o feed e dispara som. Deduplica por lote (um giro que acerta
 * 6 inimigos toca "hit" uma vez, não seis). Libera o áudio no 1º gesto.
 */
import { useEffect } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { playSfx, unlockAudio, type Sfx } from '@/game/systems/sound';

export function SoundFX() {
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });

    let lastId = useGameStore.getState().feedback.reduce((m, e) => Math.max(m, e.id), 0);

    const unsub = useGameStore.subscribe((state) => {
      const fb = state.feedback;
      if (!fb || fb.length === 0) return;
      let maxId = lastId;
      const toPlay = new Set<Sfx>();
      for (const e of fb) {
        if (e.id <= lastId) continue;
        if (e.id > maxId) maxId = e.id;
        switch (e.kind) {
          case 'damage': toPlay.add(e.critical ? 'crit' : e.onPlayer ? 'hurt' : 'hit'); break;
          case 'loot': toPlay.add('loot'); break;
          case 'harvest': toPlay.add('harvest'); break;
          case 'levelup': toPlay.add('levelup'); break;
          case 'death': toPlay.add('death'); break;
          case 'heal': toPlay.add('heal'); break;
          case 'shot': toPlay.add('shot'); break;
          default: break; // xp: sem som (frequente demais)
        }
      }
      if (maxId === lastId) return;
      lastId = maxId;
      for (const s of toPlay) playSfx(s);
    });

    return () => {
      unsub();
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  return null;
}
