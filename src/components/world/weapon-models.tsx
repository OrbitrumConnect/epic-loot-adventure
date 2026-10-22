/**
 * Armas de fogo GLB (pistola e fuzil — Pedro, 22/10) na MESMA pega das armas antigas: cano pra
 * +Z, topo pra +Y, cabo na origem (onde a mão segura). Só a "skin" muda; quem posiciona na mão,
 * mira reta no disparo e anima continua sendo o herói (`glb-hero-mixamo`).
 *
 * Medido nos GLB (depois da rotação do próprio arquivo, já em pé): fuzil com cano em +X (ponta
 * fina) e cabo no meio; pistola com cano em −X (só o ferrolho) e cabo descendo do lado +X.
 * `grip` = ponto da mão em fração da caixa (x ao longo do comprimento, y da altura).
 */
import { useGLTF } from '@react-three/drei';
import { useMemo } from 'react';
import * as THREE from 'three';

export const RIFLE_URL = '/models/weapons/rifle.glb';
export const PISTOL_URL = '/models/weapons/pistol.glb';

type Spec = { url: string; length: number; yaw: number; grip: [number, number] };
const RIFLE: Spec = { url: RIFLE_URL, length: 1.15, yaw: -Math.PI / 2, grip: [0.5, 0.6] };
const PISTOL: Spec = { url: PISTOL_URL, length: 0.45, yaw: Math.PI / 2, grip: [0.75, 0.66] };

function useWeapon({ url, length, yaw, grip }: Spec): THREE.Group {
  const { scene } = useGLTF(url);
  return useMemo(() => {
    const model = scene.clone(true);
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const k = length / (size.x || 1);
    model.scale.multiplyScalar(k);
    // Ponto da mão (no espaço do modelo já escalado) vai pra origem.
    const hand = new THREE.Vector3(
      box.min.x + size.x * grip[0],
      box.min.y + size.y * grip[1],
      (box.min.z + box.max.z) / 2,
    ).multiplyScalar(k);
    const centered = new THREE.Group();
    centered.position.copy(hand).multiplyScalar(-1);
    centered.add(model);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.raycast = () => {};
    });
    const turned = new THREE.Group();
    turned.rotation.y = yaw; // cano → +Z (frente do herói)
    turned.add(centered);
    return turned;
  }, [scene, length, yaw, grip]);
}

export function RifleModel() {
  return <primitive object={useWeapon(RIFLE)} />;
}
export function PistolModel() {
  return <primitive object={useWeapon(PISTOL)} />;
}
