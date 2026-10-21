import { useThree } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { useEffect, useState } from 'react';

type GpuStatsValue = { geometries: number; textures: number; calls: number; triangles: number };
const EMPTY: GpuStatsValue = { geometries: 0, textures: 0, calls: 0, triangles: 0 };

export function GpuStats() {
  const renderer = useThree(({ gl }) => gl);
  const enabled = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('gpustats');
  const [stats, setStats] = useState(EMPTY);

  useEffect(() => {
    if (!enabled) return;
    const read = () => setStats({
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
    });
    read();
    const timer = window.setInterval(read, 1000);
    return () => window.clearInterval(timer);
  }, [enabled, renderer]);

  if (!enabled) return null;
  return (
    <Html fullscreen style={{ pointerEvents: 'none' }}>
      <div style={{ position: 'fixed', top: 8, right: 8, zIndex: 1000, padding: '6px 8px', color: '#d8f3dc', background: 'rgba(0,0,0,.75)', font: '12px/1.4 monospace' }}>
        <div>geometries: {stats.geometries}</div>
        <div>textures: {stats.textures}</div>
        <div>calls: {stats.calls}</div>
        <div>triangles: {stats.triangles}</div>
      </div>
    </Html>
  );
}
