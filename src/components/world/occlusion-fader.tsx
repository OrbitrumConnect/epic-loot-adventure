/** Roda `updateOcclusion` uma vez por quadro. Não renderiza nada. */
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { updateOcclusion } from './occlusion';

export function OcclusionFader({ playerRef, paused }: { playerRef: React.RefObject<THREE.Group | null>; paused?: boolean }) {
  useFrame((state, delta) => {
    const p = playerRef.current;
    if (!p || paused) return;
    updateOcclusion(state.camera, p, delta);
  });
  return null;
}
