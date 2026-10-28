/**
 * ZONA SUL — desenho do CARRO VOADOR (public/zona-sul/car.glb, compactado por tools/zona-sul/optimize-car.mjs: 500 mil →
 * ~26 mil triângulos, 60 → 1,6 MB). O modelo é MEDIDO ao carregar: escala pro comprimento CAR.LENGTH, frente no maior
 * eixo, base no chão. Inclina nas curvas e balança de leve (flutuando). Na água rasante deixa RASTRO (anéis que abrem
 * e somem — 16 reaproveitados, nada criado por quadro).
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CAR, type ZsCar } from './zs-car';
import { zsWaterYAt } from './zs-terrain-data';

export const CAR_URL = '/zona-sul/car.glb';
/** Se a frente do modelo ficar pra trás, girar 180° aqui (conferido na tela). */
export const CAR_MODEL_YAW = 0;
export type CarDims = { length: number; width: number; height: number };

const RINGS = 16, RING_LIFE = 1.2, RING_EVERY = 0.08;

export function ZsCarView({ carRef, dimsRef }: { carRef: React.MutableRefObject<ZsCar | null>; dimsRef: React.MutableRefObject<CarDims | null> }) {
  const { scene } = useGLTF(CAR_URL);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const m = scene.clone(true);
    m.traverse((o) => { const mesh = o as THREE.Mesh; if (mesh.isMesh) { mesh.castShadow = true; mesh.receiveShadow = true; } });
    const holder = new THREE.Group(); holder.add(m);
    let box = new THREE.Box3().setFromObject(m);
    const size = box.getSize(new THREE.Vector3());
    if (size.x > size.z) m.rotation.y = Math.PI / 2; // maior eixo horizontal vira a FRENTE (z)
    m.rotation.y += CAR_MODEL_YAW;
    m.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(m);
    const s2 = box.getSize(new THREE.Vector3());
    const k = CAR.LENGTH / Math.max(s2.z, 1e-6);
    m.scale.multiplyScalar(k);
    m.updateMatrixWorld(true);
    box = new THREE.Box3().setFromObject(m);
    const c = box.getCenter(new THREE.Vector3());
    m.position.sub(new THREE.Vector3(c.x, box.min.y, c.z));
    const fin = box.getSize(new THREE.Vector3());
    dimsRef.current = { length: fin.z, width: fin.x, height: fin.y };
    return holder;
  }, [scene, dimsRef]);

  // rastro na água
  const rings = useMemo(() => {
    const geo = new THREE.RingGeometry(0.55, 0.72, 28).rotateX(-Math.PI / 2);
    return Array.from({ length: RINGS }, () => {
      const mat = new THREE.MeshBasicMaterial({ color: '#e8f4f8', transparent: true, opacity: 0, depthWrite: false });
      const mesh = new THREE.Mesh(geo, mat); mesh.visible = false; mesh.renderOrder = 3;
      return { mesh, age: RING_LIFE };
    });
  }, []);
  const emitAcc = useRef(0), next = useRef(0), clock = useRef(0);

  useFrame((_, dt) => {
    const c = carRef.current, g = group.current;
    if (!c || !g) return;
    clock.current += dt;
    const bob = Math.sin(clock.current * 2.1) * (c.flying ? 0.12 : 0.035);
    g.position.set(c.x, c.y + bob, c.z);
    g.rotation.set(0, c.yaw, 0);
    g.rotateZ(-c.steerVis * 0.16);                           // inclina na curva
    g.rotateX(-Math.min(0.14, Math.max(-0.14, c.vy * 0.025 + c.speed * 0.002))); // bico sobe subindo / desce descendo
    // anéis
    emitAcc.current += dt;
    if (c.overWater && c.altitude < 1.5 && Math.abs(c.speed) > 2 && emitAcc.current >= RING_EVERY) {
      emitAcc.current = 0;
      const r = rings[next.current]!; next.current = (next.current + 1) % RINGS;
      const back = (dimsRef.current?.length ?? CAR.LENGTH) * 0.42;
      const rx = c.x - Math.sin(c.yaw) * back, rz = c.z - Math.cos(c.yaw) * back;
      r.mesh.position.set(rx, zsWaterYAt(rx, rz) + 0.03, rz);
      r.age = 0; r.mesh.visible = true;
    }
    for (const r of rings) {
      if (r.age >= RING_LIFE) continue;
      r.age += dt;
      const k = r.age / RING_LIFE;
      r.mesh.scale.setScalar(1 + k * 3.2);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - k);
      if (k >= 1) r.mesh.visible = false;
    }
  });

  return (
    <>
      <group ref={group}><primitive object={model} /></group>
      {rings.map((r, i) => <primitive key={i} object={r.mesh} />)}
    </>
  );
}
useGLTF.preload(CAR_URL);
