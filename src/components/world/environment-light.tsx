import { useFrame, useThree } from '@react-three/fiber';
import { useEffect } from 'react';
import * as THREE from 'three';
import type { Palette } from './world-kit';
import { nightFactor } from '@/game/systems/dayNightSystem';

/** Local reflection environment, derived from the same semantic world palette. */
export function EnvironmentLight({ c }: { c: Palette }) {
  const { gl, scene } = useThree();
  useFrame(() => { scene.environmentIntensity = 0.35 - nightFactor() * 0.23; });
  useEffect(() => {
    const sky = new THREE.Scene();
    const geometry = new THREE.SphereGeometry(20, 32, 16);
    const positions = geometry.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const horizon = new THREE.Color(c.light);
    const zenith = new THREE.Color(c['water-light']);
    const ground = new THREE.Color(c.trunk);
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i) / 20;
      color.copy(horizon).lerp(y > 0 ? zenith : ground, Math.pow(Math.abs(y), 0.45));
      color.toArray(colors, i * 3);
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
    sky.add(new THREE.Mesh(geometry, material));
    const generator = new THREE.PMREMGenerator(gl);
    const target = generator.fromScene(sky, 0.04, 0.1, 50, { size: 128 });
    const previous = scene.environment;
    const previousIntensity = scene.environmentIntensity;
    scene.environment = target.texture;
    scene.environmentIntensity = 0.35;
    generator.dispose();
    geometry.dispose();
    material.dispose();
    return () => {
      scene.environment = previous;
      scene.environmentIntensity = previousIntensity;
      target.dispose();
    };
  }, [gl, scene, c]);
  return null;
}
