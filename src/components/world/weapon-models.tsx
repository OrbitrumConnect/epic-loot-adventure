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
 * Na mão: comprido → +Y (em pé), CORDA → −Z (pra trás, voltada pro herói — 03/11), empunhadura na origem.
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
    // base da mão escrita no espaço do arquivo → girar o arquivo pra ela = a inversa. 03/11 (Pedro: "o arco parece do lado
    // contrário"): a mão é +Z = frente, +Y = cima (a mesma do fuzil) → comprido em pé (+Y), a CORDA pra trás (−Z, voltada
    // pro herói) e o corpo do arco pra frente — antes a corda ia pro lado (+X).
    const y = new THREE.Vector3(...BOW_FIT.axis).normalize(), z = new THREE.Vector3(...BOW_FIT.string).normalize().negate();
    const x = new THREE.Vector3().crossVectors(y, z);
    const turned = new THREE.Group();
    turned.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).invert();
    turned.scale.setScalar(BOW_FIT.length / BOW_FIT.span);
    turned.add(centered);
    return turned;
  }, [scene]);
  return <primitive object={obj} />;
}

/**
 * FERRAMENTAS GLB (03/11, Pedro: "veja novos GLBs pra picareta, machado etc. — ajustar, otimizado, no tamanho ideal, no
 * local correto; é só trocar a skin das que já tem"). Do pack do Meshy (550 mil–1,35 mi tri, 45–64 MB cada) →
 * meshopt + só a cor 1024 KTX2, fosco: machado 7,8 mil tri / 0,55 MB, picareta 6,6 mil / 0,47 MB, tocha 16 mil / 0,85 MB,
 * adaga pirata (vira a ESPADA) 7,8 mil / 0,52 MB. Mesma pega das desenhadas: CABO → +Z da mão (pé do cabo um pouco atrás
 * da mão), cabeça/gume → +Y, empunhadura na origem. Eixos e empunhadura MEDIDOS nos vértices (silhueta + fatias):
 * machado/picareta/tocha em pé no arquivo (+Y), cabeça em cima (gume do machado em −X); a adaga deitada na diagonal.
 */
export type PropFit = { url: string; z: readonly [number, number, number]; y: readonly [number, number, number]; grip: readonly [number, number, number]; span: number; length: number };
export const AXE_FIT: PropFit = { url: '/models/tools/axe.glb', z: [0, 1, 0], y: [-1, 0, 0], grip: [0.246, -0.75, 0.001], span: 1.898, length: 1.06 };
export const PICKAXE_FIT: PropFit = { url: '/models/tools/pickaxe.glb', z: [0, 1, 0], y: [-1, 0, 0], grip: [-0.022, -0.665, -0.018], span: 1.772, length: 1.08 };
export const TORCH_FIT: PropFit = { url: '/models/tools/torch.glb', z: [0, 1, 0], y: [1, 0, 0], grip: [-0.014, -0.721, -0.008], span: 1.902, length: 0.95 };
/** adaga: lâmina (ponta) → +Z; o lado da curva da lâmina → +X (o plano da guarda, igual à espada desenhada) */
export const DAGGER_FIT: PropFit = { url: '/models/tools/dagger.glb', z: [-0.666, -0.746, 0.003], y: [0, 0, -1], grip: [0.656, 0.596, 0.01], span: 2.608, length: 1.05 };
function useFitProp(f: PropFit): THREE.Group {
  const { gl } = useThree();
  primeKTX2(gl);
  const { scene } = useGLTF(f.url, true, true, extendKTX2);
  return useMemo(() => {
    const model = scene.clone(true);
    model.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.raycast = () => {}; } });
    const centered = new THREE.Group();
    centered.position.set(-f.grip[0], -f.grip[1], -f.grip[2]); // empunhadura → origem
    centered.add(model);
    const z = new THREE.Vector3(...f.z).normalize(), y = new THREE.Vector3(...f.y);
    y.addScaledVector(z, -y.dot(z)).normalize();
    const x = new THREE.Vector3().crossVectors(y, z);
    const turned = new THREE.Group();
    turned.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)).invert(); // base da mão no arquivo → girar = a inversa
    turned.scale.setScalar(f.length / f.span);
    turned.add(centered);
    return turned;
  }, [scene, f]);
}
export function AxeModel() { return <primitive object={useFitProp(AXE_FIT)} />; }
export function PickaxeModel() { return <primitive object={useFitProp(PICKAXE_FIT)} />; }
export function TorchModel() { return <primitive object={useFitProp(TORCH_FIT)} />; }
export function DaggerModel() { return <primitive object={useFitProp(DAGGER_FIT)} />; }

/**
 * BAZUCA (04/11, GLB do Pedro — Meshy: 234 mil tri / 32 MB → 11,7 mil / 0,66 MB, só a cor 1024 KTX2, fosco). No arquivo o
 * tubo está deitado em X (1,9) com a BOCA em −X (o guarda-mato e a mira da frente desse lado; o pé do cabo inclina pra +X,
 * o lado de quem atira), o cabo de pistola pendurado em −Y e a mão no topo dele (0,16; −0,12; 0) — medido nas fatias.
 * Na mão (mesma pega do fuzil): boca → +Z, cima → +Y; 1,35 m (~0,8 m pra frente da mão, ~0,55 pra trás, no ombro).
 */
export const BAZOOKA_FIT: PropFit = { url: '/models/weapons/bazooka.glb', z: [-1, 0, 0], y: [0, 1, 0], grip: [0.16, -0.12, 0], span: 1.903, length: 1.35 };
/** o MÍSSIL que voa (Meshy: 330 mil tri / 35 MB → 4 mil / 0,25 MB; ogiva em −X, aletas em +X) */
export const MISSILE_URL = '/models/weapons/missile.glb';
export function BazookaModel() { return <primitive object={useFitProp(BAZOOKA_FIT)} />; }
