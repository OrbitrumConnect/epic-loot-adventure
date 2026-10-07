/**
 * Alvo e rota no mundo.
 *
 * Com uma criatura selecionada (clique) ou uma caçada ativa do piloto
 * (`hunt_creature`), mostra:
 *  - um marcador (cone dourado girando e balançando) acima da barra de vida;
 *  - uma trilha no chão do jogador até o alvo: tracinhos que marcham em
 *    direção ao alvo e somem nas pontas. É uma reta (sem pathfinding): só diz
 *    "para lá".
 *
 * Custo: um `InstancedMesh` de `MAX_DASHES` planos + um cone, nenhum
 * `setState`, nenhuma alocação por quadro. Escondido sem alvo.
 */
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { activeHuntTargetId, creatureAnchors, labelScaleFor } from './hostile-ai';
import { getTargetId } from './objective-bridge';
import { pixelsPerUnit, terrainHeight } from './world-kit';

const MAX_DASHES = 30;
const SPACING = 1.7;
const TRIM = 1.6; // não desenha colado no jogador nem no alvo
const GOLD = '#f3c95a';
const HUNT = '#ff7a4a';

const dummy = new THREE.Object3D();
const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
const yaw = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);

const noRaycast = () => {};

export function TargetRoute({ playerRef }: { playerRef: React.RefObject<THREE.Group | null> }) {
  const marker = useRef<THREE.Mesh>(null);
  const dashes = useRef<THREE.InstancedMesh>(null);
  const dashGeo = useMemo(() => new THREE.PlaneGeometry(1.05, 0.45), []);
  const dashMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    [],
  );
  const markerGeo = useMemo(() => new THREE.ConeGeometry(0.5, 1, 4), []);
  const markerMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: GOLD, depthTest: false, depthWrite: false, transparent: true, opacity: 0.95, toneMapped: false }),
    [],
  );
  const t = useRef(0);

  useFrame((state, delta) => {
    t.current += delta;
    const m = marker.current;
    const d = dashes.current;
    const p = playerRef.current;
    if (!m || !d || !p) return;

    const hunt = activeHuntTargetId();
    const sel = getTargetId();
    const idle = useGameStore.getState().objectives.mode === 'idle';
    const id = idle ? (hunt ?? sel) : (sel ?? hunt);
    const anc = id ? creatureAnchors.get(id) : undefined;
    if (!id || !anc || !anc.alive) {
      m.visible = false;
      d.visible = false;
      return;
    }
    const isHunt = id === hunt;
    const color = isHunt ? HUNT : GOLD;
    if (markerMat.color.getHexString() !== color.slice(1)) {
      markerMat.color.set(color);
      dashMat.color.set(color);
    }

    // --- marcador ---
    const cam = state.camera;
    const dist = cam.position.distanceTo(m.position);
    const ppu = pixelsPerUnit(cam, state.size.height, dist);
    const px = THREE.MathUtils.clamp(34 / ppu, 0.35, 2.4);
    const barSc = labelScaleFor(cam, state.size.height, dist, true);
    const bob = Math.sin(t.current * (isHunt ? 7 : 4.5)) * 0.12 * px;
    m.visible = true;
    m.position.set(anc.x, anc.y + anc.top + barSc * 0.36 + px * 0.65 + bob, anc.z);
    m.rotation.set(Math.PI, t.current * 2.2, 0);
    m.scale.set(px * 0.8, px, px * 0.8);

    // --- trilha ---
    const sx = p.position.x;
    const sz = p.position.z;
    const dx = anc.x - sx;
    const dz = anc.z - sz;
    const len = Math.sqrt(dx * dx + dz * dz);
    const n = Math.min(MAX_DASHES, Math.floor((len - TRIM * 2) / SPACING));
    if (n <= 0) { d.visible = false; return; }
    d.visible = true;
    d.count = n;
    const ux = dx / len;
    const uz = dz / len;
    yaw.setFromAxisAngle(UP, Math.atan2(-uz, ux));
    yaw.multiply(flat);
    const phase = (t.current * 1.1) % 1;
    for (let i = 0; i < n; i++) {
      const dd = TRIM + (i + phase) * SPACING;
      const x = sx + ux * dd;
      const z = sz + uz * dd;
      // some nas pontas e afina na direção do alvo
      const edge = Math.min(1, (dd - TRIM) / 1.2, (len - TRIM - dd) / 1.2);
      const s = Math.max(0, edge) * (1 - 0.45 * (i / MAX_DASHES));
      dummy.position.set(x, terrainHeight(x, z) + 0.08, z);
      dummy.quaternion.copy(yaw);
      dummy.scale.set(s, s, 1);
      dummy.updateMatrix();
      d.setMatrixAt(i, dummy.matrix);
    }
    d.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <mesh ref={marker} geometry={markerGeo} material={markerMat} visible={false} renderOrder={15} raycast={noRaycast} />
      <instancedMesh
        ref={dashes}
        args={[dashGeo, dashMat, MAX_DASHES]}
        visible={false}
        frustumCulled={false}
        raycast={noRaycast}
      />
    </>
  );
}
