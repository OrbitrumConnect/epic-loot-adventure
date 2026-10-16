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
// three-mesh-bvh: só o primeiro acerto = mais rápido.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(ray as any).firstHitOnly = true;
const ORIGIN = new THREE.Vector3();
const DOWN = new THREE.Vector3(0, -1, 0);

/** O quanto o jogador consegue SUBIR por quadro (degrau/ladeira). O raycast parte
 *  um pouco acima dos pés, então ladeira sobe mas parede vertical não (anda em volta). */
const STEP_UP = 0.7;

/**
 * Altura do CHÃO logo abaixo dos pés do jogador em (x,z), a partir de `fromY`
 * (Y atual dos pés). O raio sai de `fromY + STEP_UP` pra baixo e pega a PRIMEIRA
 * superfície — o piso onde ele pisa, NÃO o topo da montanha lá em cima. É isso
 * que deixa ENTRAR na caverna (anda no piso sob o teto) em vez de subir no topo.
 * `-Infinity` quando não há malha ali (cai no fallback procedural).
 */
export function terrainMeshY(x: number, z: number, fromY: number): number {
  if (terrains.size === 0) return -Infinity;
  ORIGIN.set(x, fromY + STEP_UP, z);
  ray.set(ORIGIN, DOWN);
  ray.far = fromY + STEP_UP + 80; // alcança o chão bem abaixo
  let best = -Infinity;
  for (const root of terrains) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}

/**
 * Altura do TOPO da malha em (x,z) — raycast de bem alto pra baixo. Usado por
 * INIMIGOS e PROPS (árvore/pedra) que ficam SOBRE a montanha (superfície de cima,
 * sem entrar em caverna). `-Infinity` quando não há malha ali.
 */
export function terrainMeshTopY(x: number, z: number): number {
  if (terrains.size === 0) return -Infinity;
  ORIGIN.set(x, 500, z);
  ray.set(ORIGIN, DOWN);
  ray.far = 700;
  let best = -Infinity;
  for (const root of terrains) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}

/* ---- PAREDES (labirinto): colisão horizontal simples ---- */
const walls = new Set<THREE.Object3D>();

/** Registra uma malha de PAREDE (ex.: labirinto) p/ bloqueio horizontal (BVH). */
export function registerWall(root: THREE.Object3D): () => void {
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = m.geometry as any;
    if (m.isMesh && g && !g.boundsTree) g.computeBoundsTree();
  });
  walls.add(root);
  return () => { walls.delete(root); };
}

/** Altura do topo da parede em (x,z) — raycast de cima. `-Infinity` se não há parede.
 *  No corredor o raio pega o chão (baixo) ou nada; na parede pega o topo (alto). */
export function wallHeightAt(x: number, z: number): number {
  if (walls.size === 0) return -Infinity;
  ORIGIN.set(x, 500, z);
  ray.set(ORIGIN, DOWN);
  ray.far = 700;
  let best = -Infinity;
  for (const root of walls) {
    const hits = ray.intersectObject(root, true);
    if (hits.length > 0 && hits[0]!.point.y > best) best = hits[0]!.point.y;
  }
  return best;
}
