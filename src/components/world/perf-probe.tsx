import { useFrame } from '@react-three/fiber';
import { useRef } from 'react';
import { useGameStore } from '@/game/state/game-store';
import { celStats } from './cel-shade';
import { accumulateFrame, perfStats } from './perf-stats';

/** Medidor dentro da cena: só soma tempos e copia contadores 2×/s (custo desprezível). */
export function PerfProbe() {
  const acc = useRef({ t: 0, n: 0, worst: 0 });
  useFrame((state, delta) => {
    const w = accumulateFrame(acc.current, delta);
    if (!w) return;
    perfStats.fps = w.fps;
    perfStats.avgMs = w.avgMs;
    perfStats.worstMs = w.worstMs;
    perfStats.calls = celStats.sceneDrawCalls || state.gl.info.render.calls;
    perfStats.tris = celStats.sceneTriangles || state.gl.info.render.triangles;
    perfStats.dpr = state.gl.getPixelRatio();
    perfStats.creatures = useGameStore.getState().creatures.filter((c) => c.behavior !== 'dead').length;
    perfStats.version++;
  });
  return null;
}
