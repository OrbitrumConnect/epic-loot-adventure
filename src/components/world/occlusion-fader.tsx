/** Roda `updateOcclusion` uma vez por quadro. Não renderiza nada. */
import { useFrame } from '@react-three/fiber';
import { useLayoutEffect } from 'react';
import * as THREE from 'three';
import { fadeLoop, updateOcclusion } from './occlusion';

export function OcclusionFader({ playerRef, paused }: { playerRef: React.RefObject<THREE.Group | null>; paused?: boolean }) {
  // avisa os lotes que o fade está vivo (aí ninguém reordena instâncias)
  useLayoutEffect(() => { fadeLoop.mounted++; return () => { fadeLoop.mounted--; }; }, []);
  useFrame((state, delta) => {
    const p = playerRef.current;
    if (!p || paused) return;
    updateOcclusion(state.camera, p, delta);
  });
  return null;
}
