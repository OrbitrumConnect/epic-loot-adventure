/**
 * ZONA SUL — O NAVIO (29/10, Pedro: "o navio fica entre Ipanema e Leblon, pode ser meio na água… é acessível, colisão").
 * Galeão encalhado em frente ao canal do Jardim de Alah (a divisa real das duas praias), meio dentro d'água, levemente
 * adernado. GLB do Pedro compactado (67 → 2,4 MB). DÁ PRA SUBIR: uma prancha de embarque sai da areia até o convés.
 *
 * COLISÃO: ao carregar, o modelo é "escaneado" UMA vez com raios de cima pra baixo (grade de ~1,5 m) — em cada ponto vale
 * o 1º piso abaixo das velas/mastros = o CONVÉS. Isso vira um mapa de altura do navio:
 *  - dentro do casco com os pés na altura do convés → anda no convés;
 *  - vindo de baixo (água/areia) → o casco é PAREDE (não atravessa o navio);
 *  - a prancha é uma rampa (altura sobe da areia até o convés).
 * Custo por quadro: uma conta de grade (sem raio). Puro em `shipGround` (testável).
 */
import { useGLTF } from '@react-three/drei';
import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { type ZsTerrain, zsHeightAt } from './zs-terrain-data';

/** Onde/como fica: em frente ao canal do Jardim de Alah, proa pro mar, ~32° com a praia, quilha 2,2 m abaixo d'água. */
export const SHIP = { x: -452, z: 458, yaw: -0.56, length: 38, keelY: -2.2, roll: 0.06 } as const;
/** Convés = 1º piso abaixo desta fração da altura total (acima disso: velas, mastros, cordame). */
const DECK_MAX_FRAC = 0.5;
const CELL = 1.5;
/** Prancha de embarque: sai do bordo de TERRA (lado da praia), no meio do navio, 2,2 m de largura. */
const PLANK_W = 2.2, PLANK_LEN = 11;
/** Degrau que dá pra subir andando (m) — do mesmo tamanho do "STEP_UP" do Vale. */
export const SHIP_STEP = 0.75;

export type ShipCollider = {
  cx: number; cz: number; cos: number; sin: number;
  /** grade no espaço do navio (u = comprimento, v = boca) */
  u0: number; v0: number; nu: number; nv: number; cell: number;
  /** altura do convés por célula (NaN = fora do casco) */
  deck: Float32Array;
  /** prancha: começa no bordo (vDeck) e desce até a areia (vSand), em u ∈ [−w/2, w/2] */
  plank: { vDeck: number; vSand: number; yDeck: number; ySand: number; halfW: number } | null;
};

/** Colisor ATIVO (null = navio ainda não carregou / fora da Zona Sul). */
export const zsShip: { c: ShipCollider | null } = { c: null };

/** Para o herói: altura do piso do navio em (x, z) dado os pés em `feetY`.
 *  `null` = fora do navio (chão normal). `{ wall: true }` = casco na frente (não entra). */
export function shipGround(c: ShipCollider | null, x: number, z: number, feetY: number): { y: number } | { wall: true } | null {
  if (!c) return null;
  const dx = x - c.cx, dz = z - c.cz;
  const u = dx * c.cos - dz * c.sin, v = dx * c.sin + dz * c.cos; // espaço do navio (mesmo giro do three.js em Y)
  const pl = c.plank;
  if (pl && Math.abs(u) <= pl.halfW) {
    const lo = Math.min(pl.vDeck, pl.vSand), hi = Math.max(pl.vDeck, pl.vSand);
    if (v >= lo && v <= hi) {
      const k = (v - pl.vSand) / (pl.vDeck - pl.vSand); // 0 na areia → 1 no bordo
      const y = pl.ySand + (pl.yDeck - pl.ySand) * k;
      if (feetY >= y - SHIP_STEP - 0.6) return { y }; // na prancha (ou subindo nela)
    }
  }
  const i = Math.floor((u - c.u0) / c.cell), j = Math.floor((v - c.v0) / c.cell);
  if (i < 0 || j < 0 || i >= c.nu || j >= c.nv) return null;
  const d = c.deck[j * c.nu + i]!;
  if (Number.isNaN(d)) return null;
  return feetY >= d - SHIP_STEP ? { y: d } : { wall: true };
}

const SHIP_URL = '/zona-sul/ship.glb';

export function ZsShip({ t }: { t: ZsTerrain }) {
  const { scene } = useGLTF(SHIP_URL);
  const { root, collider, plank } = useMemo(() => {
    const r = scene.clone(true);
    r.traverse((o) => { const m = o as THREE.Mesh; if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    // escala pelo COMPRIMENTO e pé (quilha) na altura combinada
    r.updateMatrixWorld(true);
    const b0 = new THREE.Box3().setFromObject(r), s0 = b0.getSize(new THREE.Vector3());
    const k = SHIP.length / Math.max(s0.x, s0.z);
    const lenOnX = s0.x >= s0.z;
    const holder = new THREE.Group();
    holder.add(r);
    r.scale.setScalar(k);
    if (!lenOnX) r.rotation.y = Math.PI / 2; // comprimento sempre no eixo local x (u)
    r.updateMatrixWorld(true);
    const b1 = new THREE.Box3().setFromObject(r), c1 = b1.getCenter(new THREE.Vector3());
    r.position.set(-c1.x, -b1.min.y, -c1.z);
    holder.position.set(SHIP.x, SHIP.keelY, SHIP.z);
    holder.rotation.set(SHIP.roll, SHIP.yaw, 0, 'YXZ'); // aderna em torno do COMPRIMENTO (eixo local x)
    holder.updateMatrixWorld(true);

    // ESCANEIA o convés: raio de cima pra baixo em cada célula; vale o 1º piso abaixo de DECK_MAX_FRAC da altura
    const H = b1.max.y - b1.min.y, deckMax = SHIP.keelY + H * DECK_MAX_FRAC;
    const halfL = SHIP.length / 2 + 1, halfW = (Math.min(s0.x, s0.z) * k) / 2 + 1;
    const nu = Math.ceil((halfL * 2) / CELL), nv = Math.ceil((halfW * 2) / CELL);
    const deck = new Float32Array(nu * nv).fill(NaN);
    const cos = Math.cos(SHIP.yaw), sin = Math.sin(SHIP.yaw);
    const ray = new THREE.Raycaster(), o = new THREE.Vector3(), down = new THREE.Vector3(0, -1, 0);
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const u = -halfL + (i + 0.5) * CELL, v = -halfW + (j + 0.5) * CELL;
        // espaço do navio → mundo (giro em Y; o adernar é pequeno e entra na altura medida)
        const wx = SHIP.x + u * cos + v * sin, wz = SHIP.z - u * sin + v * cos;
        o.set(wx, deckMax, wz); ray.set(o, down); ray.far = deckMax - SHIP.keelY + 0.5;
        const hit = ray.intersectObject(holder, true)[0];
        if (hit && hit.point.y > ZS_DECK_MIN(t, wx, wz)) deck[j * nu + i] = hit.point.y;
      }
    }
    // PRANCHA de embarque: do bordo do lado da PRAIA (o que tem areia mais perto) até a areia
    const sideSand = (sgn: number) => zsHeightAt(t, SHIP.x + sgn * (halfW + PLANK_LEN) * sin, SHIP.z + sgn * (halfW + PLANK_LEN) * cos);
    const sgn = sideSand(-1) > sideSand(1) ? -1 : 1;
    const jEdge = (() => { // última célula com convés no meio do navio, do lado da praia
      const i = Math.floor(nu / 2);
      let best = -1;
      for (let j = 0; j < nv; j++) if (!Number.isNaN(deck[j * nu + i]!)) { if (best < 0 || (sgn < 0 ? j < best : j > best)) best = j; }
      return best;
    })();
    let plankOut: ShipCollider['plank'] = null;
    if (jEdge >= 0) {
      const vDeck = -halfW + (jEdge + (sgn < 0 ? 0 : 1)) * CELL;
      const yDeck = deck[jEdge * nu + Math.floor(nu / 2)]!;
      const vSand = vDeck + sgn * PLANK_LEN;
      const ySand = Math.max(0.2, zsHeightAt(t, SHIP.x + vSand * sin, SHIP.z + vSand * cos));
      plankOut = { vDeck, vSand, yDeck, ySand, halfW: PLANK_W / 2 };
    }
    const col: ShipCollider = { cx: SHIP.x, cz: SHIP.z, cos, sin, u0: -halfL, v0: -halfW, nu, nv, cell: CELL, deck, plank: plankOut };
    return { root: holder, collider: col, plank: plankOut };
  }, [scene, t]);

  useEffect(() => { zsShip.c = collider; return () => { if (zsShip.c === collider) zsShip.c = null; }; }, [collider]);

  // prancha visível (tábua de madeira) — mesma rampa do colisor
  const plankMesh = useMemo(() => {
    if (!plank) return null;
    const dv = plank.vDeck - plank.vSand, dy = plank.yDeck - plank.ySand, len = Math.hypot(dv, dy);
    const vm = (plank.vDeck + plank.vSand) / 2, ym = (plank.yDeck + plank.ySand) / 2;
    const sin = Math.sin(SHIP.yaw), cos = Math.cos(SHIP.yaw);
    // tábua no eixo local z apontando pro BORDO (se o bordo está do lado −v, gira meia volta)
    return { pos: [SHIP.x + vm * sin, ym - 0.08, SHIP.z + vm * cos] as [number, number, number], len, tilt: Math.atan2(dy, Math.abs(dv)), flip: dv < 0 };
  }, [plank]);

  return (
    <>
      <primitive object={root} />
      {plankMesh && (
        <group position={plankMesh.pos} rotation={[0, SHIP.yaw + (plankMesh.flip ? Math.PI : 0), 0]}>
          <mesh rotation={[-plankMesh.tilt, 0, 0]} castShadow receiveShadow>
            <boxGeometry args={[PLANK_W, 0.16, plankMesh.len]} />
            <meshStandardMaterial color="#7a5432" roughness={0.9} />
          </mesh>
        </group>
      )}
    </>
  );
}

/** Piso mínimo pra contar como convés: acima da água/areia (raio que só pegou o fundo não é convés). */
function ZS_DECK_MIN(t: ZsTerrain, x: number, z: number): number {
  return Math.max(0.3, zsHeightAt(t, x, z) + 0.3);
}

useGLTF.preload(SHIP_URL);
