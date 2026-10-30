/**
 * ZONA SUL — ASA-DELTA e SKATE VOADOR no mundo (GLBs do Pedro, compactados: 0,85 MB / 0,78 MB). Mesmo padrão da
 * prancha: mede o modelo, deixa o eixo da FRENTE em +z, escala pelo maior lado e segue `poseRef` (sem React por quadro).
 *  - skate: origem no DECK (em cima, no meio) — os pés pisam ali; "pés" de levitação brilham embaixo (luz azul fraca);
 *  - asa-delta: origem no TRAPÉZIO (embaixo) — o herói vai pendurado logo abaixo; inclina na curva (roll).
 */
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import type { BoardPose } from './zs-board-view';

export const SKATE_URL = '/zona-sul/hover-skate.glb';
export const GLIDER_URL = '/zona-sul/hang-glider.glb';
/** comprimento do skate (m) e envergadura da asa-delta (m) — asa de verdade tem ~10 m */
export const SKATE_LEN = 1.35, GLIDER_SPAN = 10;

function prepare(scene: THREE.Object3D, size: number, kind: 'skate' | 'glider'): THREE.Object3D {
  const c = scene.clone(true);
  c.updateMatrixWorld(true);
  const s0 = new THREE.Box3().setFromObject(c).getSize(new THREE.Vector3());
  // skate: comprimento → z ; asa: envergadura → x (a frente fica em z)
  if (kind === 'skate' && s0.x > s0.z) c.rotation.y = Math.PI / 2;
  if (kind === 'glider' && s0.z > s0.x) c.rotation.y = Math.PI / 2;
  c.updateMatrixWorld(true);
  if (kind === 'glider') levelGlider(c);
  const b = new THREE.Box3().setFromObject(c), s = b.getSize(new THREE.Vector3());
  const k = size / Math.max(s.x, s.y, s.z);
  c.scale.multiplyScalar(k);
  c.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(c), ctr = b2.getCenter(new THREE.Vector3());
  c.position.sub(new THREE.Vector3(ctr.x, kind === 'skate' ? b2.max.y : b2.min.y, ctr.z));
  c.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = kind === 'skate'; } });
  return c;
}

/** Vértices do modelo no espaço do "pai" do clone (sem alocar por vértice além do array de saída). */
function verts(c: THREE.Object3D): THREE.Vector3[] {
  const out: THREE.Vector3[] = [], v = new THREE.Vector3(), inv = new THREE.Matrix4().copy(c.matrixWorld).invert();
  c.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const pos = m.geometry.getAttribute('position'), mat = new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld).premultiply(c.matrix);
    const step = Math.max(1, Math.floor(pos.count / 4000)); // ~4 mil pontos bastam
    for (let i = 0; i < pos.count; i += step) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(mat).clone());
  });
  return out;
}

/** ASA-DELTA nivelada (30/10): o GLB vem com a QUILHA inclinada (~35°) e o bico pra um lado qualquer. Mede a linha
 *  central da VELA (pontos perto de x = 0, na metade de cima), gira em x pra deixá-la reta e acha o BICO (onde as
 *  bordas se encontram: as pontas das asas ficam pra TRÁS) — bico sempre em +z (a frente do voo). */
function levelGlider(c: THREE.Object3D) {
  for (let pass = 0; pass < 2; pass++) {
    c.updateMatrixWorld(true);
    const pts = verts(c);
    const box = new THREE.Box3().setFromPoints(pts), span = box.max.x - box.min.x, hgt = box.max.y - box.min.y;
    const keel = pts.filter((p) => Math.abs(p.x - (box.min.x + box.max.x) / 2) < span * 0.04 && p.y > box.min.y + hgt * 0.45);
    if (keel.length < 8) return;
    // reta y = a·z + b pelos pontos da quilha → inclinação
    let sz = 0, sy = 0, szz = 0, szy = 0;
    for (const p of keel) { sz += p.z; sy += p.y; szz += p.z * p.z; szy += p.z * p.y; }
    const n = keel.length, a = (n * szy - sz * sy) / Math.max(1e-9, n * szz - sz * sz);
    if (pass === 0) { c.rotation.x += Math.atan(a); continue; }
    // bico: as pontas das asas (|x| grande) ficam atrás do meio da quilha
    const tips = pts.filter((p) => Math.abs(p.x - (box.min.x + box.max.x) / 2) > span * 0.4);
    const keelZ = sz / n, tipsZ = tips.reduce((acc, p) => acc + p.z, 0) / Math.max(1, tips.length);
    if (tipsZ > keelZ) c.rotation.y += Math.PI; // pontas na frente = o bico está pra trás → meia volta
  }
  c.updateMatrixWorld(true);
}

export function ZsGearView({ kind, poseRef }: { kind: 'skate' | 'glider'; poseRef: React.MutableRefObject<BoardPose> }) {
  const { scene } = useGLTF(kind === 'skate' ? SKATE_URL : GLIDER_URL);
  const group = useRef<THREE.Group>(null);
  const model = useMemo(() => prepare(scene, kind === 'skate' ? SKATE_LEN : GLIDER_SPAN, kind), [scene, kind]);
  useFrame(() => {
    const g = group.current, p = poseRef.current; if (!g) return;
    g.visible = p.visible;
    if (!p.visible) return;
    g.position.set(p.x, p.y, p.z);
    g.rotation.set(0, p.yaw, p.roll, 'YXZ');
  });
  return (
    <group ref={group} visible={false}>
      <primitive object={model} />
      {kind === 'skate' && <pointLight position={[0, -0.25, 0]} color="#3fb8ff" intensity={0.8} distance={2.5} decay={2} />}
    </group>
  );
}
useGLTF.preload(SKATE_URL);
useGLTF.preload(GLIDER_URL);
