import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { capGrassPlacements, GRASS_CAP } from '@/components/world/billboards';
import { hasGreenSurfaceSample, isGreenSurfaceColor } from '@/components/world/terrain-collision';

describe('grama nas superfícies sutis do spawn', () => {
  it('aceita verde sutil fora do centro e rejeita areia/pedra', () => {
    const subtleSpawn = new THREE.Color(0.5, 0.35, 0.3);
    const sand = new THREE.Color(0.7, 0.43, 0.3);
    const stone = new THREE.Color(0.45, 0.45, 0.48);

    expect(isGreenSurfaceColor(subtleSpawn)).toBe(true);
    expect(isGreenSurfaceColor(sand)).toBe(false);
    expect(isGreenSurfaceColor(stone)).toBe(false);
    expect(hasGreenSurfaceSample(isGreenSurfaceColor, sand, subtleSpawn)).toBe(true);
  });

  it('mantém o teto de tufos', () => {
    const candidates = Array.from({ length: GRASS_CAP + 100 }, (_, i) => ({ x: i, z: -i }));
    expect(capGrassPlacements(candidates)).toHaveLength(GRASS_CAP);
  });
});
