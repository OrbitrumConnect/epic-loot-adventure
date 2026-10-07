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
 */
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { HARVEST_NODES } from '@/game/data/harvest-nodes';
import { ITEMS } from '@/game/data/items';
import { useGameStore } from '@/game/state/game-store';
import type { HarvestNodeKind, HarvestNodeState } from '@/game/types';
import { addObjective } from './objective-bridge';
import {
  labelTexture, markPointerConsumed, mixColor, rand, terrainHeight, type Palette,
} from './world-kit';

const KINDS: HarvestNodeKind[] = ['tree', 'pebble', 'rock', 'iron_vein', 'gold_vein', 'crystal'];

/* ------------------------------------------------------------------ *
 * Busca de nó com cache por identidade do array (igual a `creatureById`)
 * ------------------------------------------------------------------ */
let cachedArray: HarvestNodeState[] | null = null;
let cachedMap = new Map<string, HarvestNodeState>();

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
type Part = {
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

function bake(parts: Part[]): THREE.BufferGeometry {
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
  dead: THREE.BufferGeometry;
  liveMat: THREE.Material;
  /** Altura do rótulo flutuante. */
  labelY: number;
  castShadow: boolean;
};

function buildAssets(c: Palette): { assets: Record<HarvestNodeKind, KindAssets>; deadMat: THREE.Material } {
  const rockDark = mixColor(c.rock, c.dark, 0.35);
  const rubble = mixColor(c.rock, c.ground, 0.45);
  const ironBody = mixColor(c.rock, c.dark, 0.55);
  const crown = mixColor(c['leaf-light'], c.gold, 0.4);

  const mat = (emissive?: string, intensity = 0) =>
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      flatShading: true,
      ...(emissive ? { emissive: new THREE.Color(emissive), emissiveIntensity: intensity } : {}),
    });

  // Rubble compartilhado de rochas esgotadas (3 pedrinhas baixas e escuras).
  const rubbleParts = (): Part[] => [
    { g: dodeca(0.3), color: rubble, pos: [0.0, 0.1, 0.0], scale: [1.2, 0.5, 1] },
    { g: dodeca(0.2), color: rockDark, pos: [0.4, 0.07, 0.15], scale: [1, 0.5, 1] },
    { g: dodeca(0.16), color: rubble, pos: [-0.3, 0.06, -0.25], scale: [1, 0.5, 1] },
  ];

  const tree: KindAssets = {
    live: bake([
      { g: cyl(0.14, 0.26, 3.6, 6), color: c.trunk, pos: [0, 1.8, 0] },
      // Raízes e talho de machado em cor clara: lê "árvore de corte".
      { g: cyl(0.3, 0.4, 0.25, 6), color: mixColor(c.trunk, c.dark, 0.3), pos: [0, 0.12, 0] },
      { g: box(0.34, 0.16, 0.34), color: c.light, pos: [0, 1.2, 0.1], rot: [0, 0.4, 0] },
      { g: new THREE.IcosahedronGeometry(1.3, 0), color: crown, pos: [0, 3.9, 0], scale: [1.15, 0.95, 1.1] },
      { g: new THREE.IcosahedronGeometry(0.85, 0), color: c['leaf-light'], pos: [0.85, 3.3, 0.3] },
      { g: new THREE.IcosahedronGeometry(0.75, 0), color: c.leaf, pos: [-0.8, 3.45, -0.35] },
    ]),
    dead: bake([
      { g: cyl(0.3, 0.4, 0.5, 7), color: c.trunk, pos: [0, 0.25, 0] },
      { g: cyl(0.26, 0.26, 0.05, 7), color: c['ground-light'], pos: [0, 0.52, 0] },
      { g: box(0.3, 0.08, 0.14), color: c.trunk, pos: [0.55, 0.05, 0.1], rot: [0, 0.6, 0] },
      { g: box(0.22, 0.07, 0.1), color: c.trunk, pos: [-0.5, 0.04, -0.2], rot: [0, -0.4, 0] },
    ]),
    liveMat: mat(),
    labelY: 4.9,
    castShadow: true,
  };

  const pebble: KindAssets = {
    live: bake([
      { g: dodeca(0.2), color: c.rock, pos: [0, 0.1, 0], scale: [1, 0.7, 0.9] },
      { g: dodeca(0.14), color: c['rock-light'], pos: [0.28, 0.07, 0.1], scale: [1, 0.7, 1] },
      { g: dodeca(0.12), color: c.rock, pos: [-0.2, 0.06, 0.22] },
      { g: dodeca(0.1), color: c['rock-light'], pos: [0.05, 0.05, -0.28] },
    ]),
    dead: bake([{ g: new THREE.CircleGeometry(0.28, 7), color: c['ground-light'], pos: [0, 0.02, 0], rot: [-Math.PI / 2, 0, 0] }]),
    liveMat: mat(),
    labelY: 0.9,
    castShadow: false,
  };

  const rock: KindAssets = {
    live: bake([
      { g: dodeca(0.95), color: c.rock, pos: [0, 0.6, 0], scale: [1.1, 0.8, 0.95], rot: [0.1, 0.4, 0.05] },
      { g: dodeca(0.55), color: c['rock-light'], pos: [0.7, 0.3, 0.35] },
      { g: dodeca(0.4), color: rockDark, pos: [-0.65, 0.25, -0.3] },
    ]),
    dead: bake(rubbleParts()),
    liveMat: mat(),
    labelY: 2.1,
    castShadow: true,
  };

  const iron: KindAssets = {
    live: bake([
      { g: dodeca(0.9), color: ironBody, pos: [0, 0.55, 0], scale: [1.1, 0.8, 0.95], rot: [0.1, 0.9, 0.05] },
      { g: dodeca(0.45), color: rockDark, pos: [-0.65, 0.25, 0.25] },
      // Manchas metálicas escuras e azuladas.
      { g: box(0.22, 0.34, 0.22), color: '#2c3138', pos: [0.45, 0.85, 0.35], rot: [0.3, 0.5, 0.2] },
      { g: box(0.16, 0.28, 0.16), color: '#59626e', pos: [-0.3, 0.95, 0.4], rot: [0.2, 0.2, -0.3] },
      { g: box(0.26, 0.18, 0.2), color: '#3a424c', pos: [0.1, 1.0, -0.3], rot: [0.5, 0.1, 0.2] },
      { g: box(0.14, 0.22, 0.14), color: '#7a8591', pos: [0.75, 0.45, -0.1], rot: [0.1, 0.8, 0.3] },
    ]),
    dead: bake([...rubbleParts(), { g: box(0.1, 0.07, 0.1), color: '#3a424c', pos: [0.05, 0.19, 0.02], rot: [0.3, 0.5, 0.1] }]),
    liveMat: mat(),
    labelY: 2.1,
    castShadow: true,
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
    liveMat: mat(c.gold, 0.18),
    labelY: 2.1,
    castShadow: true,
  };

  const crystal: KindAssets = {
    live: bake([
      { g: dodeca(0.8), color: c.rock, pos: [0, 0.4, 0], scale: [1.1, 0.7, 0.9] },
      { g: cone(0.2, 1.1, 5), color: c.crystal, pos: [-0.4, 1.05, 0.1], rot: [0, 0, 0.3] },
      { g: cone(0.26, 1.45, 5), color: mixColor(c.crystal, '#ffffff', 0.25), pos: [0, 1.25, 0.1] },
      { g: cone(0.18, 0.95, 5), color: c.crystal, pos: [0.42, 1.0, 0.0], rot: [0, 0, -0.35] },
    ]),
    dead: bake([
      { g: dodeca(0.55), color: rubble, pos: [0, 0.15, 0], scale: [1.2, 0.5, 1] },
      { g: cone(0.1, 0.22, 5), color: mixColor(c.crystal, c.dark, 0.5), pos: [0.15, 0.3, 0.05], rot: [0, 0, 0.4] },
      { g: cone(0.08, 0.16, 5), color: mixColor(c.crystal, c.dark, 0.5), pos: [-0.2, 0.26, -0.1], rot: [0.3, 0, -0.3] },
    ]),
    liveMat: mat(c.crystal, 0.22),
    labelY: 2.4,
    castShadow: true,
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
  /** `ids[i]` = id do nó na instância `i` do mesh VIVO. */
  const ids = useRef<string[]>([]);

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
      const y = terrainHeight(n.position.x, n.position.z);
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
        dummy.scale.set(s, s, s);
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
  }, [mine, cap, kind]);

  const onPointerDown = (e: ThreeEvent<PointerEvent>) => {
    if (e.button !== 0 || e.instanceId === undefined) return;
    const id = ids.current[e.instanceId];
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

  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (e.instanceId === undefined) return;
    const id = ids.current[e.instanceId];
    if (!id) return;
    e.stopPropagation();
    if (hover.current.id !== id) {
      hover.current.id = id;
      document.body.style.cursor = 'pointer';
    }
  };

  const onPointerOut = () => {
    if (hover.current.id && ids.current.includes(hover.current.id)) {
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
        castShadow={assets.castShadow}
        receiveShadow
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerOut={onPointerOut}
      />
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
  c, hover, assets,
}: {
  c: Palette;
  hover: React.RefObject<Hover>;
  assets: Record<HarvestNodeKind, KindAssets>;
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
    if (!node) { g.visible = false; return; }
    if (node.depleted && hover.current.id === id) {
      // Nó esgotado sob o cursor: some (e não deixa o cursor de "mão" preso).
      hover.current.id = null;
      document.body.style.cursor = '';
    }
    g.visible = true;
    g.position.set(node.position.x, terrainHeight(node.position.x, node.position.z) + assets[node.kind].labelY, node.position.z);
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
export function HarvestNodes({ c }: { c: Palette }) {
  const nodes = useGameStore(s => s.harvestNodes);
  const built = useMemo(() => buildAssets(c), [c]);
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
      <HarvestLabel c={c} hover={hover} assets={built.assets} />
    </>
  );
}
