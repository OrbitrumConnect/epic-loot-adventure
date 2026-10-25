import { useGLTF } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { extendKTX2, preloadKTX2GLTF, primeKTX2 } from './ktx2-gltf';
import { registerTerrain } from './terrain-collision';
import { terrainDetail } from './terrain-detail';

/**
 * Chão principal do mapa: GLB rio-wasteland FIXO no código (determinístico, vai pro
 * online/mobile — ao contrário da colocação pelo Editor, que fica só no localStorage).
 * Mesma normalização do PlacedObject do editor (span→4 + pivô) e o transform que o
 * Pedro ajustou. De-shine (matte, mantém cor) + colisão (registerTerrain/BVH): o
 * player pisa em cima, e os props (árvore/pedra/camp/fábrica) assentam via glbSurfaceY.
 */
const URL = '/models/map/rio-wasteland-iconic.glb';
const POS: [number, number, number] = [2.2, 9.6, 22.5];
const YAW = -1.3;
const SCALE: [number, number, number] = [80.3, 78.3, 71.2];

/**
 * DETALHE DO CHÃO (ideia do mod "Better Terrain", Pedro 25/10): a textura do mapa é uma só, esticada em ~260 m →
 * de perto fica lisa/borrada. Aqui 2 camadas de ruído pela posição de MUNDO, direto no shader: grão de ~1 m e
 * variação de tom de ~4 m (±7% de luz, leve puxão pro oliva escuro). Sem imagem nova; ~30 contas por pixel do chão.
 * Força num uniform (0→1) — liga/desliga sem recompilar (tecla L).
 */
const detailUniform = { value: 0 };
const DETAIL_GLSL = `
varying vec3 vDetailW;
uniform float uDetail;
float dHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float dNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(dHash(i), dHash(i + vec2(1.0, 0.0)), u.x), mix(dHash(i + vec2(0.0, 1.0)), dHash(i + vec2(1.0, 1.0)), u.x), u.y);
}`;
const DETAIL_APPLY = `
if (uDetail > 0.001) {
  float grain = dNoise(vDetailW.xz * 1.1) - 0.5;
  float patchN = dNoise(vDetailW.xz * 0.25 + 17.0) - 0.5;
  diffuseColor.rgb *= 1.0 + uDetail * (grain * 0.10 + patchN * 0.14);
  diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.86, 0.94, 0.80), uDetail * max(0.0, patchN) * 0.35);
}`;
function addDetail(mat: THREE.MeshStandardMaterial) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms['uDetail'] = detailUniform;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDetailW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDetailW = (modelMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>${DETAIL_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>${DETAIL_APPLY}`);
  };
  mat.customProgramCacheKey = () => 'terrain-detail-v1';
}

/** Tira brilho mantendo cor (mesmo princípio do makeMatte/editor). */
function matte(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) {
      const pm = mat as THREE.MeshStandardMaterial;
      if (!pm || !('roughness' in pm)) continue;
      pm.metalnessMap = null; pm.metalness = 0;
      pm.roughnessMap = null; pm.roughness = 1;
      pm.envMapIntensity = 0;
      // Nitidez da textura (ela veio pequena e o mapa foi esticado): anisotropia alta
      // + mipmaps trilineares tiram o serrilhado/borrão na vista rasante. Resolução
      // REAL só re-exportando a textura maior — isto é o máximo sem trocar o arquivo.
      if (pm.map) {
        pm.map.anisotropy = 16;
        pm.map.minFilter = THREE.LinearMipmapLinearFilter;
        pm.map.magFilter = THREE.LinearFilter;
        pm.map.generateMipmaps = true;
        pm.map.needsUpdate = true;
      }
      addDetail(pm);
      pm.needsUpdate = true;
    }
  });
}

export function MapFloor() {
  // KTX2/Basis (piloto): o renderer (gl) tem que ser informado ao KTX2Loader ANTES do
  // useGLTF carregar o GLB basisu — por isso prime no corpo, antes da linha do useGLTF.
  const gl = useThree((s) => s.gl);
  primeKTX2(gl);
  const { scene } = useGLTF(URL, true, true, extendKTX2);
  const ref = useRef<THREE.Group>(null);
  const { model, pivot } = useMemo(() => {
    const clone = scene.clone(true);
    matte(clone);
    // Sombra: o chão RECEBE sombra (projetada por player/props/criaturas) — era isso que
    // sumiu ao trocar o mapa. Não CASTA (relevo castando pesa e não acrescenta muito),
    // mantendo a sombra leve pra performance (Pedro).
    clone.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.receiveShadow = true; m.castShadow = false; } });
    const box = new THREE.Box3().setFromObject(clone);
    const span = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, box.max.z - box.min.z) || 1;
    clone.scale.setScalar(4 / span);
    clone.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(clone);
    return { model: clone, pivot: b2.getCenter(new THREE.Vector3()) };
  }, [scene]);
  useEffect(() => {
    if (!ref.current) return;
    // Marca como FONTE DE GRAMA: só o chão do mapa recebe os tufos (a varredura de
    // manchas verdes ignora tudo que não tem esta flag — ex.: a ponte, que também é
    // registrada como terreno pra colisão, não deve ganhar mato).
    ref.current.userData['grassSource'] = true;
    return registerTerrain(ref.current);
  }, [model]);
  // Transição suave da força do detalhe (tecla L).
  useFrame((_, dt) => {
    const want = terrainDetail.on ? 1 : 0;
    const d = want - detailUniform.value;
    if (d !== 0) detailUniform.value += Math.sign(d) * Math.min(Math.abs(d), dt * 3);
  });
  const [px, py, pz] = POS;
  const [sx, sy, sz] = SCALE;
  return (
    <group ref={ref} position={[px + pivot.x * sx, py + pivot.y * sy, pz + pivot.z * sz]} rotation={[0, YAW, 0]} scale={SCALE}>
      <group position={[-pivot.x, -pivot.y, -pivot.z]}><primitive object={model} /></group>
    </group>
  );
}

preloadKTX2GLTF(URL);
