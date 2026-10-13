import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { ForestBatch, fadeMaterial, type ForestPlacement } from './forest-models';
import { rand, type Palette } from './world-kit';
import type { FadeSphere } from './occlusion';

const spheres: FadeSphere[] = [];

/** Folded, curved blades form real silhouettes in both game cameras. */
export function GroundCover({ placements, c }: { placements: ForestPlacement[]; c: Palette }) {
  const assets = useMemo(() => {
    const positions: number[] = [], colors: number[] = [];
    const low = new THREE.Color(c.pine);
    const high = new THREE.Color(c.grass).lerp(new THREE.Color(c.leaf), 0.45);
    const color = new THREE.Color();
    for (let blade = 0; blade < 28; blade++) {
      const a = blade * 2.39996;
      const rootRadius = rand(blade + 51) * 0.2;
      const rootX = Math.cos(a) * rootRadius, rootZ = Math.sin(a) * rootRadius;
      const height = 0.33 + rand(blade + 17) * 0.64;
      const lean = 0.1 + rand(blade + 31) * 0.34;
      const point = (t: number, side: number) => {
        const width = (1 - t) * (0.015 + rand(blade + 8) * 0.022);
        return [rootX + Math.cos(a) * t * t * lean - Math.sin(a) * side * width,
          t * height - Math.abs(side) * width * 0.25,
          rootZ + Math.sin(a) * t * t * lean + Math.cos(a) * side * width];
      };
      for (let segment = 0; segment < 5; segment++) {
        const t = segment / 5, next = (segment + 1) / 5;
        const a0 = point(t, -1), b = point(t, 1), d = point(next, -1), e = point(next, 1);
        color.copy(low).lerp(high, 0.2 + t * 0.8);
        for (const v of [a0, b, d, b, e, d]) {
          positions.push(...v);
          colors.push(color.r, color.g, color.b);
        }
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const source = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, side: THREE.DoubleSide });
    const material = fadeMaterial(source);
    source.dispose();
    const time = { value: 0 };
    const fadeCompile = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
      fadeCompile.call(material, shader, renderer);
      shader.uniforms['uCoverTime'] = time;
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uCoverTime;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float phase = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.4;
          transformed.x += sin(uCoverTime * 1.4 + phase + position.y) * position.y * position.y * 0.07;`);
    };
    material.customProgramCacheKey = () => 'ground-cover-wind-fade-v1';
    return { geometry, material, time };
  }, [c]);
  useFrame(({ clock }) => { assets.time.value = clock.elapsedTime; });
  useEffect(() => () => { assets.geometry.dispose(); assets.material.dispose(); }, [assets]);
  return <ForestBatch geometry={assets.geometry} material={assets.material} placements={placements} spheres={spheres} />;
}
