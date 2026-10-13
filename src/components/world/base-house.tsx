import { useLoader, useFrame, useThree } from '@react-three/fiber';
import { useTexture } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';
import { houseCollider, housePlayerInside } from './house-collider';

/**
 * Casa completa (WoodHouse.obj + textura) como PRÉDIO central da base — 1 modelo
 * coerente, em vez de montar muro por muro. Auto-escalada pra ~TARGET_H de altura,
 * centralizada e no chão, no core da base. Aditivo (cerca procedural fica em volta).
 *
 * A casa NÃO afunda (porta/janela em altura normal). Em vez disso publica seu
 * footprint + altura do piso em `houseCollider`: o loop do jogador usa isso pra
 * (1) te apoiar no assoalho de madeira e (2) tornar as paredes sólidas.
 */
const TARGET_H = 7.43; // +10% (porta mais alta — não bate a cabeça na entrada)
const VSTRETCH = 1.05; // +5% SÓ na altura (porta mais alta sem alargar)
// Altura do assoalho caminhável acima da base do modelo (o player pisa aqui dentro).
// ~0.9 em escala 6.75 colocou os pés no piso certinho; mantido como fração pra escalar.
const FLOOR_H = TARGET_H * 0.133 * VSTRETCH;

export function BaseHouse() {
  const pieces = useGameStore((s) => s.playerBase?.pieces);
  const obj = useLoader(OBJLoader, '/models/house/WoodHouse.obj');
  const diffuse = useTexture('/models/house/Diffuse.png');
  const normal = useTexture('/models/house/normal.png');

  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]); // habilita o corte do teto

  // Plano de corte horizontal (normal apontando pra baixo): mantém y <= constant.
  // constant alto = casa inteira; ao entrar, baixa pra remover o teto e ver dentro.
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), []);

  const prepared = useMemo(() => {
    const o = obj.clone();
    diffuse.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [clipPlane] });
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.material = mat;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    const box = new THREE.Box3().setFromObject(o);
    const h = box.max.y - box.min.y || 1;
    o.scale.setScalar(TARGET_H / h);
    o.scale.y *= VSTRETCH; // +5% só na altura
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    const wrap = new THREE.Group();
    wrap.add(o);
    // Footprint final (já escalado e centrado em XZ) pra colisão.
    const fb = new THREE.Box3().setFromObject(wrap);
    const halfX = (fb.max.x - fb.min.x) / 2;
    const halfZ = (fb.max.z - fb.min.z) / 2;

    // Paredes reais na altura do PEITO: fatia a malha no plano y=chest e guarda
    // os segmentos (XZ, já centrado). Onde não há parede (porta) → sem segmento →
    // passa. Janela (alta) e móvel (baixo) não cruzam o peito → não bloqueiam.
    const chestY = FLOOR_H + 1.0;
    const wallSegs: number[] = [];
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const cut = (p: THREE.Vector3, q: THREE.Vector3, out: number[]) => {
      const dp = p.y - chestY, dq = q.y - chestY;
      if ((dp <= 0 && dq > 0) || (dp > 0 && dq <= 0)) {
        const t = dp / (dp - dq);
        out.push(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t);
      }
    };
    wrap.updateMatrixWorld(true);
    wrap.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const idx = mesh.geometry.getIndex();
      const n = idx ? idx.count : pos.count;
      const get = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        get(i, va); get(i + 1, vb); get(i + 2, vc);
        const pts: number[] = [];
        cut(va, vb, pts); cut(vb, vc, pts); cut(vc, va, pts);
        if (pts.length === 4) {
          const [ax, az, bx, bz] = pts as [number, number, number, number];
          const dx = bx - ax, dz = bz - az;
          if (dx * dx + dz * dz > 0.0025) wallSegs.push(ax, az, bx, bz); // ignora < 5 cm
        }
      }
    });
    return { wrap, halfX, halfZ, wallSegs };
  }, [obj, diffuse, normal, clipPlane]);

  // Teto some ao entrar: baixa o plano de corte pra ~2,6 m acima do piso.
  useFrame(() => {
    const h = houseCollider.current;
    clipPlane.constant = h && housePlayerInside.current ? h.floorY + 2.6 : 1e6;
  });

  const core = pieces?.find((p) => p.kind === 'core');
  const ctr = core ? cellCenter(core.cell) : null;

  // Publica footprint + piso pro loop de física (chão caminhável + paredes sólidas).
  useEffect(() => {
    if (!ctr) {
      houseCollider.current = null;
      return;
    }
    const floorY = terrainHeight(ctr.x, ctr.z) + FLOOR_H;
    houseCollider.current = {
      cx: ctr.x,
      cz: ctr.z,
      halfX: prepared.halfX,
      halfZ: prepared.halfZ,
      floorY,
      wallSegs: prepared.wallSegs,
    };
    return () => {
      houseCollider.current = null;
    };
  }, [ctr?.x, ctr?.z, prepared.halfX, prepared.halfZ, prepared.wallSegs]);

  if (!ctr) return null;
  return (
    <group position={[ctr.x, terrainHeight(ctr.x, ctr.z), ctr.z]}>
      <primitive object={prepared.wrap} />
      {/* Luz interna quente (o telhado bloqueia o sol) */}
      <pointLight position={[0, TARGET_H * 0.55, 0]} intensity={9} distance={TARGET_H * 2.6} decay={1.4} color="#ffe0b0" />
    </group>
  );
}
