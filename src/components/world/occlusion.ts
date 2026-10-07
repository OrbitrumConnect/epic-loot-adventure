/**
 * Objetos que somem quando escondem o jogador.
 *
 * Sem raycast: uma vez por quadro, `updateOcclusion` monta o segmento
 * jogador -> câmera e testa esferas envolventes (matemática de ponto contra
 * segmento) de cada objeto registrado. Quem estiver no caminho (esfera mais o
 * raio do corpo do jogador) ganha alvo de opacidade baixo; o resto, 1. A
 * opacidade anda por suavização exponencial, então não "pisca".
 *
 * Dois tipos de registro:
 *  - GRUPO (`useFadeGroup`): árvores decorativas, pedras soltas, ruínas, baú,
 *    torre, estruturas de acampamento. Os materiais do grupo são coletados uma
 *    vez; só os que estão mudando recebem escrita por quadro. Materiais
 *    compartilhados entre grupos (kit do acampamento) são clonados no registro
 *    para um grupo não apagar o vizinho.
 *  - INSTANCIADO (`registerInstancedFade`): lotes de centenas de itens
 *    (pedras, nós de colheita). Cada instância tem opacidade própria num
 *    atributo `aFade` lido pelo shader (`makeInstanceFadeMaterial`), então o
 *    lote continua sendo uma chamada de desenho.
 *
 * Inimigos e jogador nunca se registram aqui.
 *
 * `transparent` só fica ligado enquanto algo está de fato apagado (grupos) —
 * os lotes instanciados ficam `transparent` sempre, porque o alfa por
 * instância precisa disso; o custo é uma passada de mistura para um punhado
 * de malhas, sem afetar a ordem do resto da cena (o jogador já foi desenhado
 * na passada opaca e a pedra translúcida é misturada por cima dele).
 */
import { useEffect, type RefObject } from 'react';
import * as THREE from 'three';

/** Esfera em espaço local: [cx, cy, cz, raio]. */
export type FadeSphere = readonly [number, number, number, number];

/** Opacidade mínima de quem está na frente do jogador. */
const MIN_OPACITY = 0.18;
/** Folga somada ao raio de cada esfera (corpo do jogador). */
const PLAYER_PAD = 0.55;
/** Velocidade da suavização (1/s). */
const RATE = 9;
/** Além disso (em XZ do jogador) nem testa. */
const FAR = 45;

/* ------------------------------------------------------------------ *
 * Registro de grupos
 * ------------------------------------------------------------------ */
type GroupEntry = {
  /** Esferas em espaço de mundo: x,y,z,r repetidos. */
  world: Float32Array;
  mats: THREE.Material[];
  cur: number;
  tgt: number;
  fading: boolean;
};

const groups = new Set<GroupEntry>();

function setMatFade(m: THREE.Material, on: boolean) {
  if (m.transparent !== on) {
    m.transparent = on;
    m.depthWrite = !on;
    m.needsUpdate = true;
  }
}

/**
 * Registra um grupo/objeto. `spheres` em espaço local do objeto. Devolve a
 * função de remoção. `cloneMaterials` isola materiais compartilhados.
 */
export function registerFadeGroup(
  obj: THREE.Object3D,
  spheres: readonly FadeSphere[],
  cloneMaterials = false,
): () => void {
  obj.updateWorldMatrix(true, true);
  const m = obj.matrixWorld;
  const sc = m.getMaxScaleOnAxis();
  const world = new Float32Array(spheres.length * 4);
  const v = new THREE.Vector3();
  spheres.forEach((s, i) => {
    v.set(s[0], s[1], s[2]).applyMatrix4(m);
    world.set([v.x, v.y, v.z, s[3] * sc], i * 4);
  });

  const mats: THREE.Material[] = [];
  const clones = new Map<THREE.Material, THREE.Material>();
  obj.traverse(o => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const out = list.map(mat => {
      // Já translúcido (chama, água): fica de fora.
      if (mat.transparent) return mat;
      let use = mat;
      if (cloneMaterials) {
        let cl = clones.get(mat);
        if (!cl) { cl = mat.clone(); clones.set(mat, cl); }
        use = cl;
      }
      if (!mats.includes(use)) mats.push(use);
      return use;
    });
    if (cloneMaterials) mesh.material = Array.isArray(mesh.material) ? out : out[0]!;
  });

  const entry: GroupEntry = { world, mats, cur: 1, tgt: 1, fading: false };
  groups.add(entry);
  return () => { groups.delete(entry); };
}

/** Hook: registra o objeto do ref enquanto o componente estiver montado. */
export function useFadeGroup(
  ref: RefObject<THREE.Object3D | null>,
  spheres: readonly FadeSphere[] | null,
  cloneMaterials = false,
) {
  // `spheres` costuma ser literal novo a cada render: o registro é por montagem.
  useEffect(() => {
    if (!ref.current || !spheres || spheres.length === 0) return;
    return registerFadeGroup(ref.current, spheres, cloneMaterials);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/* ------------------------------------------------------------------ *
 * Registro de lotes instanciados
 * ------------------------------------------------------------------ */
type InstEntry = {
  mesh: THREE.InstancedMesh;
  spheres: readonly FadeSphere[];
  attr: THREE.InstancedBufferAttribute;
  cur: Float32Array;
  tgt: Float32Array;
  dirty: boolean;
};

const batches = new Set<InstEntry>();

/**
 * Patch do material: lê `aFade` (por instância) e multiplica o alfa. O
 * material passa a ser `transparent` para o alfa valer.
 */
export function makeInstanceFadeMaterial<T extends THREE.Material>(mat: T): T {
  mat.transparent = true;
  mat.onBeforeCompile = shader => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aFade;\nvarying float vFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFade = aFade;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFade;')
      .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vFade;');
  };
  mat.customProgramCacheKey = () => 'instance-fade-v1';
  return mat;
}

/**
 * Liga o fade por instância num `InstancedMesh` cujo material passou por
 * `makeInstanceFadeMaterial`. Chame de novo (devolve outro handle) quando o
 * mesh for recriado; a posição das instâncias é lida de `instanceMatrix` a cada
 * quadro, então reescrever as matrizes não exige novo registro.
 */
export function registerInstancedFade(
  mesh: THREE.InstancedMesh,
  spheres: readonly FadeSphere[],
): () => void {
  const cap = mesh.instanceMatrix.count;
  const attr = new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  mesh.geometry.setAttribute('aFade', attr);
  const entry: InstEntry = {
    mesh, spheres, attr,
    cur: new Float32Array(cap).fill(1),
    tgt: new Float32Array(cap).fill(1),
    dirty: false,
  };
  batches.add(entry);
  return () => { batches.delete(entry); };
}

/* ------------------------------------------------------------------ *
 * Laço por quadro
 * ------------------------------------------------------------------ */
const P = new THREE.Vector3();
const C = new THREE.Vector3();
const CP = new THREE.Vector3();
const tmp = new THREE.Vector3();
const inst = new THREE.Matrix4();

export const occlusionStats = { ms: 0, tested: 0, fading: 0 };

/** 1 se a esfera (cx,cy,cz,r) esconde o jogador; 0 caso contrário. */
function occludes(cx: number, cy: number, cz: number, r: number, lenSq: number, len: number): boolean {
  const sx = cx - P.x;
  const sy = cy - P.y;
  const sz = cz - P.z;
  const along = (sx * CP.x + sy * CP.y + sz * CP.z) / len; // metros ao longo de P->C
  // Bem atrás do jogador (do ponto de vista da câmera): não esconde nada.
  if (along < -0.4) return false;
  const t = Math.min(1, Math.max(0, along / len));
  const qx = P.x + CP.x * t;
  const qy = P.y + CP.y * t;
  const qz = P.z + CP.z * t;
  const dx = cx - qx;
  const dy = cy - qy;
  const dz = cz - qz;
  const rr = r + PLAYER_PAD;
  void lenSq;
  return dx * dx + dy * dy + dz * dz < rr * rr;
}

export function updateOcclusion(camera: THREE.Camera, player: THREE.Object3D, dt: number) {
  const t0 = performance.now();
  P.set(player.position.x, player.position.y + 0.95, player.position.z);
  camera.getWorldPosition(C);
  CP.copy(C).sub(P);
  const lenSq = CP.lengthSq();
  if (lenSq < 1e-4) return;
  const len = Math.sqrt(lenSq);
  const k = 1 - Math.exp(-RATE * Math.min(dt, 0.1));
  const px = P.x;
  const pz = P.z;
  let tested = 0;
  let fading = 0;

  // --- grupos ---
  for (const g of groups) {
    let hit = false;
    const w = g.world;
    for (let i = 0; i < w.length; i += 4) {
      const dx = w[i]! - px;
      const dz = w[i + 2]! - pz;
      // Rejeição barata: longe demais em XZ (câmera isométrica chega a ~35 m).
      if (dx * dx + dz * dz > FAR * FAR) continue;
      tested++;
      if (occludes(w[i]!, w[i + 1]!, w[i + 2]!, w[i + 3]!, lenSq, len)) { hit = true; break; }
    }
    g.tgt = hit ? MIN_OPACITY : 1;
    if (g.cur === g.tgt) continue;
    g.cur += (g.tgt - g.cur) * k;
    if (Math.abs(g.tgt - g.cur) < 0.01) g.cur = g.tgt;
    fading++;
    if (g.cur >= 1) {
      for (const m of g.mats) { m.opacity = 1; setMatFade(m, false); }
      g.fading = false;
    } else {
      for (const m of g.mats) { setMatFade(m, true); m.opacity = g.cur; }
      g.fading = true;
    }
  }

  // --- lotes instanciados ---
  for (const b of batches) {
    const n = Math.min(b.mesh.count, b.cur.length);
    const arr = b.attr.array as Float32Array;
    const el = b.mesh.instanceMatrix.array as Float32Array;
    let changed = false;
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      const ix = el[o + 12]!;
      const iz = el[o + 14]!;
      const dx = ix - px;
      const dz = iz - pz;
      let hit = false;
      if (dx * dx + dz * dz <= FAR * FAR) {
        inst.fromArray(el, o);
        const sc = inst.getMaxScaleOnAxis();
        for (let s = 0; s < b.spheres.length; s++) {
          const sp = b.spheres[s]!;
          tmp.set(sp[0], sp[1], sp[2]).applyMatrix4(inst);
          tested++;
          if (occludes(tmp.x, tmp.y, tmp.z, sp[3] * sc, lenSq, len)) { hit = true; break; }
        }
      }
      const tgt = hit ? MIN_OPACITY : 1;
      b.tgt[i] = tgt;
      const cur = b.cur[i]!;
      if (cur === tgt) continue;
      let next = cur + (tgt - cur) * k;
      if (Math.abs(tgt - next) < 0.01) next = tgt;
      b.cur[i] = next;
      arr[i] = next;
      changed = true;
      fading++;
    }
    if (changed) b.attr.needsUpdate = true;
  }

  occlusionStats.ms = performance.now() - t0;
  occlusionStats.tested = tested;
  occlusionStats.fading = fading;
}
