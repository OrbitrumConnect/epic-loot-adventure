import { useEffect, useState } from 'react';
import { getFreeCam, type FreeCamState } from './free-cam';

/**
 * HUD da câmera livre: velocidade, alcance de visão, métricas de render e o que
 * o retículo está mirando. Lê o estado mutável por polling (~4x/s) — nunca é
 * dirigido pelo laço de quadro. Só aparece com o modo livre ligado.
 */
function snapshot(s: FreeCamState) {
  return {
    active: s.active,
    speed: s.speed,
    far: s.far,
    fps: s.metrics.fps,
    ms: s.metrics.ms,
    calls: s.metrics.calls,
    triangles: s.metrics.triangles,
    inspect: s.inspect,
    version: s.version,
  };
}

export function FreeCamOverlay() {
  const [snap, setSnap] = useState(() => snapshot(getFreeCam()));
  useEffect(() => {
    const id = setInterval(() => setSnap(snapshot(getFreeCam())), 250);
    return () => clearInterval(id);
  }, []);

  if (!snap.active) return null;

  const i = snap.inspect;
  const box: React.CSSProperties = {
    position: 'absolute', top: 12, left: 12, zIndex: 40, pointerEvents: 'none',
    font: '600 12px/1.45 ui-monospace, SFMono-Regular, Menlo, monospace',
    color: '#d8f5ff', background: 'rgba(8,14,22,0.82)', border: '1px solid rgba(96,165,250,0.45)',
    borderRadius: 8, padding: '8px 10px', minWidth: 190, letterSpacing: 0.2,
    textShadow: '0 1px 2px rgba(0,0,0,0.6)',
  };
  const row = (label: string, value: string, hot = false): React.ReactNode => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, color: hot ? '#fcd34d' : undefined }}>
      <span style={{ opacity: 0.7 }}>{label}</span><span>{value}</span>
    </div>
  );

  return (
    <>
      <div style={box} aria-label="Câmera livre — métricas">
        <div style={{ color: '#60a5fa', fontWeight: 700, marginBottom: 4 }}>CÂMERA LIVRE</div>
        {row('FPS', String(snap.fps))}
        {row('quadro', `${snap.ms.toFixed(1)} ms`, snap.ms > 20)}
        {row('draw calls', String(snap.calls), snap.calls > 2600)}
        {row('triângulos', snap.triangles >= 1000 ? `${(snap.triangles / 1000).toFixed(0)}k` : String(snap.triangles))}
        <div style={{ height: 1, background: 'rgba(96,165,250,0.3)', margin: '6px 0' }} />
        {row('velocidade', `${snap.speed.toFixed(1)} m/s`)}
        {row('alcance', `${snap.far.toFixed(0)} m`)}
        <div style={{ opacity: 0.45, fontSize: 10, marginTop: 5, fontWeight: 500 }}>
          WASD · Q/E sobe/desce · Shift rápido · Alt lento<br />roda = velocidade · [ ] = alcance
        </div>
      </div>

      {/* Retículo no centro: referência de mira da inspeção. */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%', width: 10, height: 10, zIndex: 40,
        transform: 'translate(-5px, -5px)', pointerEvents: 'none',
        border: '1px solid rgba(216,245,255,0.75)', borderRadius: '50%',
        boxShadow: '0 0 0 1px rgba(0,0,0,0.5)',
      }} />

      {i.kind && (
        <div style={{
          position: 'absolute', top: 'calc(50% + 14px)', left: '50%', transform: 'translateX(-50%)',
          zIndex: 40, pointerEvents: 'none', whiteSpace: 'nowrap',
          font: '600 12px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          color: '#fff', background: 'rgba(8,14,22,0.9)',
          border: `1px solid ${i.kind === 'creature' ? 'rgba(239,68,68,0.6)' : i.kind === 'base' ? 'rgba(96,165,250,0.6)' : 'rgba(74,222,128,0.6)'}`,
          borderRadius: 7, padding: '6px 9px', textAlign: 'center',
        }}>
          <div style={{ fontWeight: 700 }}>{i.name}</div>
          {i.hp && <div style={{ color: '#fca5a5' }}>HP {i.hp}</div>}
          {i.state && <div style={{ color: '#fcd34d' }}>{i.state}</div>}
          <div style={{ opacity: 0.55, fontSize: 10 }}>{i.id}</div>
        </div>
      )}
    </>
  );
}
