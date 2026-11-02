/**
 * Nós de recurso colhíveis (árvore, pedregulho, rocha, veios, cristal).
 *
 * Desempenho: são centenas de nós, então cada espécie de nó vira DOIS
 * `instancedMesh` (vivo e esgotado) com geometria "assada" (partes fundidas
 * com cor por vértice) e material compartilhados. Nenhum nó tem `useFrame`:
 * só o rótulo flutuante (um único, reaproveitado) roda por quadro. As
 * instâncias só são reescritas quando a identidade do array `harvestNodes`
 * muda na store.
 *
 * Clique: `e.instanceId` é o índice dentro do `instancedMesh` VIVO daquela
 * espécie. Ao reescrever as instâncias guardamos `ids[i] = node.id` na MESMA
 * ordem em que `setMatrixAt(i, ...)` é chamado — é essa tabela que traduz o
 * índice de volta para o id do nó. Nó esgotado vai para o mesh "esgotado" (sem
 * raycast) e sai do vivo, então para de responder a cliques sozinho.
 *
 * (1/11) Cada espécie com sombra ganhou um `useFrame` leve: escolhe quais
 * instâncias tocam a caixa da sombra do sol e copia só essas pra uma cópia
 * SÓ-SOMBRA do lote (ver "SOMBRA só de quem cai na caixa da sombra do sol").
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HARVEST_NODES } from '@/game/data/harvest-nodes';
import { ITEMS } from '@/game/data/items';
import { useGameStore } from '@/game/state/game-store';
import type { HarvestNodeKind, HarvestNodeState } from '@/game/types';
import { addObjective } from './objective-bridge';
import { harvestTreeGeometry } from './harvest-tree-geometry';
import { fadeLoop, makeInstanceFadeMaterial, registerInstancedFade, type FadeSphere } from './occlusion';
import {
  labelTexture, markPointerConsumed, mixColor, rand, terrainHeight, TREE_HEIGHT_K, type Palette,
} from './world-kit';
import { GlbCrystals } from './glb-crystals';
import { GlbRocks } from './glb-rocks';
import { glbSurfaceY, useTerrainVersion } from './terrain-collision';

const KINDS: HarvestNodeKind[] = ['tree', 'pebble', 'rock', 'iron_vein', 'gold_vein', 'crystal'];
/** Cristal da Essência = GLB (esconde o procedural, mantém clique). */
const USE_GLB_CRYSTAL = true;

/* ------------------------------------------------------------------ *
 * Busca de nó com cache por identidade do array (igual a `creatureById`)
 * ------------------------------------------------------------------ */
let cachedArray: HarvestNodeState[] | null = null;
let cachedMap = new Map<string, HarvestNodeState>();

/** Altura do pé do nó: a guardada (caverna, 02/11) ou o chão do mapa, como sempre. */
export function harvestNodeY(n: HarvestNodeState): number {
  return n.y ?? glbSurfaceY(n.position.x, n.position.z, terrainHeight(n.position.x, n.position.z));
}

export function harvestNodeById(id: string): HarvestNodeState | undefined {
  const arr = useGameStore.getState().harvestNodes;
  if (arr !== cachedArray) {
    cachedArray = arr;
    cachedMap = new Map(arr.map(n => [n.id, n]));
  }
  return cachedMap.get(id);
}

/* ------------------------------------------------------------------ *
 * Geometria assada: várias formas -> 1 BufferGeometry com cor por vértice
 * ------------------------------------------------------------------ */
export type Part = {
  g: THREE.BufferGeometry;
  color: string;
  pos?: [number, number, number];
  rot?: [number, number, number];
  scale?: [number, number, number];
};

const tmpPos = new THREE.Vector3();
const tmpScale = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();
const tmpMat = new THREE.Matrix4();

export function bake(parts: Part[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  for (const p of parts) {
    const g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    tmpPos.set(...(p.pos ?? [0, 0, 0]));
    tmpScale.set(...(p.scale ?? [1, 1, 1]));
    tmpQuat.setFromEuler(tmpEuler.set(...(p.rot ?? [0, 0, 0])));
    g.applyMatrix4(tmpMat.compose(tmpPos, tmpQuat, tmpScale));
    const pa = g.getAttribute('position');
    const na = g.getAttribute('normal');
    const color = new THREE.Color(p.color);
    for (let i = 0; i < pa.count; i++) {
      pos.push(pa.getX(i), pa.getY(i), pa.getZ(i));
      nor.push(na.getX(i), na.getY(i), na.getZ(i));
      col.push(color.r, color.g, color.b);
    }
    g.dispose();
    p.g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

const dodeca = (r: number, detail = 0) => new THREE.DodecahedronGeometry(r, detail);
const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cone = (r: number, h: number, seg: number) => new THREE.ConeGeometry(r, h, seg);
const cyl = (rt: number, rb: number, h: number, seg: number) => new THREE.CylinderGeometry(rt, rb, h, seg);

type KindAssets = {
  live: THREE.BufferGeometry;
  /** versão de LONGE (só a árvore): desenhada além de `harvestLod.d` m da câmera quando o lote é recortado (Zona Sul) */
  far?: THREE.BufferGeometry;
  dead: THREE.BufferGeometry;
  liveMat: THREE.Material;
  /** Altura do rótulo flutuante. */
  labelY: number;
  castShadow: boolean;
  /** Esferas (espaço local da instância) que podem esconder o jogador. */
  fade: FadeSphere[];
};

/** `cave` (02/11): o veio de ferro da CAVERNA — na luz fraca e quente de lá as manchas de metal (cinza-escuro) sumiam e
 *  o veio lia como pedra marrom. Lá as manchas são prata, um pouco maiores, e o veio cintila fraco (como o de ouro). A
 *  superfície (Vale) fica igual. */
function buildAssets(c: Palette, cave = false): { assets: Record<HarvestNodeKind, KindAssets>; deadMat: THREE.Material } {
  const rockDark = mixColor(c.rock, c.dark, 0.35);
  const rubble = mixColor(c.rock, c.ground, 0.45);
  const ironBody = mixColor(c.rock, c.dark, 0.55);

  const mat = (emissive?: string, intensity = 0) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: intensity } : {}),
    });

  // Só o material VIVO apaga por instância (o esgotado fica baixo, no chão).
  const fadeMat = <T extends THREE.Material>(m: T): T => makeInstanceFadeMaterial(m);

  // Rubble compartilhado de rochas esgotadas (3 pedrinhas baixas e escuras).
  const rubbleParts = (): Part[] => [
    { g: dodeca(0.3), color: rubble, pos: [0.0, 0.1, 0.0], scale: [1.2, 0.5, 1] },
    { g: dodeca(0.2), color: rockDark, pos: [0.4, 0.07, 0.15], scale: [1, 0.5, 1] },
    { g: dodeca(0.16), color: rubble, pos: [-0.3, 0.06, -0.25], scale: [1, 0.5, 1] },
  ];

  const tree: KindAssets = {
    live: harvestTreeGeometry(c),
    far: harvestTreeGeometry(c, true),
    dead: bake([
      { g: cyl(0.3, 0.4, 0.5, 7), color: c.trunk, pos: [0, 0.25, 0] },
      { g: cyl(0.26, 0.26, 0.05, 7), color: c['ground-light'], pos: [0, 0.52, 0] },
      { g: box(0.3, 0.08, 0.14), color: c.trunk, pos: [0.55, 0.05, 0.1], rot: [0, 0.6, 0] },
      { g: box(0.22, 0.07, 0.1), color: c.trunk, pos: [-0.5, 0.04, -0.2], rot: [0, -0.4, 0] },
    ]),
    liveMat: fadeMat(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 })),
    labelY: 4.9,
    castShadow: true,
    fade: [[0, 3.7, 0, 1.5], [0, 1.4, 0, 0.5]],
  };

  const pebble: KindAssets = {
    live: bake([
      { g: dodeca(0.2), color: c.rock, pos: [0, 0.1, 0], scale: [1, 0.7, 0.9] },
      { g: dodeca(0.14), color: c['rock-light'], pos: [0.28, 0.07, 0.1], scale: [1, 0.7, 1] },
      { g: dodeca(0.12), color: c.rock, pos: [-0.2, 0.06, 0.22] },
      { g: dodeca(0.1), color: c['rock-light'], pos: [0.05, 0.05, -0.28] },
    ]),
    dead: bake([{ g: new THREE.CircleGeometry(0.28, 7), color: c['ground-light'], pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }]),
    liveMat: fadeMat(mat()),
    labelY: 0.9,
    castShadow: false,
    fade: [[0, 0.1, 0, 0.4]],
  };

  const rock: KindAssets = {
    live: bake([
      { g: dodeca(0.95), color: c.rock, pos: [0, 0.6, 0], scale: [1.1, 0.8, 0.95], rot: [0.1, 0.4, 0.05] },
      { g: dodeca(0.55), color: c['rock-light'], pos: [0.7, 0.3, 0.35] },
      { g: dodeca(0.4), color: rockDark, pos: [-0.65, 0.25, -0.3] },
    ]),
    dead: bake(rubbleParts()),
    liveMat: fadeMat(mat()),
    labelY: 2.1,
    castShadow: true,
    fade: [[0, 0.6, 0, 1.1]],
  };

  // Manchas metálicas escuras e azuladas (superfície) · prata e maiores (caverna).
  const fleck = cave ? ['#a9b5c2', '#d3dbe3', '#8c98a6', '#e4eaef'] : ['#2c3138', '#59626e', '#3a424c', '#7a8591'];
  const fk = cave ? 1.35 : 1;
  const iron: KindAssets = {
    live: bake([
      { g: dodeca(0.9), color: ironBody, pos: [0, 0.55, 0], scale: [1.1, 0.8, 0.95], rot: [0.1, 0.9, 0.05] },
      { g: dodeca(0.45), color: rockDark, pos: [-0.65, 0.25, 0.25] },
      { g: box(0.22 * fk, 0.34 * fk, 0.22 * fk), color: fleck[0]!, pos: [0.45, 0.85, 0.35], rot: [0.3, 0.5, 0.2] },
      { g: box(0.16 * fk, 0.28 * fk, 0.16 * fk), color: fleck[1]!, pos: [-0.3, 0.95, 0.4], rot: [0.2, 0.2, -0.3] },
      { g: box(0.26 * fk, 0.18 * fk, 0.2 * fk), color: fleck[2]!, pos: [0.1, 1.0, -0.3], rot: [0.5, 0.1, 0.2] },
      { g: box(0.14 * fk, 0.22 * fk, 0.14 * fk), color: fleck[3]!, pos: [0.75, 0.45, -0.1], rot: [0.1, 0.8, 0.3] },
    ]),
    dead: bake([...rubbleParts(), { g: box(0.1, 0.07, 0.1), color: '#3a424c', pos: [0.05, 0.19, 0.02], rot: [0.3, 0.5, 0.1] }]),
    liveMat: fadeMat(cave ? mat('#9fb3c8', 0.14) : mat()),
    labelY: 2.1,
    castShadow: true,
    fade: [[0, 0.6, 0, 1.0]],
  };

  const goldFleck = mixColor(c.gold, '#fff2b0', 0.3);
  const goldBody = mixColor(c.rock, c.dark, 0.3);
  const gold: KindAssets = {
    live: bake([
      { g: dodeca(0.9), color: goldBody, pos: [0, 0.55, 0], scale: [1.1, 0.8, 0.95], rot: [0.1, 2.1, 0.05] },
      { g: dodeca(0.45), color: rockDark, pos: [0.65, 0.25, -0.25] },
      // Pepitas grandes e claras: precisam saltar da rocha escura em vista isométrica.
      { g: dodeca(0.24), color: goldFleck, pos: [0.45, 0.85, 0.42], rot: [0.3, 0.5, 0.2] },
      { g: dodeca(0.2), color: c.gold, pos: [-0.35, 0.95, 0.4], rot: [0.2, 0.2, -0.3] },
      { g: dodeca(0.26), color: goldFleck, pos: [0.0, 1.05, -0.2], rot: [0.5, 0.1, 0.2] },
      { g: dodeca(0.18), color: c.gold, pos: [-0.8, 0.5, 0.05], rot: [0.1, 0.8, 0.3] },
      { g: dodeca(0.16), color: goldFleck, pos: [0.85, 0.55, 0.3], rot: [0.1, 0.8, 0.3] },
    ]),
    dead: bake([...rubbleParts(), { g: dodeca(0.08), color: c.gold, pos: [0.05, 0.19, 0.02], rot: [0.3, 0.5, 0.1] }]),
    // Brilho leve: o ouro "cintila" sem estourar a rocha ao redor.
    liveMat: fadeMat(mat(c.gold, 0.18)),
    labelY: 2.1,
    castShadow: true,
    fade: [[0, 0.6, 0, 1.0]],
  };

  // Cristal procedural (barato) fica VISÍVEL em todos; o GLB bonito (92k tris!)
  // só entra nos poucos mais próximos do player (perf) — ver glb-crystals.
  const crystalLiveMat = fadeMat(mat(c.crystal, 0.22));
  const crystal: KindAssets = {
    // PEQUENO e azulado: some SOB o GLB bonito (cristais perto) e, de longe (sem
    // GLB), lê como cristalzinho azul — não mais a base marrom gigante duplicada.
    live: bake([
      { g: dodeca(0.3), color: mixColor(c.crystal, c.dark, 0.45), pos: [0, 0.12, 0], scale: [1.1, 0.6, 0.9] },
      { g: cone(0.11, 0.55, 5), color: c.crystal, pos: [-0.16, 0.42, 0.05], rot: [0, 0, 0.3] },
      { g: cone(0.14, 0.72, 5), color: mixColor(c.crystal, '#ffffff', 0.25), pos: [0, 0.52, 0.05] },
      { g: cone(0.1, 0.46, 5), color: c.crystal, pos: [0.18, 0.4, 0], rot: [0, 0, -0.35] },
    ]),
    dead: bake([
      { g: dodeca(0.55), color: rubble, pos: [0, 0.15, 0], scale: [1.2, 0.5, 1] },
      { g: cone(0.1, 0.22, 5), color: mixColor(c.crystal, c.dark, 0.5), pos: [0.15, 0.3, 0.05], rot: [0, 0, 0.4] },
      { g: cone(0.08, 0.16, 5), color: mixColor(c.crystal, c.dark, 0.5), pos: [-0.2, 0.26, -0.1], rot: [0.3, 0, -0.3] },
    ]),
    liveMat: crystalLiveMat,
    labelY: 2.4,
    castShadow: true,
    fade: [[0, 0.8, 0, 1.0]],
  };

  return {
    assets: { tree, pebble, rock, iron_vein: iron, gold_vein: gold, crystal },
    deadMat: mat(),
  };
}

/* ------------------------------------------------------------------ *
 * Estado compartilhado de hover (ref, sem re-render)
 * ------------------------------------------------------------------ */
type Hover = { id: string | null };
const noRaycast = () => {};

const dummy = new THREE.Object3D();

/* ------------------------------------------------------------------ *
 * SOMBRA só de quem cai na caixa da sombra do sol (1/11, desempenho)
 *
 * O three corta a sombra por LOTE, não por instância: as 48 árvores de
 * coleta (8,9 mil triângulos cada) iam TODAS pro passe de sombra, embora a
 * caixa da sombra só cubra ±45 m em volta do herói (~426 mil triângulos por
 * quadro). Agora o lote da tela não projeta sombra; uma CÓPIA (mesma malha,
 * mesmo material → mesma sombra) leva só as instâncias cuja esfera toca a
 * caixa da sombra (+folga) e desenha só NA SOMBRA (contagem 0 na tela).
 * Quem está fora da caixa não escreve nada no mapa de sombra → visual igual.
 * Clique, fade e piloto continuam no lote da tela, sem mudança.
 * ------------------------------------------------------------------ */
/** Folga (m) na caixa da sombra: a caixa é a do quadro anterior e o herói anda. */
const SHADOW_PAD = 8;
const shadowSunCache: { scene: THREE.Object3D | null; light: THREE.DirectionalLight | null; at: number } = { scene: null, light: null, at: -1e9 };
/** O sol (ÚNICA luz com sombra, direcional). Outra luz com sombra na cena → null (aí vai tudo pra sombra, como antes).
 *  Procura de novo a cada 2 s (luz nova/removida). */
function shadowSun(scene: THREE.Object3D, now: number): THREE.DirectionalLight | null {
  const c = shadowSunCache;
  if (c.scene === scene && now - c.at < 2000 && (!c.light || c.light.parent)) return c.light;
  let found: THREE.Light | null = null, many = false;
  scene.traverse((o) => {
    const l = o as THREE.Light;
    if (!l.isLight || !l.castShadow) return;
    if (found) many = true; else found = l;
  });
  const light = found as THREE.Light | null;
  c.scene = scene; c.at = now;
  c.light = !many && light && (light as THREE.DirectionalLight).isDirectionalLight ? (light as THREE.DirectionalLight) : null;
  return c.light;
}
const shFrustum = new THREE.Frustum();
const shProj = new THREE.Matrix4();
const shSphere = new THREE.Sphere();
const shM = new THREE.Matrix4();
const shV = new THREE.Vector3();

/* ------------------------------------------------------------------ *
 * RECORTE PELA CÂMERA (1/11, desempenho)
 *
 * O lote inteiro (48 árvores) era desenhado todo quadro, até as de trás da
 * câmera — o three corta o LOTE, não cada instância. Medido: a câmera vê de
 * 0 a 13 delas. Agora as que tocam a visão da câmera (+ folga) vão pro
 * começo do lote e só elas são desenhadas/clicáveis; `ids` segue a mesma
 * ordem (clique certo). Só quando NENHUM fade está rodando (Zona Sul): com
 * fade (Vale) a opacidade mora no índice da instância → ordem original.
 * ------------------------------------------------------------------ */
/** Folga do recorte: metros + fração da distância (~8°) — câmera girando rápido não deixa árvore de fora. */
const VIEW_PAD = 3, VIEW_PAD_K = 0.15;
/**
 * ÁRVORE DE LONGE (01/11 — Pedro: "falta árvore de farm"; 108 → 258 recursos): além de `d` m da câmera a árvore de
 * coleta vai pro lote LEVE (mesma copa, ~2 mil triângulos em vez de ~8,9 mil — `harvestTreeGeometry(c, true)`). Medido:
 * do nascedouro a câmera via 124 árvores (1,86 mi de triângulos). Só com o recorte ligado (Zona Sul, sem fade).
 */
export const harvestLod = { d: 120 };
if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __harvestLod?: unknown }).__harvestLod = harvestLod; // testes de tela (A/B)
const vFrustum = new THREE.Frustum();
const vProj = new THREE.Matrix4();
/** Matrizes e ids na ordem ORIGINAL (todas as vivas) — a fonte; o lote da tela recebe a parte visível. */
type LiveBase = { m: Float32Array; ids: string[]; n: number };

function KindInstances({
  kind, nodes, assets, deadMat, hover,
}: {
  kind: HarvestNodeKind;
  nodes: HarvestNodeState[];
  assets: KindAssets;
  deadMat: THREE.Material;
  hover: React.RefObject<Hover>;
}) {
  const mine = useMemo(() => nodes.filter(n => n.kind === kind), [nodes, kind]);
  const cap = Math.max(1, mine.length);
  const liveRef = useRef<THREE.InstancedMesh>(null);
  const deadRef = useRef<THREE.InstancedMesh>(null);
  /** Cópia SÓ-SOMBRA do lote vivo (ver "SOMBRA só de quem cai na caixa"). */
  const shadowRef = useRef<THREE.InstancedMesh>(null);
  /** Esfera de cada instância viva (x, y, z, raio) e o que está na cópia de sombra agora. */
  const spheres = useRef<Float32Array>(new Float32Array(0));
  const inShadow = useRef({ n: 0, idx: new Int32Array(Math.max(1, nodes.length)), dirty: true });
  /** Ordem original (fonte) + o que está no lote da tela agora (recorte pela câmera). */
  const base = useRef<LiveBase>({ m: new Float32Array(0), ids: [], n: 0 });
  const view = useRef({ k: 0, order: new Int32Array(Math.max(1, nodes.length)), culled: false });
  /** `ids[i]` = id do nó na instância `i` do mesh VIVO. */
  const ids = useRef<string[]>([]);
  /** Lote de LONGE (árvore leve — `harvestLod`): o que está nele agora e os ids das instâncias dele. */
  const farRef = useRef<THREE.InstancedMesh>(null);
  const farView = useRef({ k: 0, order: new Int32Array(Math.max(1, nodes.length)) });
  const farIds = useRef<string[]>([]);
  const tv = useTerrainVersion(); // reassenta na superfície do GLB quando ele carrega

  useLayoutEffect(() => {
    const live = liveRef.current;
    const dead = deadRef.current;
    if (!live || !dead) return;
    let li = 0;
    let di = 0;
    const list: string[] = [];
    for (const n of mine) {
      const r = rand(n.seed + 17);
      const yaw = rand(n.seed + 3) * Math.PI * 2;
      const y = harvestNodeY(n);
      dummy.position.set(n.position.x, y, n.position.z);
      dummy.rotation.set(0, yaw, 0);
      if (n.depleted) {
        const s = (0.9 + r * 0.3) * (kind === 'pebble' ? 1.5 : 1);
        dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        dead.setMatrixAt(di++, dummy.matrix);
      } else {
        // Encolhe um pouco conforme o estoque cai: dá leitura de "quase no fim".
        const fill = n.maxQuantity > 0 ? n.quantity / n.maxQuantity : 1;
        const s = (0.85 + r * 0.4) * (0.8 + 0.2 * Math.max(0, Math.min(1, fill))) * (kind === 'pebble' ? 1.5 : 1);
        if (kind === 'tree') {
          // Árvore de farm (Pedro 25/10): +~1 m e cada uma com altura PRÓPRIA (pareciam todas iguais).
          // Altura 4,9 m × 1,02–1,42 → ~5–7 m; largura varia pouco (0,95–1,15) → floresta natural, sem exagero.
          const fillK = 0.8 + 0.2 * Math.max(0, Math.min(1, fill));
          const w = (0.95 + r * 0.2) * fillK;
          // +32% de altura (Pedro 25/10, TREE_HEIGHT_K): ~6,6–9,2 m.
          dummy.scale.set(w, (1.02 + rand(n.seed + 29) * 0.4) * fillK * TREE_HEIGHT_K, w);
        } else dummy.scale.set(s, s, s);
        dummy.updateMatrix();
        live.setMatrixAt(li, dummy.matrix);
        list[li] = n.id;
        li++;
      }
    }
    ids.current = list;
    live.count = li;
    dead.count = di;
    live.instanceMatrix.needsUpdate = true;
    dead.instanceMatrix.needsUpdate = true;
    // O bounding sphere é cacheado: sem invalidar, culling e raycast usam o
    // volume da montagem anterior.
    live.boundingSphere = null;
    dead.boundingSphere = null;
    // esferas das instâncias vivas (pra escolher quem vai pra sombra) — a cópia de sombra se refaz no próximo quadro
    if (!assets.live.boundingSphere) assets.live.computeBoundingSphere();
    const bs = assets.live.boundingSphere!;
    const sp = new Float32Array(li * 4);
    for (let i = 0; i < li; i++) {
      live.getMatrixAt(i, shM);
      shV.copy(bs.center).applyMatrix4(shM);
      sp[i * 4] = shV.x; sp[i * 4 + 1] = shV.y; sp[i * 4 + 2] = shV.z; sp[i * 4 + 3] = bs.radius * shM.getMaxScaleOnAxis();
    }
    spheres.current = sp;
    if (inShadow.current.idx.length < cap) inShadow.current.idx = new Int32Array(cap);
    inShadow.current.dirty = true;
    // fonte na ordem original; o lote da tela está inteiro agora (o recorte refaz no próximo quadro)
    base.current = { m: (live.instanceMatrix.array as Float32Array).slice(0, li * 16), ids: list.slice(), n: li };
    live.userData['harvestBase'] = base.current; // (testes de tela: desenhar o lote inteiro pra comparar)
    if (view.current.order.length < cap) view.current.order = new Int32Array(cap);
    view.current.k = li; view.current.culled = false;
    for (let i = 0; i < li; i++) view.current.order[i] = i;
    // lote de longe: vazio até o próximo recorte (que redistribui perto/longe)
    if (farView.current.order.length < cap) farView.current.order = new Int32Array(cap);
    farView.current.k = 0; farIds.current = [];
    if (farRef.current) farRef.current.count = 0;
  }, [mine, cap, kind, tv, assets]);

  // lote de longe usa o MESMO material da árvore (mesma luz/cor/1 passada); o alfa por instância fica sempre 100%
  useLayoutEffect(() => {
    if (!assets.far) return;
    assets.far.setAttribute('aFade', new THREE.InstancedBufferAttribute(new Float32Array(cap).fill(1), 1));
    if (farRef.current) farRef.current.count = 0;
  }, [cap, assets]);

  // Cópia de sombra: na TELA desenha 0 instâncias; só no passe de sombra desenha as escolhidas.
  useLayoutEffect(() => {
    const sh = shadowRef.current;
    if (!sh) return;
    sh.count = 0;
    sh.onBeforeShadow = () => { sh.count = inShadow.current.n; };
    sh.onAfterShadow = () => { sh.count = 0; };
    inShadow.current.dirty = true;
  }, [cap]);

  useFrame(({ scene, camera }) => {
    const live = liveRef.current;
    if (!live) return;
    const B = base.current, sp = spheres.current, n = Math.min(B.n, sp.length / 4);
    // 1) RECORTE PELA CÂMERA (só sem fade rodando): quem a câmera vê vai pro começo do lote
    {
      const V = view.current, F = farView.current, far = farRef.current;
      let k = 0, changed = false;
      if (fadeLoop.mounted === 0) {
        camera.updateMatrixWorld();
        vProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
        vFrustum.setFromProjectionMatrix(vProj);
        const cp = camera.position;
        const lodD = far && assets.far ? harvestLod.d : Infinity;
        let kf = 0, farChanged = false;
        for (let i = 0; i < n; i++) {
          const x = sp[i * 4]!, y = sp[i * 4 + 1]!, z = sp[i * 4 + 2]!;
          const dist = Math.hypot(x - cp.x, y - cp.y, z - cp.z);
          shSphere.center.set(x, y, z);
          shSphere.radius = sp[i * 4 + 3]! + VIEW_PAD + dist * VIEW_PAD_K;
          if (!vFrustum.intersectsSphere(shSphere)) continue;
          if (dist > lodD) { if (F.order[kf] !== i) { F.order[kf] = i; farChanged = true; } kf++; continue; } // longe: árvore leve
          if (V.order[k] !== i) { V.order[k] = i; changed = true; }
          k++;
        }
        if (k !== V.k || !V.culled) changed = true;
        V.culled = true;
        if (far && (farChanged || kf !== F.k)) {
          const dst = far.instanceMatrix.array as Float32Array, list: string[] = [];
          for (let j = 0; j < kf; j++) { const o = F.order[j]!; dst.set(B.m.subarray(o * 16, o * 16 + 16), j * 16); list[j] = B.ids[o]!; }
          farIds.current = list; far.count = kf; F.k = kf;
          far.instanceMatrix.needsUpdate = true; far.boundingSphere = null;
        }
      } else if (V.culled) { // fade voltou a rodar: ordem original, lote inteiro
        for (let i = 0; i < n; i++) V.order[i] = i;
        k = n; changed = true; V.culled = false;
        if (far) { far.count = 0; F.k = 0; farIds.current = []; }
      }
      if (changed) {
        const dst = live.instanceMatrix.array as Float32Array, list: string[] = [];
        for (let j = 0; j < k; j++) { const o = V.order[j]!; dst.set(B.m.subarray(o * 16, o * 16 + 16), j * 16); list[j] = B.ids[o]!; }
        ids.current = list;
        live.count = k; V.k = k;
        live.instanceMatrix.needsUpdate = true;
        live.boundingSphere = null;
      }
    }
    // 2) SOMBRA: quem toca a caixa da sombra do sol (a do quadro anterior + folga) vai pra cópia de sombra
    const sh = shadowRef.current;
    if (!sh) return;
    const st = inShadow.current;
    const sun = shadowSun(scene, performance.now());
    const cam = sun?.shadow.camera;
    const ready = !!sun && !!sun.shadow.map; // antes do 1º passe de sombra a caixa ainda não existe
    if (ready) { shProj.multiplyMatrices(cam!.projectionMatrix, cam!.matrixWorldInverse); shFrustum.setFromProjectionMatrix(shProj); }
    let k = 0, changed = st.dirty;
    for (let i = 0; i < n; i++) {
      if (ready) {
        shSphere.center.set(sp[i * 4]!, sp[i * 4 + 1]!, sp[i * 4 + 2]!);
        shSphere.radius = sp[i * 4 + 3]! + SHADOW_PAD;
        if (!shFrustum.intersectsSphere(shSphere)) continue;
      }
      if (st.idx[k] !== i) { st.idx[k] = i; changed = true; }
      k++;
    }
    if (k !== st.n) changed = true;
    if (!changed) return;
    const src = B.m, dst = sh.instanceMatrix.array as Float32Array;
    for (let j = 0; j < k; j++) dst.set(src.subarray(st.idx[j]! * 16, st.idx[j]! * 16 + 16), j * 16);
    st.n = k; st.dirty = false;
    sh.instanceMatrix.needsUpdate = true;
  });

  // Fade por instância do lote vivo: recria o atributo se o mesh foi remontado.
  useLayoutEffect(() => {
    const live = liveRef.current;
    if (!live) return;
    return registerInstancedFade(live, assets.fade);
  }, [cap, assets]);

  // clique/hover: o lote de perto e o de longe (cada um com os ids das SUAS instâncias)
  const onDown = (list: React.RefObject<string[]>) => (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.instanceId === undefined) return;
    const id = list.current[e.instanceId];
    if (!id) return;
    e.stopPropagation();
    markPointerConsumed(e.nativeEvent);
    if (e.shiftKey) {
      addObjective('gather_node', id);
      return;
    }
    // A mensagem de ferramenta ausente (ou de sucesso) vem da store.
    useGameStore.getState().harvestAt(id);
  };
  const onMove = (list: React.RefObject<string[]>) => (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return;
    const id = list.current[e.instanceId];
    if (!id) return;
    e.stopPropagation();
    if (hover.current.id !== id) {
      hover.current.id = id;
      document.body.style.cursor = 'pointer';
    }
  };
  const onPointerDown = onDown(ids), onPointerMove = onMove(ids);

  const onPointerOut = () => {
    if (hover.current.id && (ids.current.includes(hover.current.id) || farIds.current.includes(hover.current.id))) {
      hover.current.id = null;
      document.body.style.cursor = '';
    }
  };

  return (
    <>
      <instancedMesh
        key={`live-${cap}`}
        ref={liveRef}
        args={[assets.live, assets.liveMat, cap]}
        castShadow={false}
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
      />
      {assets.far && (
        <instancedMesh
          key={`far-${cap}`}
          ref={farRef}
          args={[assets.far, assets.liveMat, cap]}
          count={0}
          castShadow={false}
          receiveShadow
          onPointerDown={onDown(farIds)}
          onPointerMove={onMove(farIds)}
          onPointerOut={onPointerOut}
        />
      )}
      {assets.castShadow && (
        <instancedMesh
          key={`shadow-${cap}`}
          ref={shadowRef}
          args={[assets.live, assets.liveMat, cap]}
          castShadow
          frustumCulled={false}
          raycast={noRaycast}
        />
      )}
      <instancedMesh
        key={`dead-${cap}`}
        ref={deadRef}
        args={[assets.dead, deadMat, cap]}
        receiveShadow
        raycast={noRaycast}
      />
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Rótulo flutuante único (hover ou alvo atual do piloto)
 * ------------------------------------------------------------------ */
function nodeLabelText(n: HarvestNodeState): string {
  const def = HARVEST_NODES[n.kind];
  const item = def ? ITEMS[def.resourceId]?.name : undefined;
  const name = def?.name ?? n.kind;
  if (n.depleted) return `${name} (esgotado)`;
  return item ? `${name} · ${item}` : name;
}

function HarvestLabel({
  c, hover, assets, layer,
}: {
  c: Palette;
  hover: React.RefObject<Hover>;
  assets: Record<HarvestNodeKind, KindAssets>;
  layer: number;
}) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const mat = useRef<THREE.MeshBasicMaterial>(null);
  const lastText = useRef('');
  const initial = useMemo(() => labelTexture('Recurso', c.light), [c.light]);

  useFrame(state => {
    const g = group.current;
    if (!g) return;
    let id = hover.current.id;
    if (!id) {
      // Alvo atual do piloto: objetivo `gather_node` ativo.
      const items = useGameStore.getState().objectives.items;
      for (let i = 0; i < items.length; i++) {
        const o = items[i]!;
        if (o.status === 'active' && o.kind === 'gather_node' && o.targetId) { id = o.targetId; break; }
      }
    }
    const node = id ? harvestNodeById(id) : undefined;
    if (!node || (node.layer ?? 0) !== layer) { g.visible = false; return; } // o da outra camada é do outro desenho
    if (node.depleted && hover.current.id === id) {
      // Nó esgotado sob o cursor: some (e não deixa o cursor de "mão" preso).
      hover.current.id = null;
      document.body.style.cursor = '';
    }
    g.visible = true;
    g.position.set(node.position.x, harvestNodeY(node) + assets[node.kind].labelY, node.position.z);
    g.quaternion.copy(state.camera.quaternion);
    const text = nodeLabelText(node);
    if (text !== lastText.current) {
      lastText.current = text;
      const tex = labelTexture(text, c.light);
      if (mat.current) mat.current.map = tex.texture;
      if (mesh.current) mesh.current.scale.set(0.42 * tex.aspect, 0.42, 1);
    }
  });

  return (
    <group ref={group} visible={false}>
      <mesh ref={mesh} renderOrder={12} raycast={noRaycast} scale={[0.42 * initial.aspect, 0.42, 1]}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial ref={mat} map={initial.texture} transparent depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ *
 * Componente público
 * ------------------------------------------------------------------ */
/** `layer` (02/11, minério da caverna): desenha só os nós desta CAMADA (0 = superfície, como sempre; 1 = caverna — o
 *  mundo monta um segundo, fora do grupo da superfície). As pedras/cristais em GLB são só da superfície. */
export function HarvestNodes({ c, layer = 0 }: { c: Palette; layer?: number }) {
  const all = useGameStore(s => s.harvestNodes);
  const nodes = useMemo(() => all.filter(n => (n.layer ?? 0) === layer), [all, layer]);
  const built = useMemo(() => buildAssets(c, layer === 1), [c, layer]);
  const hover = useRef<Hover>({ id: null });

  return (
    <>
      {KINDS.map(kind => (
        <KindInstances
          key={kind}
          kind={kind}
          nodes={nodes}
          assets={built.assets[kind]}
          deadMat={built.deadMat}
          hover={hover}
        />
      ))}
      {layer === 0 && USE_GLB_CRYSTAL && <GlbCrystals />}
      {layer === 0 && <GlbRocks />}
      <HarvestLabel c={c} hover={hover} assets={built.assets} layer={layer} />
    </>
  );
}
