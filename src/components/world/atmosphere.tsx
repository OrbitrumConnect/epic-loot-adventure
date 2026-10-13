import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { nightFactor } from '@/game/systems/dayNightSystem';
import { rand, terrainHeight, type Palette } from './world-kit';

/** A single draw call of drifting ash; no collision or gameplay state. */
export function Atmosphere({ c, paused }: { c: Palette; paused: boolean }) {
  const ref = useRef<THREE.ShaderMaterial>(null);
  const geometry = useMemo(() => {
    const g = new THREE.BufferGeometry();
    const positions = new Float32Array(240 * 3);
    const seeds = new Float32Array(240);
    for (let i = 0; i < 240; i++) {
      const x = (rand(i + 812) - 0.5) * 110;
      const z = (rand(i + 931) - 0.5) * 110;
      positions.set([x, terrainHeight(x, z) + 0.5 + rand(i + 102) * 7, z], i * 3);
      seeds[i] = rand(i + 47);
    }
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return g;
  }, []);
  const uniforms = useMemo(() => ({
    uTime: { value: 0 }, uNight: { value: 0 },
    uColor: { value: new THREE.Color(c.light) },
    uEmber: { value: new THREE.Color(c.crystal) },
  }), [c.light, c.crystal]);
  useFrame((_, delta) => {
    if (!ref.current) return;
    if (!paused) uniforms.uTime.value += Math.min(delta, 0.05);
    uniforms.uNight.value = nightFactor();
  });
  return (
    <points geometry={geometry} frustumCulled={false} raycast={() => {}}>
      <shaderMaterial ref={ref} uniforms={uniforms} transparent depthWrite={false}
        blending={THREE.AdditiveBlending}
        vertexShader={`
          attribute float aSeed;
          uniform float uTime;
          varying float vSeed;
          void main() {
            vSeed = aSeed;
            vec3 p = position;
            p.x += sin(uTime * 0.17 + aSeed * 42.0) * 1.8;
            p.z += cos(uTime * 0.13 + aSeed * 28.0) * 1.2;
            p.y += sin(uTime * 0.36 + aSeed * 64.0) * 0.3;
            vec4 view = modelViewMatrix * vec4(p, 1.0);
            gl_Position = projectionMatrix * view;
            gl_PointSize = clamp(58.0 / max(8.0, -view.z), 1.0, 3.5);
          }
        `}
        fragmentShader={`
          uniform vec3 uColor, uEmber;
          uniform float uTime, uNight;
          varying float vSeed;
          void main() {
            float d = length(gl_PointCoord - 0.5);
            float alpha = (1.0 - smoothstep(0.05, 0.5, d));
            alpha *= 0.12 + 0.24 * pow(sin(uTime * 0.8 + vSeed * 80.0), 2.0);
            gl_FragColor = vec4(mix(uColor, uEmber, uNight), alpha);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `}
      />
    </points>
  );
}
