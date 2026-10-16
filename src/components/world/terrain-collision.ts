/**
 * Colisão por MALHA do terreno (planície + montanhas) — deixa o jogador ANDAR no
 * relevo real e SUBIR nas montanhas, não só no `terrainHeight` procedural plano.
 *
 * Como: cada terreno registrado tem um BVH (three-mesh-bvh) nas geometrias →
 * raycast de cima pra baixo em O(log n) (microssegundos, 1 por frame). A altura
 * da malha entra num `Math.max` com o terreno procedural, então o jogador fica
 * sempre na superfície MAIS ALTA (chão plano onde a malha ~0; montanha onde sobe).
 *
 * Caverna "por dentro" (passar sob um teto) é fase seguinte (cápsula horizontal):
 * o raycast de cima pega a superfície do TOPO, então hoje isto dá subir/andar,
 * não entrar embaixo.
 */
import * as THREE from 'three';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';

// Patch único: geometrias COM boundsTree usam BVH; as sem caem no raycast padrão.
/* eslint-disable @typescript-eslint/no-explicit-any */
(THREE.BufferGeometry.prototype as any).computeBoundsTree = computeBoundsTree;
(THREE.BufferGeometry.prototype as any).disposeBoundsTree = disposeBoundsTree;
(THREE.Mesh.prototype as any).raycast = acceleratedRaycast;
/* eslint-enable @typescript-eslint/no-explicit-any */

const terrains = new Set<THREE.Object3D>();

/** Registra um terreno (planície/montanha) p/ colisão de malha; constrói o BVH
 *  de cada geometria. Devolve o cleanup pra desregistrar ao desmontar. */
export function registerTerrain(root: THREE.Object3D): () => void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = m.geometry as any;
    if (m.isMesh && g && !g.boundsTree) g.computeBoundsTree();
  });
  terrains.add(root);
  return () => { terrains.delete(root); };
}

const ray = new THREE.Raycaster();
ray.far = 800;
// three-mesh-bvh: só o primeiro acerto (topo) = mais rápido.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(ray as any).firstHitOnly = true;
const ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** Altura da superfície da malha de terreno em (x,z) por raycast de cima pra
 *  baixo. `-Infinity` quando não há malha ali (cai no fallback procedural). */
export function terrainMeshY(x: number, z: number): number {
  if (terrains.size === 0) return -Infinity;
  ORIGIN.set(x, 400, z);
  ray.set(ORIGIN, DOWN);
  let best = -Infinity;
  for (const root of terrains) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}
