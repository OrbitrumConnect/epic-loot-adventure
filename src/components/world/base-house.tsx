import { useLoader, useFrame, useThree } from '@react-three/fiber';
import { useTexture, useGLTF } from '@react-three/drei';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter } from '@/game/systems/playerBaseSystem';
import { terrainHeight } from './world-kit';
import { glbSurfaceY, useTerrainVersion } from './terrain-collision';
import { houseCollider, housePlayerFeetY, housePlayerInside } from './house-collider';
import { buildFloorMesh, collectTris, sliceLevels, type HouseLevels } from './house-levels';
import { AssetBoundary } from './asset-boundary';
import { lightAllowed, useLightId } from './light-budget';
import type { BasePiece } from '@/game/types/playerbase';

/**
 * Casa completa (WoodHouse.obj + textura) como PRÉDIO central da base — 1 modelo
 * coerente, em vez de montar muro por muro. Auto-escalada pra ~TARGET_H de altura,
 * centralizada e no chão, no core da base. Aditivo (cerca procedural fica em volta).
 *
 * A casa NÃO afunda (porta/janela em altura normal). Em vez disso publica seu
 * footprint + altura do piso em `houseCollider`: o loop do jogador usa isso pra
 * (1) te apoiar no assoalho de madeira e (2) tornar as paredes sólidas.
 */
const TARGET_H = 8.3; // +12% (casa maior → VÃO DA PORTA mais largo: o personagem não passava)
const VSTRETCH = 1.05; // +5% SÓ na altura (porta mais alta sem alargar)
// Altura do assoalho caminhável acima da base do modelo (o player pisa aqui dentro).
// ~0.9 em escala 6.75 colocou os pés no piso certinho; mantido como fração pra escalar.
const FLOOR_H = TARGET_H * 0.133 * VSTRETCH;
/** Distância² (m²) além da qual a luz interna da casa sai do shader. */
const HOUSE_LIGHT_D2 = 22 * 22;

function BaseHouseInner({
  pieces: remotePieces,
  remote = false,
  tier = 0,
  tierScene = null,
}: { pieces?: BasePiece[] | null; remote?: boolean; tier?: number; tierScene?: THREE.Object3D | null } = {}) {
  const localPieces = useGameStore((s) => s.playerBase?.pieces);
  const pieces = remotePieces === undefined ? localPieces : remotePieces;
  const obj = useLoader(OBJLoader, '/models/house/WoodHouse.obj');
  const diffuse = useTexture('/models/house/Diffuse.png');
  const normal = useTexture('/models/house/normal.png');
  // Casa de PEDRA (nível 10) e de METAL (nível >20): GLB próprio (2 andares + rampa, PBR). 26/10 (celular fraco):
  // chega PRONTO de quem escolhe o tier (`BaseHouseTier`) — só a versão em uso é baixada/vai pra memória de vídeo
  // (antes as duas carregavam sempre). A madeira segue o OBJ original com diffuse/normal.
  const localBaseEvolved = useGameStore((s) => s.baseEvolved ?? false);
  const localBaseMetal = useGameStore((s) => s.baseMetal ?? false);
  // A evolução visual da base remota ainda não faz parte do payload de rede.
  // Ela continua sendo uma casa de madeira, mas fica no mesmo core da cerca.
  // Remota: evolução vem da rede (`tier`: 0 madeira · 1 pedra · 2 metal — 23/10).
  const baseEvolved = remote ? tier >= 1 : localBaseEvolved;
  const metalTier = remote ? tier >= 2 : localBaseMetal; // pedra -> metal após pagar o upgrade (nível>20)

  const gl = useThree((s) => s.gl);
  useEffect(() => { gl.localClippingEnabled = true; }, [gl]); // habilita o corte do teto
  // Assenta a base no CHÃO REAL do GLB (não no procedural): reassenta quando o GLB carrega.
  const tv = useTerrainVersion();
  const baseGroundY = (x: number, z: number) => glbSurfaceY(x, z, terrainHeight(x, z));

  // Plano de corte horizontal (normal apontando pra baixo): mantém y <= constant.
  // constant alto = casa inteira; ao entrar, baixa pra remover o teto e ver dentro.
  const clipPlane = useMemo(() => new THREE.Plane(new THREE.Vector3(0, -1, 0), 1e6), []);

  const prepared = useMemo(() => {
    // Tier: metal (nível>20) → pedra (nível 10) → madeira (base). Pedra e metal são
    // GLBs próprios (2 andares + rampa) com PBR embutido; madeira é o OBJ.
    const glb = tierScene;
    const o = (glb ?? obj).clone(true);
    const owned: THREE.Material[] = [];
    if (glb) {
      // Preserva a textura PBR do GLB; só força dupla face + o plano de corte do teto.
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (!mesh.isMesh) return;
        const cloneMat = (src: THREE.Material) => {
          const clone = src.clone();
          clone.side = THREE.DoubleSide;
          clone.clippingPlanes = [clipPlane];
          owned.push(clone);
          return clone;
        };
        mesh.material = Array.isArray(mesh.material) ? mesh.material.map(cloneMat) : cloneMat(mesh.material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      });
    } else {
      diffuse.colorSpace = THREE.SRGBColorSpace;
      const mat = new THREE.MeshStandardMaterial({ map: diffuse, normalMap: normal, roughness: 0.92, metalness: 0, side: THREE.DoubleSide, clippingPlanes: [clipPlane] });
      owned.push(mat);
      o.traverse((m) => {
        const mesh = m as THREE.Mesh;
        if (mesh.isMesh) {
          mesh.material = mat;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
        }
      });
    }
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

    // Fatiamos abaixo do peitoril da janela, mas acima do piso. Assim a abertura
    // da porta continua sem segmento, enquanto uma janela alta não vira passagem
    // para o jogador (a colisão 2D não deve depender da altura da câmera).
    const collisionY = FLOOR_H + 0.38;
    const wallSegs: number[] = [];
    const va = new THREE.Vector3(), vb = new THREE.Vector3(), vc = new THREE.Vector3();
    const cut = (p: THREE.Vector3, q: THREE.Vector3, out: number[]) => {
      const dp = p.y - collisionY, dq = q.y - collisionY;
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
    // PEDRA/METAL (2 andares + escada): colisão por ALTURA (piso por raio + parede no joelho).
    // Madeira segue só com a fatia única acima (zero mudança). Remota não colide → não calcula.
    let levels: HouseLevels | undefined;
    let floorMesh: THREE.Mesh | null = null;
    if (glb && !remote) {
      const tris = collectTris(wrap);
      levels = sliceLevels(tris, TARGET_H * VSTRETCH);
      floorMesh = buildFloorMesh(tris);
    }
    return { wrap, halfX, halfZ, wallSegs, owned, levels, floorMesh };
  }, [obj, tierScene, baseEvolved, metalTier, diffuse, normal, clipPlane, remote]);

  // Descarta os materiais clonados ao trocar de tier/desmontar (evita leak de shader).
  useEffect(() => () => {
    for (const m of prepared.owned) m.dispose();
    prepared.floorMesh?.geometry.dispose();
  }, [prepared]);

  // Teto some ao entrar: baixa o plano de corte pra ~2,6 m acima do piso — na casa de 2 andares,
  // acima do piso em que o herói ESTÁ (no 2º andar some o telhado e aparece o andar de cima).
  useFrame(() => {
    const h = houseCollider.current;
    const floor = h?.levels ? Math.max(h.floorY, housePlayerFeetY.current) : h?.floorY ?? 0;
    clipPlane.constant = h && housePlayerInside.current ? floor + 2.6 : 1e6;
  });

  const core = pieces?.find((p) => p.kind === 'core');
  const ctr = core ? cellCenter(core.cell) : null;

  // Culling: a luz interna (forte) só fica no shader quando o jogador está perto
  // da casa; longe, sai de cena (point-light pesa mesmo apagada).
  const lightRef = useRef<THREE.PointLight>(null);
  const lightId = useLightId();
  useFrame(() => {
    const l = lightRef.current;
    if (!l || !ctr) return;
    const p = useGameStore.getState().player.position;
    const d2 = (p.x - ctr.x) * (p.x - ctr.x) + (p.z - ctr.z) * (p.z - ctr.z);
    l.visible = lightAllowed(lightId, d2 < HOUSE_LIGHT_D2, d2); // + orçamento de luzes no celular
  });

  // Publica footprint + piso pro loop de física (chão caminhável + paredes sólidas).
  useEffect(() => {
    if (remote || !ctr) {
      if (!remote) houseCollider.current = null;
      return;
    }
    const floorY = baseGroundY(ctr.x, ctr.z) + FLOOR_H;
    houseCollider.current = {
      cx: ctr.x,
      cz: ctr.z,
      halfX: prepared.halfX,
      halfZ: prepared.halfZ,
      floorY,
      wallSegs: prepared.wallSegs,
      ...(prepared.levels ? { baseY: baseGroundY(ctr.x, ctr.z), levels: prepared.levels, floorMesh: prepared.floorMesh } : {}),
    };
    return () => {
      houseCollider.current = null;
    };
  }, [ctr?.x, ctr?.z, prepared, remote, tv]);

  if (!ctr) return null;
  return (
    <group position={[ctr.x, baseGroundY(ctr.x, ctr.z), ctr.z]}>
      <primitive object={prepared.wrap} />
      {/* Luz interna quente (o telhado bloqueia o sol) */}
      {!remote && <pointLight ref={lightRef} position={[0, TARGET_H * 0.55, 0]} intensity={9} distance={TARGET_H * 2.6} decay={1.4} color="#ffe0b0" />}
    </group>
  );
}

const STONE_HOUSE_URL = '/models/house/stone-house.glb';
const METAL_HOUSE_URL = '/models/house/metal-house.glb';
type HouseProps = { pieces?: BasePiece[] | null; remote?: boolean; tier?: number };

/** Escolhe o tier e carrega SÓ o GLB dele (madeira = nenhum). */
function BaseHouseTier(props: HouseProps) {
  const localEvolved = useGameStore((s) => s.baseEvolved ?? false);
  const localMetal = useGameStore((s) => s.baseMetal ?? false);
  const evolved = props.remote ? (props.tier ?? 0) >= 1 : localEvolved;
  const metal = props.remote ? (props.tier ?? 0) >= 2 : localMetal;
  const url = metal ? METAL_HOUSE_URL : evolved ? STONE_HOUSE_URL : null;
  return url ? <BaseHouseGlb url={url} {...props} /> : <BaseHouseInner {...props} tierScene={null} />;
}
function BaseHouseGlb({ url, ...props }: HouseProps & { url: string }) {
  const { scene } = useGLTF(url);
  return <BaseHouseInner {...props} tierScene={scene} />;
}

/** Casa central da base, blindada: falha de fetch de qualquer asset (OBJ/GLB/textura)
 *  vira fallback `null` em vez de derrubar a cena/aplicação. */
export function BaseHouse(props: { pieces?: BasePiece[] | null; remote?: boolean; tier?: number } = {}) {
  return (
    <AssetBoundary label="BaseHouse" fallback={null}>
      <Suspense fallback={null}>
        <BaseHouseTier {...props} />
      </Suspense>
    </AssetBoundary>
  );
}

// Preload sob demanda: useGLTF carrega stone-house.glb na montagem (Suspense + AssetBoundary).
