import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ForestBatch, fadeMaterial, type ForestPlacement } from './forest-models';
import { rand, type Palette } from './world-kit';
import type { FadeSphere } from './occlusion';

const spheres: FadeSphere[] = [[0, 0.3, 0, 0.16], [0, 0.72, 0, 0.48]];
type Species = 'oak' | 'pine';

// Two reusable crowns: curved tapered branches, individual folded leaves.
// Local coordinates match ForestPlacement: height 1, crown width about 1.
function treeGeometry(species: Species, seed: number, c: Palette) {
  const wood: THREE.BufferGeometry[] = [];
  const leafPositions: number[] = [];
  const leafColors: number[] = [];
  const leafDark = new THREE.Color(species === 'pine' ? c.pine : c.leaf);
  const leafLight = new THREE.Color(c['leaf-light']);
  const color = new THREE.Color();
  const branch = (points: THREE.Vector3[], radius: number) => {
    const curve = new THREE.CatmullRomCurve3(points);
    const tube = new THREE.TubeGeometry(curve, 9, radius, 7, false);
    const p = tube.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const t = Math.floor(i / 8) / 9;
      const center = curve.getPointAt(t);
      const taper = 1 - t * 0.91;
      p.setXYZ(i, center.x + (p.getX(i) - center.x) * taper,
        center.y + (p.getY(i) - center.y) * taper,
        center.z + (p.getZ(i) - center.z) * taper);
    }
    tube.computeVertexNormals();
    const nonIndexed = tube.toNonIndexed();
    nonIndexed.deleteAttribute('uv');
    wood.push(nonIndexed);
    tube.dispose();
  };
  branch([new THREE.Vector3(), new THREE.Vector3(0.015, 0.35, -0.01), new THREE.Vector3(-0.012, 0.72, 0.025), new THREE.Vector3(0.02, 1, 0)], species === 'oak' ? 0.047 : 0.028);
  for (let i = 0; i < 7; i++) {
    const a = i * Math.PI * 2 / 7;
    branch([new THREE.Vector3(Math.cos(a) * 0.13, 0.002, Math.sin(a) * 0.13), new THREE.Vector3(Math.cos(a) * 0.05, 0.025, Math.sin(a) * 0.05), new THREE.Vector3(0, 0.17, 0)], 0.023);
  }
  const count = species === 'oak' ? 19 : 36;
  for (let i = 0; i < count; i++) {
    const s = seed + i * 97;
    const a = i * 2.39996 + rand(s) * 0.4;
    const h = species === 'oak' ? 0.4 + rand(s + 1) * 0.48 : 0.27 + i / count * 0.66;
    const reach = species === 'oak' ? 0.22 + rand(s + 2) * 0.2 : (1 - h) * 0.56;
    const end = new THREE.Vector3(Math.cos(a) * reach, h + (species === 'oak' ? 0.12 : -0.035), Math.sin(a) * reach);
    branch([new THREE.Vector3(0, h - 0.12, 0), new THREE.Vector3(end.x * 0.45, h - 0.02, end.z * 0.45), end], species === 'oak' ? 0.018 : 0.01);
    for (let j = 0; j < (species === 'oak' ? 90 : 65); j++) {
      const k = s + j * 7.137;
      const theta = rand(k + 3) * Math.PI * 2;
      const spread = Math.sqrt(rand(k + 4));
      const radius = species === 'oak' ? 0.155 : 0.09;
      const center = end.clone().multiplyScalar(species === 'pine' ? 0.3 + rand(k + 8) * 0.7 : 1);
      if (species === 'pine') center.y = h - 0.02 + rand(k + 9) * 0.035;
      center.add(new THREE.Vector3(Math.cos(theta) * spread * radius, (rand(k + 5) - 0.35) * radius * 0.75, Math.sin(theta) * spread * radius));
      const length = species === 'oak' ? 0.026 + rand(k + 6) * 0.018 : 0.035;
      const width = length * (species === 'oak' ? 0.48 : 0.2);
      const along = new THREE.Vector3(Math.cos(theta), (rand(k + 10) - 0.5) * 0.7, Math.sin(theta)).normalize().multiplyScalar(length);
      const across = new THREE.Vector3(-Math.sin(theta), 0.22, Math.cos(theta)).multiplyScalar(width);
      const root = center.clone().sub(along);
      const tip = center.clone().add(along);
      const left = center.clone().add(across);
      const right = center.clone().sub(across);
      const ridge = center.clone().add(new THREE.Vector3(0, width * 0.45, 0));
      color.copy(leafDark).lerp(leafLight, rand(k + 12) * 0.65);
      for (const v of [root, left, ridge, left, tip, ridge, tip, right, ridge, right, root, ridge]) {
        leafPositions.push(v.x, v.y, v.z);
        leafColors.push(color.r, color.g, color.b);
      }
    }
  }
  const bark = mergeGeometries(wood, false)!;
  wood.forEach(g => g.dispose());
  const leaves = new THREE.BufferGeometry();
  leaves.setAttribute('position', new THREE.Float32BufferAttribute(leafPositions, 3));
  leaves.setAttribute('color', new THREE.Float32BufferAttribute(leafColors, 3));
  leaves.computeVertexNormals();
  return { bark, leaves };
}

export function LivingTrees({ placements, species, c }: { placements: ForestPlacement[]; species: Species; c: Palette }) {
  const assets = useMemo(() => {
    const geometries = treeGeometry(species, species === 'oak' ? 441 : 887, c);
    const barkSource = new THREE.MeshStandardMaterial({ color: c.trunk, roughness: 0.93 });
    const barkMaterial = fadeMaterial(barkSource);
    const compile = barkMaterial.onBeforeCompile;
    barkMaterial.onBeforeCompile = (shader, renderer) => {
      compile.call(barkMaterial, shader, renderer);
      shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 barkLocal;').replace('#include <begin_vertex>', '#include <begin_vertex>\nbarkLocal = position;');
      shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 barkLocal;').replace('#include <color_fragment>', `#include <color_fragment>
        float ridge = sin(atan(barkLocal.z, barkLocal.x) * 35.0 + sin(barkLocal.y * 22.0) * 1.7);
        float grain = sin(barkLocal.y * 280.0 + barkLocal.x * 630.0 + barkLocal.z * 380.0);
        diffuseColor.rgb *= 0.84 + 0.15 * ridge + 0.06 * grain;`);
    };
    barkMaterial.customProgramCacheKey = () => 'living-bark-fade-v1';
    const leafSource = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.82 });
    const leafMaterial = fadeMaterial(leafSource);
    barkSource.dispose();
    leafSource.dispose();
    return { ...geometries, barkMaterial, leafMaterial };
  }, [species, c]);
  useEffect(() => () => Object.values(assets).forEach(asset => asset.dispose()), [assets]);
  return <>
    <ForestBatch geometry={assets.bark} material={assets.barkMaterial} placements={placements} spheres={spheres} />
    <ForestBatch geometry={assets.leaves} material={assets.leafMaterial} placements={placements} spheres={spheres} />
  </>;
}
