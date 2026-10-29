/**
 * ZONA SUL — a PRANCHA de surf no mundo (GLB do Pedro, compactado por tools/zona-sul/optimize-car.mjs → 9,4 mil
 * triângulos / 0,36 MB). Mede o modelo, escala pro comprimento BOARD_LEN, bico pra +z, deck pra cima. Segue `poseRef`.
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

export const BOARD_URL = '/zona-sul/board.glb';
export const BOARD_LEN = 2.7; // m — Pedro 28/10: "a prancha está pequena" (2,0 → 2,7, tipo longboard)
export const BOARD_WIDEN = 1.4; // largura × 1,4 (≈ 0,9 m): os dois pés cabem no deck

export type BoardPose = { x: number; y: number; z: number; yaw: number; roll: number; visible: boolean };
export const newBoardPose = (): BoardPose => ({ x: 0, y: 0, z: 0, yaw: 0, roll: 0, visible: false });

export function ZsBoardView({ poseRef }: { poseRef: React.MutableRefObject<BoardPose> }) {
  const { scene } = useGLTF(BOARD_URL);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const c = scene.clone(true);
    const box = new THREE.Box3().setFromObject(c), size = box.getSize(new THREE.Vector3());
    // eixo mais comprido = comprimento; deixa ele em +z (o GLB já vem deitado com o comprimento em z)
    if (size.x > size.z && size.x > size.y) c.rotation.y = Math.PI / 2;
    // o GLB vem DE CABEÇA PRA BAIXO (quilhas pra cima — Pedro: "a prancha está ao contrário"): desvira no eixo do comprimento
    c.rotation.z = Math.PI;
    c.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(c), s2 = b2.getSize(new THREE.Vector3());
    const k = BOARD_LEN / Math.max(s2.x, s2.y, s2.z);
    c.scale.multiplyScalar(k);
    // mais LARGA (Pedro: "aumentar a área onde fica em pé, a largura") — a base do Zombie abre os pés na diagonal.
    // A largura do modelo é o x LOCAL dele (o comprimento já está em z e o giro é só no eixo z)
    c.scale.x *= BOARD_WIDEN;
    c.updateMatrixWorld(true);
    const b3 = new THREE.Box3().setFromObject(c), ctr = b3.getCenter(new THREE.Vector3());
    c.position.sub(new THREE.Vector3(ctr.x, b3.max.y, ctr.z)); // origem no DECK (em cima, no meio): os pés pisam aqui
    c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return c;
  }, [scene]);
  useFrame(() => {
    const g = group.current, p = poseRef.current; if (!g) return;
    g.visible = p.visible;
    if (!p.visible) return;
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(0, p.yaw, p.roll, 'YXZ');
  });
  return <group ref={group} visible={false}><primitive object={model} /></group>;
}
useGLTF.preload(BOARD_URL);
