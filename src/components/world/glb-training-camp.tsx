import { useGLTF } from '@react-three/drei';
import { modelUrl } from '@/game/asset-path';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { BASE_TRAINING_WIDTH } from '@/game/data/base-pieces';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import type { BasePiece } from '@/game/types/playerbase';
import { markPointerConsumed, palette, terrainHeight } from './world-kit';
import { trainingColliders } from './training-collider';

const WALL = modelUrl('castle/wall.glb');
const GATE = modelUrl('castle/gate.glb');
const ROOF = modelUrl('castle/tower-square-top-roof.glb');
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
  const readyPulse = useRef(0);
  // Observe committed production, not elapsed wall time or a shrinking queue:
  // cancellation must never announce a ready troop. Subscription also catches
  // completions between frames and batches resolved after a background pause.
  useEffect(() => useGameStore.subscribe((state, previous) => {
    if (state.base === previous.base) return;
    const before = previous.base.buildings.find(b => b.defId === 'war_camp');
    const after = state.base.buildings.find(b => b.defId === 'war_camp');
    const head = before?.queue[0];
    if (!head || !after || after.id !== before.id) return;
    if (!after.queue.some(item => item.id === head.id)
      && (state.base.troops[head.unitId] ?? 0) > (previous.base.troops[head.unitId] ?? 0)) {
      readyPulse.current = 1.25;
    }
  }), []);
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
    // A low, open drill yard: equipment, rather than a house roof, is its identity.
    const rank = Math.max(0, Math.min(20, level));
    const progress = Math.max(0, rank - 1) / 19;
    const materials = [masonry, cover, entry];
    const material = (color: string, metalness = 0) => {
      const value = new THREE.MeshStandardMaterial({ color, metalness,
        roughness: 0.9, clippingPlanes: [clipPlane], side: THREE.DoubleSide });
      materials.push(value);
      return value;
    };
    const wood = material(colors.trunk);
    const leather = material(colors.path);
    const rust = material(colors.cloak);
    const ochre = material(colors.gold);
    const iron = material(colors.metal, 0.35);
    const earth = material(colors['ground-light']);
    // Only these geometries belong to this instance; cached GLB geometry stays shared.
    const geometries: THREE.BufferGeometry[] = [new THREE.BoxGeometry(1, 1, 1),
      new THREE.CylinderGeometry(1, 1, 1, 10), new THREE.ConeGeometry(1, 1, 4),
      new THREE.SphereGeometry(1, 8, 6)];
    const shape = (geometry: number, mat: THREE.Material,
      x: number, y: number, z: number, sx: number, sy: number, sz: number,
      rx = 0, ry = 0, rz = 0) => {
      const mesh = new THREE.Mesh(geometries[geometry], mat);
      mesh.position.set(x, y, z);
      mesh.scale.set(sx, sy, sz);
      mesh.rotation.set(rx, ry, rz);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      model.add(mesh);
      return mesh;
    };
    const spear = (x: number, y: number, z: number, height: number, tilt = 0) => {
      const assembly = new THREE.Group();
      const shaft = shape(1, wood, 0, height / 2, 0, 0.022, height, 0.022);
      const tip = shape(2, iron, 0, height + 0.06, 0, 0.065, 0.17, 0.04);
      assembly.add(shaft, tip);
      assembly.position.set(x, y, z);
      assembly.rotation.z = tilt;
      model.add(assembly);
    };
    shape(0, earth, 0, 0.035, 0, TRAINING_FOOTPRINT, 0.07, TRAINING_FOOTPRINT);
    const wallHeight = rank === 0 ? 0.18 : 0.27 + progress * 0.29;
    addPart(wall.scene, 1.7, wallHeight, 0.12, 0, 0.07, -0.77, 0, masonry);
    for (const side of [-1, 1]) {
      addPart(wall.scene, 1.54, wallHeight, 0.12, side * 0.77, 0.07, 0, Math.PI / 2, masonry);
    }
    if (rank > 0) {
      const lintel = 1.05 + progress * 0.55;
      // An open timber gateway, capped by the same crossed-spear insignia at every rank.
      for (const side of [-1, 1]) {
        shape(0, wood, side * 0.61, lintel / 2, 0.65, 0.09, lintel, 0.09);
        shape(0, leather, side * 0.61, lintel - 0.12, 0.65, 0.105, 0.075, 0.105);
      }
      shape(0, wood, 0, lintel, 0.65, 1.38, 0.1, 0.12);
      spear(-0.24, lintel - 0.18, 0.67, 0.68, -0.62);
      spear(0.24, lintel - 0.18, 0.67, 0.68, 0.62);
      shape(1, rust, 0, lintel + 0.08, 0.70, 0.16, 0.055, 0.19, Math.PI / 2);
      shape(1, ochre, 0, lintel + 0.08, 0.735, 0.065, 0.025, 0.065, Math.PI / 2);
      // Concentric archery target: deliberately oversized to read at gameplay distance.
      shape(0, wood, -0.46, 0.38, -0.20, 0.055, 0.66, 0.07);
      for (const [radius, z, mat] of [[0.25, -0.18, leather], [0.17, -0.13, rust],
        [0.085, -0.10, ochre]] as const) {
        shape(1, mat, -0.46, 0.70, z, radius, 0.045, radius, Math.PI / 2);
      }
      // Wrapped sparring dummy, recognizable even when the proximity cut hides the roof.
      shape(0, wood, 0.37, 0.40, 0.12, 0.055, 0.68, 0.06);
      shape(0, wood, 0.37, 0.67, 0.12, 0.48, 0.055, 0.06, 0, 0, -0.12);
      shape(1, leather, 0.37, 0.59, 0.12, 0.12, 0.32, 0.10);
      shape(3, leather, 0.37, 0.87, 0.12, 0.10, 0.12, 0.09);
      shape(1, rust, 0.37, 0.54, 0.12, 0.125, 0.065, 0.105);
      // One extra stored spear each two levels makes intermediate upgrades visible.
      shape(0, wood, 0, 0.40, -0.61, 1.1, 0.06, 0.06);
      for (let i = 0; i < Math.ceil(rank / 2); i++) {
        spear(-0.49 + i * 0.105, 0.10, -0.61, 0.66 + (i % 2) * 0.08);
      }
      if (rank >= 5) {
        // A shallow hide canopy covers the armory only, preserving the open yard.
        for (const side of [-1, 1]) {
          shape(0, wood, side * 0.69, lintel / 2, -0.62, 0.08, lintel, 0.08);
        }
        addPart(roof.scene, 1.58, 0.28 + progress * 0.18, 0.65,
          0, lintel - 0.15, -0.48, 0, leather);
        shape(0, rust, 0, lintel - 0.12, -0.14, 1.54, 0.13, 0.045);
      }
      if (rank >= 10) {
        addPart(gate.scene, 1.5, lintel + 0.04, 0.12, 0, 0, 0.65, 0, wood);
        // Compact forge/anvil, with a constant ember material; no lights or animation loop.
        shape(0, masonry, -0.50, 0.18, 0.34, 0.38, 0.24, 0.32);
        shape(0, rust, -0.50, 0.31, 0.34, 0.28, 0.035, 0.22);
        shape(0, ochre, -0.50, 0.33, 0.34, 0.14, 0.025, 0.12);
        shape(0, iron, -0.50, 0.42, 0.34, 0.12, 0.17, 0.12);
        shape(0, iron, -0.50, 0.51, 0.34, 0.34, 0.08, 0.16);
      }
      if (rank >= 15) {
        for (const side of [-1, 1]) {
          const top = lintel + 0.50 + (rank - 15) * 0.035;
          shape(1, wood, side * 0.76, top / 2, -0.44, 0.027, top, 0.027);
          shape(0, rust, side * 0.60, top - 0.30, -0.44, 0.29, 0.48, 0.025);
          shape(0, ochre, side * 0.60, top - 0.30, -0.42, 0.12, 0.12, 0.018, 0, 0, Math.PI / 4);
          shape(2, iron, side * 0.76, top + 0.05, -0.44, 0.055, 0.15, 0.055);
        }
      }
      if (rank === 20) {
        // Forged corner armor marks the completed veteran lodge, without a tower silhouette.
        for (const x of [-0.76, 0.76]) {
          for (const z of [-0.76, 0.65]) {
            shape(0, iron, x, 0.42, z, 0.13, 0.70, 0.13);
            shape(2, ochre, x, 0.83, z, 0.09, 0.15, 0.09);
          }
        }
      }
    }
    // Fixed signal pool: two reused primitives and one ring, no lights/shadows.
    // Signal sits above the silhouette even when the proximity cut hides the gate.
    const signal = new THREE.Group();
    const signalHeight = 1.75 + progress * 0.65;
    const pole = shape(1, wood, 0.65, signalHeight / 2, -0.48,
      0.025, signalHeight, 0.025);
    const clothMaterial = material(colors.gold);
    clothMaterial.clippingPlanes = null;
    clothMaterial.emissive.set(colors.gold);
    const cloth = shape(0, clothMaterial, -0.23, -0.19, 0, 0.46, 0.38, 0.035);
    const pennant = new THREE.Group();
    pennant.position.set(0.65, signalHeight, -0.48);
    pennant.add(cloth);
    signal.add(pole, pennant);
    pole.castShadow = cloth.castShadow = false;
    pole.receiveShadow = cloth.receiveShadow = false;
    signal.visible = false;
    model.add(signal);
    const pulseGeometry = new THREE.RingGeometry(0.87, 1, 32);
    geometries.push(pulseGeometry);
    const pulseMaterial = material(colors.gold);
    pulseMaterial.clippingPlanes = null;
    pulseMaterial.emissive.set(colors.gold);
    pulseMaterial.emissiveIntensity = 1.5;
    pulseMaterial.transparent = true;
    pulseMaterial.forceSinglePass = true;
    pulseMaterial.depthWrite = false;
    pulseMaterial.toneMapped = false;
    const pulse = new THREE.Mesh(pulseGeometry, pulseMaterial);
    pulse.rotation.x = -Math.PI / 2;
    pulse.visible = false;
    model.add(pulse);
    // Fixed centered bounds: ornaments never enlarge the published placement footprint.
    return { model, materials, geometries, signal, pennant, clothMaterial, pulse, pulseMaterial,
      halfX: TRAINING_FOOTPRINT / 2, halfZ: TRAINING_FOOTPRINT / 2 };
  }, [wall.scene, gate.scene, roof.scene, clipPlane, level]);
  useEffect(() => () => {
    prepared.materials.forEach(material => material.dispose());
    prepared.geometries.forEach(geometry => geometry.dispose());
  }, [prepared]);

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

  useFrame(({ camera, clock }, delta) => {
    const state = useGameStore.getState();
    const player = state.player.position;
    const dx = player.x - center.x, dz = player.z - center.z;
    // Ortográfica é a vista iso. Corte local só perto: mantém a silhueta à distância.
    clipPlane.constant = camera instanceof THREE.OrthographicCamera && dx * dx + dz * dz < 16
      ? groundY + 1.22 : 1e6;
    // Indexed scan avoids a per-frame selector callback/temporary collection.
    let training = false;
    for (let i = 0; i < state.base.buildings.length; i++) {
      const building = state.base.buildings[i];
      if (building?.defId === 'war_camp') {
        training = building.level > 0 && building.queue.length > 0;
        break;
      }
    }
    prepared.signal.visible = training;
    if (training) {
      const beat = Math.sin(clock.elapsedTime * 5);
      prepared.pennant.rotation.y = beat * 0.35;
      prepared.pennant.rotation.z = beat * 0.12;
      prepared.clothMaterial.emissiveIntensity = 0.35 + (beat + 1) * 0.3;
    }
    prepared.pulse.visible = level > 0 && readyPulse.current > 0;
    if (readyPulse.current > 0) {
      const progress = 1 - readyPulse.current / 1.25;
      prepared.pulse.position.y = 0.85 + progress * 0.9;
      prepared.pulse.scale.setScalar(0.4 + progress * 1.1);
      prepared.pulseMaterial.opacity = (1 - progress) * 0.85;
      // Cap resumed-tab delta so a completion still receives visible feedback.
      readyPulse.current = Math.max(0, readyPulse.current - Math.min(delta, 0.05));
    }
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
