import { useEffect, useReducer } from 'react';
import { Music, Play, Square } from 'lucide-react';
import { audioManager, TRACKS, type TrackId } from '@/game/audio/audio-manager';
import { useGameStore } from '@/game/state/game-store';

/**
 * Player de música no cabeçalho: play/stop, volume e seleção da faixa normal.
 * O combate (trilha tensa + volume +20%) é automático: cada ataque do jogador
 * "pulsa" o combate (ver audioManager.pulseCombat).
 */
export function MusicPlayer() {
  const [, force] = useReducer((n: number) => n + 1, 0);
  useEffect(() => audioManager.subscribe(force), []);

  // Cada ataque do jogador aquece a trilha de combate.
  const attackTick = useGameStore((s) => s.attackTick);
  const rangedShotTick = useGameStore((s) => s.rangedShotTick);
  const selectedHotbar = useGameStore((s) => s.ui.selectedHotbar);
  useEffect(() => { if (attackTick > 0) audioManager.pulseCombat(); }, [attackTick]);
  useEffect(() => {
    if (rangedShotTick > 0 && selectedHotbar === 8) audioManager.playShot();
    if (rangedShotTick > 0 && (selectedHotbar === 9 || selectedHotbar === 10)) audioManager.playGunShot();
  }, [rangedShotTick, selectedHotbar]);

  const playing = audioManager.playing;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.05)' }} title="Música">
      <button
        onClick={() => audioManager.toggle()}
        aria-label={playing ? 'Parar música' : 'Tocar música'}
        title={playing ? 'Parar' : 'Tocar'}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28,
          borderRadius: 6, border: 'none', cursor: 'pointer',
          color: playing ? '#0b0b0b' : '#cbd5e1',
          background: playing ? '#fcd34d' : 'rgba(255,255,255,0.08)',
        }}
      >
        {playing ? <Square style={{ width: 14, height: 14 }} /> : <Play style={{ width: 14, height: 14 }} />}
      </button>
      <Music style={{ width: 14, height: 14, opacity: 0.6, color: '#cbd5e1' }} />
      <input
        type="range" min={0} max={1} step={0.05} defaultValue={audioManager.master}
        aria-label="Volume da música"
        onChange={(e) => audioManager.setMaster(Number(e.target.value))}
        style={{ width: 64, accentColor: '#fcd34d' }}
      />
      <select
        defaultValue={audioManager.ambientTrack}
        aria-label="Faixa"
        onChange={(e) => audioManager.setAmbientTrack(e.target.value as TrackId)}
        style={{
          fontSize: 11, color: '#cbd5e1', background: 'rgba(0,0,0,0.4)',
          border: '1px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '2px 4px', maxWidth: 120,
        }}
      >
        {TRACKS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
    </div>
  );
}
