import { useGLTF } from '@react-three/drei';
import { Suspense, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import treeUrl from '../../../art/packs/01-ashland-lowpoly/models/ashroot-tree.glb?url';
import { registerInstancedFade, type FadeSphere } from './occlusion';
import { rand, terrainHeight, type Palette } from './world-kit';
import { glbSurfaceY, useTerrainVersion } from './terrain-collision';
import { pbrMaps } from './pbr-materials';

export type ForestPlacement = { x: number; z: number; w: number; h: number; yaw: number };
const treeSpheres: FadeSphere[] = [[0, 0.25, 0, 0.2], [0, 0.65, 0, 0.34]];
const rockSpheres: FadeSphere[] = [[0, 0.42, 0, 0.48]];

// Opaque dithering keeps depth ordering and the existing camera occlusion system.
export function fadeMaterial(source: THREE.Material): THREE.Material {
  const material = source.clone();
  material.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade; varying float forestFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nforestFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float forestFade;')
      .replace('#include <alphatest_fragment>', `#include <alphatest_fragment>
        float forestNoise = fract(sin(dot(floor(gl_FragCoord.xy), vec2(12.9898,78.233))) * 43758.5453);
        if (forestFade < 0.999 && forestNoise > forestFade) discard;`);
  };
  material.customProgramCacheKey = () => 'forest-opaque-fade-v1';
  return material;
}

export function ForestBatch({ geometry, material, placements, spheres, yOffset = 0 }: {
  geometry: THREE.BufferGeometry; material: THREE.Material;
  placements: ForestPlacement[]; spheres: FadeSphere[];
  /** Desloca o Y (m) após o terreno. Pedras usam -0.25 p/ semienterrar; árvores ficam em 0. */
  yOffset?: number;
}) {
  const ref = useRef<THREE.InstancedMesh>(null);
  // aFade belongs to a batch, never to the cached GLTF geometry.
  const ownGeometry = useMemo(() => geometry.clone(), [geometry]);
  useEffect(() => () => ownGeometry.dispose(), [ownGeometry]);
  const tv = useTerrainVersion();
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    placements.forEach((p, i) => {
      dummy.position.set(p.x, glbSurfaceY(p.x, p.z, terrainHeight(p.x, p.z)) + yOffset, p.z);
      dummy.rotation.set(0, p.yaw + rand(p.x * 9 + p.z) * Math.PI * 2, 0);
      dummy.scale.set(p.w, p.h, p.w);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = placements.length;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    // Sem esferas de oclusão (ex.: GRAMA) NÃO entra no sistema de fade — senão `updateOcclusion`
    // varria TODAS as instâncias (até ~62k tufos) por quadro sem trabalho útil. Árvores/pedras
    // (com esferas) seguem registrando e escondendo o herói normalmente.
    if (spheres.length === 0) return;
    return registerInstancedFade(mesh, spheres);
  }, [placements, spheres, ownGeometry, yOffset, tv]);
  return <instancedMesh ref={ref} args={[ownGeometry, material, Math.max(1, placements.length)]} castShadow receiveShadow />;
}

export function ForestTrees({ placements, c }: { placements: ForestPlacement[]; c: Palette }) {
  const { scene } = useGLTF(treeUrl);
  const parts = useMemo(() => {
    scene.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(scene);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const normalize = new THREE.Matrix4().makeScale(1 / Math.max(size.x, size.z), 1 / size.y, 1 / Math.max(size.x, size.z));
    normalize.multiply(new THREE.Matrix4().makeTranslation(-center.x, -bounds.min.y, -center.z));
    const batches = new Map<THREE.Material, THREE.BufferGeometry[]>();
    scene.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      const source = Array.isArray(object.material) ? object.material[0] : object.material;
      if (!source) return;
      let geometry = object.geometry.clone();
      geometry.applyMatrix4(new THREE.Matrix4().multiplyMatrices(normalize, object.matrixWorld));
      // The untextured sample mixes UV-bearing primitives with bare ones.
      // Normalize layouts before merging so each material stays one draw call.
      for (const name of Object.keys(geometry.attributes)) {
        if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
      }
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      if (geometry.index) {
        const indexed = geometry;
        geometry = indexed.toNonIndexed();
        indexed.dispose();
      }
      const list = batches.get(source) ?? [];
      list.push(geometry);
      batches.set(source, list);
    });
    const treeMaterial = (source: THREE.Material) => {
      const material = fadeMaterial(source) as THREE.MeshStandardMaterial;
      if (material.isMeshStandardMaterial) {
        // The sample GLB leaves its bark materials white. Resolve their roles
        // through the world palette instead of spreading unpainted models.
        const name = source.name.toLowerCase();
        material.color.set(name.includes('cyan') ? c.crystal : name.includes('dark') ? c.dark : name.includes('light') ? c['rock-light'] : c.trunk);
        if (name.includes('cyan')) {
          material.emissive.set(c.crystal);
          material.emissiveIntensity = 0.7;
        } else {
          material.roughness = 0.9;
        }
      }
      return material;
    };
    return [...batches].flatMap(([material, geometries]) => {
      const merged = mergeGeometries(geometries, false);
      if (!merged) return geometries.map(geometry => ({ geometry, material: treeMaterial(material) }));
      geometries.forEach(geometry => geometry.dispose());
      return [{ geometry: merged, material: treeMaterial(material) }];
    });
  }, [scene, c]);
  useEffect(() => () => parts.forEach(part => {
    part.geometry.dispose();
    part.material.dispose();
  }), [parts]);
  return <>{parts.map((part, i) => <ForestBatch key={i} {...part} placements={placements} spheres={treeSpheres} />)}</>;
}

/** Pedras de DECORAÇÃO: forma da pedra GLB (mining-rock simplificada 75,6k→888 tri, 9,5 KB),
 *  mesmo material/degradê de antes. A forma antiga (icosaedro de 80 tri) fica de reserva enquanto
 *  o GLB carrega. Não são farmáveis (os nós de pedra/minério têm componente próprio). */
export function ForestRocks(props: { placements: ForestPlacement[]; c: Palette }) {
  return <Suspense fallback={<ForestRocksShape {...props} />}><ForestRocksGlb {...props} /></Suspense>;
}

const ROCK_DECO_URL = '/models/rocks/rock-deco.glb';
function ForestRocksGlb({ placements, c }: { placements: ForestPlacement[]; c: Palette }) {
  const { scene } = useGLTF(ROCK_DECO_URL);
  const source = useMemo(() => {
    scene.updateMatrixWorld(true);
    let mesh: THREE.Mesh | null = null;
    scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const m = mesh as THREE.Mesh | null;
    if (!m) return null;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    geo.computeBoundingBox();
    const bb = geo.boundingBox!;
    const w = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z) || 1;
    const h = (bb.max.y - bb.min.y) || 1;
    // Mesmo tamanho da forma antiga: ~1 de largura, ~0,8 de altura, base em y=0.
    geo.translate(-(bb.min.x + bb.max.x) / 2, -bb.min.y, -(bb.min.z + bb.max.z) / 2);
    geo.scale(1 / w, 0.8 / h, 1 / w);
    geo.computeVertexNormals();
    // UV em caixa (projeção pelo eixo dominante da normal) pra textura de rocha de sempre.
    const pos = geo.getAttribute('position'), nor = geo.getAttribute('normal');
    const uv = new Float32Array(pos.count * 2);
    for (let i = 0; i < pos.count; i++) {
      const ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
      const [u, v] = ay >= ax && ay >= az ? [pos.getX(i), pos.getZ(i)] : ax >= az ? [pos.getZ(i), pos.getY(i)] : [pos.getX(i), pos.getY(i)];
      uv[i * 2] = u * 1.5; uv[i * 2 + 1] = v * 1.5;
    }
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    return geo;
  }, [scene]);
  if (!source) return <ForestRocksShape placements={placements} c={c} />;
  return <ForestRocksShape placements={placements} c={c} baseGeometry={source} />;
}

function ForestRocksShape({ placements, c, baseGeometry }: { placements: ForestPlacement[]; c: Palette; baseGeometry?: THREE.BufferGeometry }) {
  const geometry = useMemo(() => {
    if (baseGeometry) {
      // Forma GLB: só aplica o degradê de cor (base escura → topo claro), como a forma antiga.
      const geo = baseGeometry.clone();
      const positions = geo.getAttribute('position');
      const colors = new Float32Array(positions.count * 3);
      const base = new THREE.Color(c.rock), light = new THREE.Color(c['rock-light']), color = new THREE.Color();
      for (let i = 0; i < positions.count; i++) { color.copy(base).lerp(light, Math.min(1, positions.getY(i) / 0.8) * 0.8); color.toArray(colors, i * 3); }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      return geo;
    }
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    const positions = geo.getAttribute('position');
    const colors = new Float32Array(positions.count * 3);
    const base = new THREE.Color(c.rock);
    const light = new THREE.Color(c['rock-light']);
    const color = new THREE.Color();
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i), y = positions.getY(i), z = positions.getZ(i);
      const rough = 1 + Math.sin(x * 19 + z * 13) * 0.12;
      positions.setXYZ(i, x * rough, Math.max(0, (y + 0.45) * 0.85), z * rough);
      color.copy(base).lerp(light, Math.max(0, y + 0.3) * 0.8);
      color.toArray(colors, i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [c.rock, c['rock-light'], baseGeometry]);
  const material = useMemo(() => {
    const source = new THREE.MeshStandardMaterial({ ...pbrMaps('worn_rock_natural_01'), roughness: 1, normalScale: new THREE.Vector2(0.8, 0.8) });
    const result = fadeMaterial(source);
    source.dispose();
    return result;
  }, []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  useEffect(() => () => material.dispose(), [material]);
  return <ForestBatch geometry={geometry} material={material} placements={placements} spheres={rockSpheres} yOffset={-0.25} />;
}
