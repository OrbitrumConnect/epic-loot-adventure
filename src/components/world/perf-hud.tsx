import { useEffect, useState } from 'react';
import { perfStats } from './perf-stats';

/** Painel de desempenho (tecla P ou ?perf=1). Lê os números 2×/s; verde/amarelo/vermelho pelo FPS e travadas. */
export function PerfHud() {
  const [, tick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => tick((v) => v + 1), 500); return () => window.clearInterval(id); }, []);
  const s = perfStats;
  const tone = (good: boolean, ok: boolean) => (good ? '#7CFC9A' : ok ? '#ffd166' : '#ff6b6b');
  return (
    <div className="perf-hud" aria-hidden="true">
      <b style={{ color: tone(s.fps >= 55, s.fps >= 30) }}>{s.fps.toFixed(0)} FPS</b>
      <span>quadro {s.avgMs.toFixed(1)} ms</span>
      <span style={{ color: tone(s.worstMs < 34, s.worstMs < 80) }}>pior {s.worstMs.toFixed(0)} ms</span>
      <span>desenhos {s.calls}</span>
      <span>triângulos {(s.tris / 1e6).toFixed(2)} mi</span>
      <span>resolução {s.dpr.toFixed(2)}×</span>
      <span>bichos {s.creatures}</span>
    </div>
  );
}
