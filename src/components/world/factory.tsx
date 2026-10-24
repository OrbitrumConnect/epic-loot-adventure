import { useGLTF } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { FACTORY_SHOWN, terrainHeight } from './world-kit';
import { glbSurfaceY, useTerrainVersion } from './terrain-collision';
import { factoryColliders, factoryClip } from './factory-collider';

/**
 * Complexo industrial desativado (prédio GLB, texturas embutidas) — ÁREA DE
 * ENERGIA. Como a casa: ANDÁVEL por dentro (paredes sólidas, entra pela abertura),
 * TETO SOME no modo câmera longe (iso) — ver factory-collider + game-world. Chão
 * do GLB escondido → aparece o dirt do mapa. 4 sites, pad plano (world-kit).
 */
const URL = '/models/factory/factory.glb';
const TARGET_H = 7.7; // -30% (porta proporcional ao boneco)
/** Afunda 10 cm: o chão RETO do prédio fica logo abaixo do nosso. */
const FACTORY_SINK = 0.1;
const CHEST_Y = 1.3; // altura (acima da base) onde fatiamos as paredes

export function Factory() {
  const { scene } = useGLTF(URL);
  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]); // corte do teto
  const tv = useTerrainVersion(); // re-assenta na superfície do GLB quando ele carrega

  const proto = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const mm of mats) { const mat = mm as THREE.Material; mat.clippingPlanes = [factoryClip]; mat.clipShadows = true; }
      }
    });
    const box = new THREE.Box3().setFromObject(o);
    const h = box.max.y - box.min.y || 1;
    o.scale.setScalar(TARGET_H / h);
    o.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(o);
    o.position.set(-(b2.min.x + b2.max.x) / 2, -b2.min.y, -(b2.min.z + b2.max.z) / 2);
    o.updateMatrixWorld(true);

    const full = new THREE.Box3().setFromObject(o);
    const modelH = full.max.y - full.min.y || 1;
    const spanXZ = Math.max(full.max.x - full.min.x, full.max.z - full.min.z) || 1;
    const halfX = (full.max.x - full.min.x) / 2;
    const halfZ = (full.max.z - full.min.z) / 2;

    // Esconde o CHÃO/lote de concreto do GLB → aparece o dirt do mapa.
    const bb = new THREE.Box3();
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      if (!mesh.geometry.boundingBox) return;
      bb.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld);
      const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
      if (sy < 0.22 * Math.max(sx, sz) && bb.min.y < full.min.y + modelH * 0.14 && Math.max(sx, sz) > 0.5 * spanXZ) {
        mesh.visible = false;
      }
    });

    // Paredes reais na altura do peito: fatia só as peças ALTAS (muros ≥ 2 m),
    // ignorando máquinas/props baixos → colisão limpa de perímetro. Segmentos em
    // XZ relativos ao centro (o prédio já está centrado).
    const wallSegs: number[] = [];
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const cut = (p: THREE.Vector3, q: THREE.Vector3, out: number[]) => {
      const dp = p.y - CHEST_Y, dq = q.y - CHEST_Y;
      if ((dp <= 0 && dq > 0) || (dp > 0 && dq <= 0)) {
        const t = dp / (dp - dq);
        out.push(p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t);
      }
    };
    o.traverse((m) => {
      const mesh = m as THREE.Mesh;
      if (!mesh.isMesh || mesh.visible === false || !mesh.geometry) return;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const gb = mesh.geometry.boundingBox;
      if (gb && (gb.max.y - gb.min.y) * mesh.matrixWorld.getMaxScaleOnAxis() < 2) return; // ignora props baixos
      const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const idx = mesh.geometry.getIndex();
      const n = idx ? idx.count : pos.count;
      const get = (i: number, v: THREE.Vector3) => v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(mesh.matrixWorld);
      for (let i = 0; i < n; i += 3) {
        get(i, va); get(i + 1, vb); get(i + 2, vc);
        const pts: number[] = [];
        cut(va, vb, pts); cut(vb, vc, pts); cut(vc, va, pts);
        if (pts.length === 4) {
          const [ax, az, bx2, bz] = pts as [number, number, number, number];
          const dx = bx2 - ax, dz = bz - az;
          if (dx * dx + dz * dz > 0.01) wallSegs.push(ax, az, bx2, bz);
        }
      }
    });

    const wrap = new THREE.Group();
    wrap.add(o);
    return { wrap, wallSegs, halfX, halfZ };
  }, [scene]);

  // Base Y = chão MAIS BAIXO sob o contorno (grade 5x5, já girada). Antes pegava só o centro e,
  // em terreno inclinado (até 1,5 m de desnível), o muro do lado baixo ficava no ar (Pedro).
  const baseYs = useMemo(() => FACTORY_SHOWN.map((f) => {
    const cos = Math.cos(f.rot), sin = Math.sin(f.rot);
    let min = Infinity;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) {
      const lx = proto.halfX * (i / 2 - 1), lz = proto.halfZ * (j / 2 - 1);
      const x = f.x + lx * cos - lz * sin, z = f.z + lx * sin + lz * cos;
      min = Math.min(min, glbSurfaceY(x, z, terrainHeight(x, z)));
    }
    return min - FACTORY_SINK;
  }), [proto, tv]);

  // Registra os colisores (paredes rotacionadas por site + footprint + base Y).
  useEffect(() => {
    factoryColliders.length = 0;
    FACTORY_SHOWN.forEach((f, idx) => {
      const cos = Math.cos(f.rot), sin = Math.sin(f.rot);
      const segs: number[] = [];
      for (let i = 0; i < proto.wallSegs.length; i += 2) {
        const sx = proto.wallSegs[i]!, sz = proto.wallSegs[i + 1]!;
        segs.push(sx * cos - sz * sin, sx * sin + sz * cos);
      }
      factoryColliders.push({
        cx: f.x, cz: f.z,
        halfX: Math.abs(proto.halfX * cos) + Math.abs(proto.halfZ * sin),
        halfZ: Math.abs(proto.halfX * sin) + Math.abs(proto.halfZ * cos),
        baseY: baseYs[idx]!,
        wallSegs: segs,
      });
    });
    return () => { factoryColliders.length = 0; };
  }, [proto, baseYs]);

  return (
    <>
      {FACTORY_SHOWN.map((f, i) => (
        <primitive
          key={i}
          object={proto.wrap.clone()}
          position={[f.x, baseYs[i]!, f.z]}
          rotation={[0, f.rot, 0]}
        />
      ))}
    </>
  );
}

// Preload sob demanda: useGLTF carrega URL na montagem (Suspense + AssetBoundary).
