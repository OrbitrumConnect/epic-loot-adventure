export type CreatureCameraMode = 'iso' | 'third' | 'free';

export function shouldMountCreature(
  distSq: number,
  radius: number,
  alreadyMounted: boolean,
  cameraMode: CreatureCameraMode = 'iso',
) {
  if (cameraMode === 'free') return true;
  const enterSq = radius * radius;
  const exitRadius = radius + 15;
  return alreadyMounted ? distSq <= exitRadius * exitRadius : distSq <= enterSq;
}
