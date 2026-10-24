/**
 * Modelos GLB dos EFEITOS dos poderes (Meshy, otimizados: ~4–8 mil triângulos, textura 512
 * WebP, vértices SEM compactar). Cada um normaliza pelo próprio tamanho (caixa) — trocar o GLB
 * por outro mantém o tamanho no jogo.
 */
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';

export const FX_BOOMERANG_URL = '/models/fx/boomerang.glb';
export const FX_HURRICANE_URL = '/models/fx/hurricane.glb';
export const FX_ARROW_URL = '/models/fx/arrow.glb';

/** Clona o GLB e escala pelo MAIOR lado da caixa até `size` metros, centrado. */
function useNormalized(url: string, size: number, center: 'middle' | 'base' = 'middle') {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const o = scene.clone(true);
    const box = new THREE.Box3().setFromObject(o);
    const dim = box.getSize(new THREE.Vector3());
    const k = size / (Math.max(dim.x, dim.y, dim.z) || 1);
    o.scale.setScalar(k);
    const c = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
    o.position.set(-c.x, center === 'base' ? -box.min.y * k : -c.y, -c.z);
    o.traverse((m) => { if ((m as THREE.Mesh).isMesh) { (m as THREE.Mesh).castShadow = true; m.raycast = () => {}; } });
    const wrap = new THREE.Group();
    wrap.add(o);
    return wrap;
  }, [scene, size, center]);
}

/** Bumerangue Mad Max: deitado (gira no plano do chão), ~0,9 m de ponta a ponta (herói; a base usa maior). */
export function BoomerangModel({ size = 0.9 }: { size?: number }) {
  const model = useNormalized(FX_BOOMERANG_URL, size);
  // O modelo é chato no eixo Z → deita (Z vira vertical) pra girar como hélice no chão.
  return <primitive object={model} rotation={[-Math.PI / 2, 0, 0]} />;
}

/** Furacão: em pé, ~3,6 m (herói; a base usa maior), SEMI-TRANSPARENTE (Pedro) — material próprio, sem escrever profundidade. */
export function HurricaneModel({ opacity = 0.5, size = 3.6 }: { opacity?: number; size?: number }) {
  const model = useNormalized(FX_HURRICANE_URL, size, 'base');
  const mats = useMemo(() => {
    const out: THREE.Material[] = [];
    model.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh) return;
      const mat = (mesh.material as THREE.MeshStandardMaterial).clone();
      mat.transparent = true;
      mat.opacity = opacity;
      mat.depthWrite = false;
      mat.side = THREE.DoubleSide;
      mesh.material = mat;
      mesh.castShadow = false;
      out.push(mat);
    });
    return out;
  }, [model, opacity]);
  useEffect(() => () => mats.forEach((m) => m.dispose()), [mats]);
  return <primitive object={model} />;
}

/** Flecha: geometria + material prontos pro POOL de projéteis (comprimento 0,55 m, ponta em +Y). */
export function useArrowAsset(): { geometry: THREE.BufferGeometry; material: THREE.Material } {
  const { scene } = useGLTF(FX_ARROW_URL);
  return useMemo(() => {
    let mesh: THREE.Mesh | null = null;
    scene.traverse((o) => { if (!mesh && (o as THREE.Mesh).isMesh) mesh = o as THREE.Mesh; });
    const src = mesh as THREE.Mesh | null;
    const geometry = (src?.geometry ?? new THREE.CylinderGeometry(0.025, 0.025, 0.55, 5)).clone();
    geometry.computeBoundingBox();
    const bb = geometry.boundingBox!;
    const len = bb.max.y - bb.min.y || 1;
    geometry.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -(bb.min.z + bb.max.z) / 2);
    geometry.scale(0.55 / len, 0.55 / len, 0.55 / len);
    const material = src ? (src.material as THREE.Material).clone() : new THREE.MeshStandardMaterial({ color: '#caa36a' });
    return { geometry, material };
  }, [scene]);
}
