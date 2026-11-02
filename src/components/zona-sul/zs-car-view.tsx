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
import { CAR, carGone, type ZsCar } from './zs-car';
import { zsWaterYAt } from './zs-terrain-data';
import { makeShipHpBar } from './zs-warship-view';
import { zsCtx } from './zs-context';

export const CAR_URL = '/zona-sul/car.glb';
/** Se a frente do modelo ficar pra trás, girar 180° aqui (conferido na tela). */
export const CAR_MODEL_YAW = 0;
export type CarDims = { length: number; width: number; height: number };

const RINGS = 16, RING_LIFE = 1.2, RING_EVERY = 0.08;

/** Monta o carro a partir do GLB: frente no maior eixo, comprimento CAR.LENGTH, base no chão. O MESMO do carro local e
 *  do carro de OUTRO jogador (zs-remote-vehicles) — geometria compartilhada. */
export function buildCarModel(scene: THREE.Object3D): { holder: THREE.Group; dims: CarDims } {
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
  return { holder, dims: { length: fin.z, width: fin.x, height: fin.y } };
}

export function ZsCarView({ carRef, dimsRef }: { carRef: React.MutableRefObject<ZsCar | null>; dimsRef: React.MutableRefObject<CarDims | null> }) {
  const { scene } = useGLTF(CAR_URL);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => {
    const { holder, dims } = buildCarModel(scene);
    dimsRef.current = dims;
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
  // VIDA (01/11): barra igual à do herói (a mesma do navio, menor) + EXPLOSÃO (bola de fogo + fumaça) ao zerar
  const hpBar = useMemo(() => makeShipHpBar(3.2, 0.3), []);
  const boom = useMemo(() => {
    const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
    const smoke = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 10), new THREE.MeshBasicMaterial({ color: '#2b2622', transparent: true, opacity: 0, depthWrite: false }));
    fire.visible = false; smoke.visible = false; fire.renderOrder = 4; smoke.renderOrder = 3;
    return { fire, smoke };
  }, []);

  useFrame((state, dt) => {
    const c = carRef.current, g = group.current;
    if (!c || !g) return;
    clock.current += dt;
    g.visible = !carGone(c);
    const wreck = c.wreckT;
    hpBar.group.position.set(c.x, c.y + (dimsRef.current?.height ?? 1.6) + 0.9, c.z);
    hpBar.set(c.hp / CAR.HP, wreck === null && (c.hp < CAR.HP || zsCtx.driving), state.camera);
    boom.fire.visible = boom.smoke.visible = wreck !== null && wreck < CAR.WRECK_S + 1.5;
    if (wreck !== null) {
      const kf = Math.min(1, wreck / 0.8), ks = Math.min(1, wreck / (CAR.WRECK_S + 1.5));
      boom.fire.position.set(c.x, c.y + 1, c.z); boom.fire.scale.setScalar(1 + kf * 5);
      (boom.fire.material as THREE.MeshBasicMaterial).opacity = 0.9 * (1 - kf);
      boom.smoke.position.set(c.x, c.y + 1.5 + ks * 6, c.z); boom.smoke.scale.setScalar(1.5 + ks * 7);
      (boom.smoke.material as THREE.MeshBasicMaterial).opacity = 0.55 * (1 - ks);
      g.position.set(c.x, c.y, c.z); g.rotation.set(0.25, c.yaw, 0.35); // carcaça tombada
      return;
    }
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
      <primitive object={hpBar.group} />
      <primitive object={boom.fire} />
      <primitive object={boom.smoke} />
    </>
  );
}
useGLTF.preload(CAR_URL);
