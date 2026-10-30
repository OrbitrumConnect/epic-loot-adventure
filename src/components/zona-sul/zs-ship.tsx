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
/** Prancha de embarque: 2,2 m de largura, desce do bordo no MEIO do navio até onde a AREIA encontra a rampa (no máximo
 *  16 m, inclinação até ~32°) — do lado com o pouso mais curto. Nunca fica abaixo da areia. */
const PLANK_W = 2.2, PLANK_MAX = 16, PLANK_SLOPE = Math.tan((32 * Math.PI) / 180);
/** Degrau que dá pra subir andando (m) — do mesmo tamanho do "STEP_UP" do Vale. */
export const SHIP_STEP = 0.75;

export type ShipCollider = {
  cx: number; cz: number; cos: number; sin: number;
  /** grade no espaço do navio (u = comprimento, v = boca) */
  u0: number; v0: number; nu: number; nv: number; cell: number;
  /** altura do convés por célula (NaN = fora do casco) */
  deck: Float32Array;
  /** prancha em coordenadas do MUNDO: A = ponta no convés, B = ponta na areia */
  plank: { ax: number; az: number; ay: number; bx: number; bz: number; by: number; halfW: number } | null;
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
  if (pl) {
    // projeta no segmento B (areia) → A (convés)
    const ex = pl.ax - pl.bx, ez = pl.az - pl.bz, L2 = ex * ex + ez * ez;
    const k = L2 > 0 ? ((x - pl.bx) * ex + (z - pl.bz) * ez) / L2 : -1;
    if (k >= 0 && k <= 1) {
      const lat = Math.abs((x - pl.bx) * ez - (z - pl.bz) * ex) / Math.sqrt(L2);
      if (lat <= pl.halfW) {
        const y = pl.by + (pl.ay - pl.by) * k;
        if (feetY >= y - SHIP_STEP - 0.6) return { y }; // na prancha (ou subindo nela)
      }
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
    // COSTADO não é convés: o raio também pega a borda inclinada do casco perto da água (do lado adernado ~0,3 m) —
    // o herói subia nela vindo nadando. Piso bem ABAIXO da altura típica do convés (mediana) não é piso de andar…
    const ys = Array.from(deck).filter((y) => !Number.isNaN(y)).sort((a, b) => a - b);
    const median = ys.length ? ys[Math.floor(ys.length / 2)]! : 0;
    // …e vira PAREDE na altura do convés (o casco inteiro segura quem vem nadando; de cima é a borda do convés)
    for (let n = 0; n < deck.length; n++) if (deck[n]! < median - 0.8) deck[n] = median;
    // PRANCHA de embarque: do bordo, no MEIO do navio, pros dois lados; anda pra fora até a AREIA encontrar a rampa
    // (descendo no máximo ~32°) — fica o lado com o pouso mais curto. Sem pouso dos dois lados (só mar) = sem prancha.
    const iMid = Math.floor(nu / 2), uMid = -halfL + (iMid + 0.5) * CELL;
    const toW = (u: number, v: number) => ({ x: SHIP.x + u * cos + v * sin, z: SHIP.z - u * sin + v * cos });
    let plankOut: ShipCollider['plank'] = null, bestLen = Infinity;
    for (const sgn of [-1, 1]) {
      let jEdge = -1; // a última célula com convés no meio do navio, desse lado
      for (let j = 0; j < nv; j++) if (!Number.isNaN(deck[j * nu + iMid]!)) { if (jEdge < 0 || (sgn < 0 ? j < jEdge : j > jEdge)) jEdge = j; }
      if (jEdge < 0) continue;
      const yA = deck[jEdge * nu + iMid]!, vA = -halfW + (jEdge + (sgn < 0 ? 0 : 1)) * CELL;
      for (let d = 1; d <= PLANK_MAX; d += 0.5) {
        const pB = toW(uMid, vA + sgn * d), ground = zsHeightAt(t, pB.x, pB.z);
        if (ground < 0.15) continue; // ainda é água
        if (ground >= yA - d * PLANK_SLOPE - 0.05) { // a areia encontrou a rampa
          if (d < bestLen) { const pA = toW(uMid, vA); bestLen = d; plankOut = { ax: pA.x, az: pA.z, ay: yA, bx: pB.x, bz: pB.z, by: ground + 0.06, halfW: PLANK_W / 2 }; }
          break;
        }
      }
    }
    const col: ShipCollider = { cx: SHIP.x, cz: SHIP.z, cos, sin, u0: -halfL, v0: -halfW, nu, nv, cell: CELL, deck, plank: plankOut };
    return { root: holder, collider: col, plank: plankOut };
  }, [scene, t]);

  useEffect(() => { zsShip.c = collider; return () => { if (zsShip.c === collider) zsShip.c = null; }; }, [collider]);

  // prancha visível (tábua de madeira) — a MESMA reta do colisor (B na areia → A no convés)
  const plankMesh = useMemo(() => {
    if (!plank) return null;
    const a = new THREE.Vector3(plank.ax, plank.ay, plank.az), b = new THREE.Vector3(plank.bx, plank.by, plank.bz);
    const mid = a.clone().add(b).multiplyScalar(0.5), dir = a.clone().sub(b);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.clone().normalize());
    return { pos: [mid.x, mid.y - 0.08, mid.z] as [number, number, number], quat: q, len: dir.length() };
  }, [plank]);

  return (
    <>
      <primitive object={root} />
      {plankMesh && (
        <mesh position={plankMesh.pos} quaternion={plankMesh.quat} castShadow receiveShadow>
          <boxGeometry args={[PLANK_W, 0.16, plankMesh.len]} />
          <meshStandardMaterial color="#7a5432" roughness={0.9} />
        </mesh>
      )}
    </>
  );
}

/** Piso mínimo pra contar como convés: acima da água/areia (raio que só pegou o fundo não é convés). */
function ZS_DECK_MIN(t: ZsTerrain, x: number, z: number): number {
  return Math.max(0.3, zsHeightAt(t, x, z) + 0.3);
}

useGLTF.preload(SHIP_URL);
