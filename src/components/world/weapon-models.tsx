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
import { useThree } from '@react-three/fiber';
import { useMemo } from 'react';
import * as THREE from 'three';
import { extendKTX2, primeKTX2 } from './ktx2-gltf';

export const RIFLE_URL = '/models/weapons/rifle.glb';
export const PISTOL_URL = '/models/weapons/pistol.glb';

type Spec = { url: string; length: number; yaw: number; grip: [number, number] };
// Pega a 36% do comprimento (era 50%): arma ~16 cm pra frente — a coronha atravessava as costas
// no disparo (Pedro, 22/10: 12 cm melhorou, pediu mais 4–5 cm).
const RIFLE: Spec = { url: RIFLE_URL, length: 1.15, yaw: -Math.PI / 2, grip: [0.36, 0.6] };
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

/**
 * ARCO TRIBAL (03/11, Pedro: "o arco está poly estranho, por quê?!" — era o arco DE CAIXINHAS do código; o pack do Meshy
 * trouxe o arco tribal: 747 mil tri → 14,9 mil, 31 MB → 0,73 MB, só a cor 1024 KTX2, fosco). No arquivo ele está deitado
 * na DIAGONAL (desenho de foto): eixo comprido (0,693; −0,721; 0) com 2,48 de ponta a ponta, a CORDA reta do lado
 * (0,721; 0,693; 0) e a empunhadura no meio do corpo, do outro lado (medido: PCA dos vértices + perfil por fatias).
 * Aqui fica na pega do arco antigo: comprido → +Y (em pé na mão), corda → +X, empunhadura na origem.
 */
export const BOW_URL = '/models/weapons/bow_tribal.glb';
export const BOW_FIT = {
  axis: [0.693, -0.721, 0] as const, string: [0.721, 0.693, 0] as const,
  grip: [-0.397, -0.461, 0.002] as const, span: 2.478, length: 1.15,
};
export function BowModel() {
  const { gl } = useThree();
  primeKTX2(gl);
  const { scene } = useGLTF(BOW_URL, true, true, extendKTX2);
  const obj = useMemo(() => {
    const model = scene.clone(true);
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.raycast = () => {}; } });
    const centered = new THREE.Group();
    centered.position.set(-BOW_FIT.grip[0], -BOW_FIT.grip[1], -BOW_FIT.grip[2]); // empunhadura → origem
    centered.add(model);
    // base da mão escrita no espaço do arquivo (corda, comprido, frente) → girar o arquivo pra ela = a inversa
    const x = new THREE.Vector3(...BOW_FIT.string).normalize(), y = new THREE.Vector3(...BOW_FIT.axis).normalize();
    const z = new THREE.Vector3().crossVectors(x, y);
    const turned = new THREE.Group();
    turned.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).invert();
    turned.scale.setScalar(BOW_FIT.length / BOW_FIT.span);
    turned.add(centered);
    return turned;
  }, [scene]);
  return <primitive object={obj} />;
}
