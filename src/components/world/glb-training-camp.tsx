import { useGLTF } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { BASE_TRAINING_WIDTH } from '@/game/data/base-pieces';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import type { BasePiece } from '@/game/types/playerbase';
import { markPointerConsumed, palette, terrainHeight } from './world-kit';
import { trainingColliders } from './training-collider';

const WALL = '/models/castle/wall.glb';
const GATE = '/models/castle/gate.glb';
const ROOF = '/models/castle/tower-square-top-roof.glb';
/** Uma célula de 2 m, com 10 cm de margem em cada lado. */
export const TRAINING_FOOTPRINT = BASE_TRAINING_WIDTH;

/** Corpo do war_camp existente. Nível e obra vêm exclusivamente da cidade. */
export function GlbTrainingCamp({ piece }: { piece: BasePiece }) {
  const warCamp = useGameStore(s => s.base.buildings.find(b => b.defId === 'war_camp'));
  const level = warCamp?.level ?? 0;
  const wall = useGLTF(WALL);
  const gate = useGLTF(GATE);
  const roof = useGLTF(ROOF);
  const gl = useThree(s => s.gl);
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), []);
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]);

  const prepared = useMemo(() => {
    const colors = palette();
    const masonry = new THREE.MeshStandardMaterial({
      color: level >= 10 ? colors['rock-light'] : colors.trunk,
      roughness: 0.9, clippingPlanes: [clipPlane], side: THREE.DoubleSide,
    });
    const cover = new THREE.MeshStandardMaterial({
      color: level >= 15 ? colors.gold : colors.cloak,
      roughness: 0.85, clippingPlanes: [clipPlane], side: THREE.DoubleSide,
    });
    const entry = new THREE.MeshStandardMaterial({
      color: colors.armor, roughness: 0.85, clippingPlanes: [clipPlane], side: THREE.DoubleSide,
    });
    const model = new THREE.Group();
    const addPart = (source: THREE.Object3D, width: number, height: number, depth: number,
      x: number, y: number, z: number, yaw: number, material: THREE.Material) => {
      const object = source.clone(true);
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      object.scale.set(width / (size.x || 1), height / (size.y || 1), depth / (size.z || 1));
      const scaled = new THREE.Box3().setFromObject(object);
      object.position.set(-(scaled.min.x + scaled.max.x) / 2, -scaled.min.y, -(scaled.min.z + scaled.max.z) / 2);
      object.traverse(node => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.material = material;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
      const part = new THREE.Group();
      part.add(object);
      part.position.set(x, y, z);
      part.rotation.y = yaw;
      model.add(part);
    };
    const wallHeight = level > 0 ? 1.25 : 0.4;
    addPart(wall.scene, 1.7, wallHeight, 0.16, 0, 0, -0.77, 0, masonry);
    addPart(wall.scene, 1.54, wallHeight, 0.16, -0.77, 0, 0, Math.PI / 2, masonry);
    addPart(wall.scene, 1.54, wallHeight, 0.16, 0.77, 0, 0, Math.PI / 2, masonry);
    addPart(gate.scene, 1.7, wallHeight, 0.16, 0, 0, 0.77, 0, entry);
    if (level > 0) addPart(roof.scene, TRAINING_FOOTPRINT, 0.65, TRAINING_FOOTPRINT,
      0, wallHeight, 0, 0, cover);
    const bounds = new THREE.Box3().setFromObject(model);
    return { model, materials: [masonry, cover, entry],
      halfX: (bounds.max.x - bounds.min.x) / 2, halfZ: (bounds.max.z - bounds.min.z) / 2 };
  }, [wall.scene, gate.scene, roof.scene, clipPlane, level]);
  useEffect(() => () => prepared.materials.forEach(material => material.dispose()), [prepared]);

  const center = cellCenter(piece.cell);
  const groundY = terrainHeight(center.x, center.z);
  useEffect(() => {
    const rotated = piece.rotation === 90 || piece.rotation === 270;
    const collider = { pieceId: piece.id, cx: center.x, cz: center.z,
      halfX: rotated ? prepared.halfZ : prepared.halfX,
      halfZ: rotated ? prepared.halfX : prepared.halfZ };
    trainingColliders.push(collider);
    return () => {
      const index = trainingColliders.indexOf(collider);
      if (index >= 0) trainingColliders.splice(index, 1);
    };
  }, [piece.id, piece.rotation, center.x, center.z, prepared.halfX, prepared.halfZ]);

  useFrame(({ camera }) => {
    const player = useGameStore.getState().player.position;
    const dx = player.x - center.x, dz = player.z - center.z;
    // Ortográfica é a vista iso. Corte local só perto: mantém a silhueta à distância.
    clipPlane.constant = camera instanceof THREE.OrthographicCamera && dx * dx + dz * dz < 16
      ? groundY + 1.22 : 1e6;
  });

  // Clique no corpo abre o painel de treino. markPointerConsumed impede que o
  // mesmo clique vire ataque no terreno (wasPointerConsumed em game-world).
  // Em modo de construção o pointerdown é capturado antes pelo canvas
  // (player-base.tsx, stopImmediatePropagation), então este handler nem dispara.
  const openTraining = useCallback((e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    markPointerConsumed(e.nativeEvent);
    useGameStore.getState().setPanel('training');
  }, []);
  const onPointerOver = useCallback((e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    document.body.style.cursor = 'pointer';
  }, []);
  const onPointerOut = useCallback(() => { document.body.style.cursor = ''; }, []);
  useEffect(() => () => { document.body.style.cursor = ''; }, []);

  return <group position={[center.x, groundY, center.z]} rotation={[0, piece.rotation * Math.PI / 180, 0]}
    userData={{ trainingCamp: true, pieceId: piece.id, buildingId: warCamp?.id, level }}
    onPointerDown={openTraining} onPointerOver={onPointerOver} onPointerOut={onPointerOut}>
    <primitive object={prepared.model} dispose={null} />
  </group>;
}

/** Montagem independente dos InstancedMesh e do singleton da casa. */
export function GlbTrainingCamps() {
  const pieces = useGameStore(s => s.playerBase?.pieces);
  const camps = useMemo(() => (pieces ?? []).filter(piece => piece.kind === 'training'), [pieces]);
  return <>{camps.map(piece => <GlbTrainingCamp key={piece.id} piece={piece} />)}</>;
}
