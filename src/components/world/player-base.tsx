/**
 * A base do jogador no mundo 3D (Fase 3) e o modo de construção.
 *
 * Duas partes independentes, ambas sem seletor do Zustand (tudo por
 * `getState()` no laço de quadro):
 *
 *  - `BaseStructures`: desenha `playerBase.pieces`. Uma `InstancedMesh` por
 *    (tipo, nível) com capacidade fixa de uma célula por quadrícula do claim
 *    (8 x 8 = 64): nunca remonta. `ids[i]` guarda o id da peça na instância `i`
 *    (mesma ordem do `setMatrixAt`), que é como o clique volta para a peça.
 *    O lote só é reescrito quando a identidade de `playerBase.pieces` muda.
 *    Peça machucada pende, escurece e ganha rachaduras (lote separado).
 *  - `BuildLayer`: quadrado do claim no chão, grade, prévia do arrasto, rótulo
 *    flutuante e a entrada (teclas + ponteiro) do modo de construção.
 *
 * Sem colisão (o jogo não tem); a porta só se lê como entrada.
 */
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BASE_PIECES, CLAIM_SIZE } from '@/game/data/base-pieces';
import { ITEMS } from '@/game/data/items';
import { useGameStore } from '@/game/state/game-store';
import { cellCenter, checkClaim, previewLine, worldToCell } from '@/game/systems/playerBaseSystem';
import {
  BASE_GRID, type BasePiece, type BasePieceKind, type BuildPreview, type ClaimCheck, type GridCell,
} from '@/game/types/playerbase';
import { buildCrackGeometries, buildPieceAssets, CRACK_FADE } from './base-geometry';
import {
  getBuildMode, isBuildActive, patchBuildMode, registerClaimHandler, setBuildActive, toggleBuildMode,
  cycleBuildKind, cycleBuildTier, confirmClaim,
} from './build-mode';
import { makeInstanceFadeMaterial, registerInstancedFade } from './occlusion';
import { labelTexture, pixelsPerUnit, terrainHeight, type Palette } from './world-kit';

const noRaycast = () => {};

const KINDS: BasePieceKind[] = ['core', 'wall', 'door', 'tower', 'roof'];
const CAP = CLAIM_SIZE * CLAIM_SIZE;
const TIER_NAMES = ['madeira', 'pedra', 'ferro'] as const;

const dummy = new THREE.Object3D();
dummy.rotation.order = 'YXZ';
const tmpColor = new THREE.Color();
const DAMAGE_TINT = new THREE.Color(0.36, 0.3, 0.28);
const WHITE = new THREE.Color(1, 1, 1);

/** Sinal estável por peça (para a peça pender sempre para o mesmo lado). */
function pieceSign(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return (h & 1) === 0 ? 1 : -1;
}

/* ================================================================== *
 * Peças
 * ================================================================== */
type Batch = {
  kind: BasePieceKind;
  tier: 1 | 2 | 3;
  mesh: THREE.InstancedMesh;
  ids: string[];
  fade: readonly (readonly [number, number, number, number])[];
};

type CrackBatch = {
  key: 'wall' | 'door' | 'tower';
  mesh: THREE.InstancedMesh;
};

function crackKeyFor(kind: BasePieceKind, tier: number): CrackBatch['key'] | null {
  if (kind === 'wall') return 'wall';
  if (kind === 'door') return 'door';
  // A atalaia de madeira é aberta (pernas e plataforma): só a torre de pedra/ferro racha.
  if (kind === 'tower' && tier > 1) return 'tower';
  return null;
}

function BaseStructures({ c }: { c: Palette }) {
  const built = useMemo(() => {
    const assets = buildPieceAssets(c);
    const crackGeo = buildCrackGeometries();
    const fadeMat = makeInstanceFadeMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true }));
    const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true });
    const crackMat = makeInstanceFadeMaterial(new THREE.MeshBasicMaterial({ vertexColors: true }));

    const batches: Batch[] = [];
    for (const kind of KINDS) {
      for (const tier of [1, 2, 3] as const) {
        const a = assets[`${kind}${tier}`];
        const mesh = new THREE.InstancedMesh(a.geo, a.fade.length > 0 ? fadeMat : plainMat, CAP);
        mesh.count = 0;
        mesh.castShadow = a.castShadow;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        mesh.setColorAt(0, WHITE); // cria o atributo de cor por instância
        batches.push({ kind, tier, mesh, ids: [], fade: a.fade });
      }
    }
    const cracks: CrackBatch[] = (['wall', 'door', 'tower'] as const).map(key => {
      const mesh = new THREE.InstancedMesh(crackGeo[key], crackMat, CAP);
      mesh.count = 0;
      mesh.frustumCulled = false;
      mesh.raycast = noRaycast;
      return { key, mesh };
    });
    return { assets, crackGeo, fadeMat, plainMat, crackMat, batches, cracks };
  }, [c]);

  // Fade por instância (a peça some quando esconde o jogador na câmera isométrica).
  useEffect(() => {
    const offs: (() => void)[] = [];
    for (const b of built.batches) if (b.fade.length > 0) offs.push(registerInstancedFade(b.mesh, b.fade));
    for (const cr of built.cracks) offs.push(registerInstancedFade(cr.mesh, CRACK_FADE[cr.key]));
    return () => { for (const off of offs) off(); };
  }, [built]);

  useEffect(() => () => {
    for (const a of Object.values(built.assets)) a.geo.dispose();
    for (const g of Object.values(built.crackGeo)) g.dispose();
    built.fadeMat.dispose();
    built.plainMat.dispose();
    built.crackMat.dispose();
    for (const b of built.batches) b.mesh.dispose();
    for (const cr of built.cracks) cr.mesh.dispose();
  }, [built]);

  const last = useRef<BasePiece[] | null | undefined>(undefined);

  useFrame(() => {
    const base = useGameStore.getState().playerBase;
    const pieces = base ? base.pieces : null;
    if (pieces === last.current) return;
    last.current = pieces;

    for (const b of built.batches) { b.mesh.count = 0; b.ids.length = 0; }
    for (const cr of built.cracks) cr.mesh.count = 0;

    if (pieces) {
      for (const p of pieces) {
        const batch = built.batches[KINDS.indexOf(p.kind) * 3 + (p.tier - 1)];
        if (!batch || batch.mesh.count >= CAP) continue;
        const ctr = cellCenter(p.cell);
        const ratio = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 1;
        const hurt = 1 - ratio;
        const lean = p.kind === 'core' ? 0 : hurt * 0.2 * pieceSign(p.id);
        dummy.position.set(ctr.x, terrainHeight(ctr.x, ctr.z), ctr.z);
        dummy.rotation.set(lean, (p.rotation * Math.PI) / 180, lean * 0.35);
        dummy.scale.set(1, 1 - hurt * 0.1, 1);
        dummy.updateMatrix();
        const i = batch.mesh.count++;
        batch.mesh.setMatrixAt(i, dummy.matrix);
        batch.mesh.setColorAt(i, tmpColor.copy(WHITE).lerp(DAMAGE_TINT, hurt * 0.85));
        batch.ids[i] = p.id;

        if (ratio < 0.72) {
          const key = crackKeyFor(p.kind, p.tier);
          const cr = key ? built.cracks.find(x => x.key === key) : undefined;
          if (cr && cr.mesh.count < CAP) cr.mesh.setMatrixAt(cr.mesh.count++, dummy.matrix);
        }
      }
    }

    for (const b of built.batches) {
      b.mesh.instanceMatrix.needsUpdate = true;
      if (b.mesh.instanceColor) b.mesh.instanceColor.needsUpdate = true;
      // Bounding cacheado: sem invalidar, o raycast usa o volume da montagem anterior.
      b.mesh.boundingSphere = null;
      b.mesh.boundingBox = null;
    }
    for (const cr of built.cracks) cr.mesh.instanceMatrix.needsUpdate = true;
  });

  const inspect = (b: Batch, instanceId: number | undefined) => {
    if (instanceId === undefined) return;
    const id = b.ids[instanceId];
    if (!id) return;
    const piece = useGameStore.getState().playerBase?.pieces.find(p => p.id === id);
    if (!piece) return;
    useGameStore.getState().setMessage(
      `${BASE_PIECES[piece.kind].name} de ${TIER_NAMES[piece.tier - 1]}: ${piece.hp}/${piece.maxHp} PV.`,
    );
  };

  return (
    <>
      {built.batches.map(b => (
        <primitive
          key={`${b.kind}${b.tier}`}
          object={b.mesh}
          onPointerDown={(e: { button: number; instanceId?: number }) => {
            if (e.button === 0) inspect(b, e.instanceId);
          }}
        />
      ))}
      {built.cracks.map(cr => <primitive key={cr.key} object={cr.mesh} />)}
    </>
  );
}

/* ================================================================== *
 * Quadrado do claim, grade e prévia
 * ================================================================== */
const RES = CLAIM_SIZE * BASE_GRID; // amostras de 1 m por lado
const LIFT = 0.1;

type Overlay = {
  group: THREE.Group;
  fill: THREE.Mesh;
  fillMat: THREE.MeshBasicMaterial;
  grid: THREE.LineSegments;
  gridMat: THREE.LineBasicMaterial;
  border: THREE.Mesh;
  borderMat: THREE.MeshBasicMaterial;
  dispose: () => void;
};

function makeOverlay(): Overlay {
  const fillGeo = new THREE.BufferGeometry();
  fillGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((RES + 1) * (RES + 1) * 3), 3));
  const idx: number[] = [];
  for (let j = 0; j < RES; j++) {
    for (let i = 0; i < RES; i++) {
      const a = j * (RES + 1) + i;
      const b = a + 1;
      const cc = a + RES + 1;
      const d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  }
  fillGeo.setIndex(idx);

  const gridGeo = new THREE.BufferGeometry();
  gridGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(2 * (CLAIM_SIZE + 1) * RES * 2 * 3), 3));

  const perimeter = 4 * RES;
  const borderGeo = new THREE.BufferGeometry();
  borderGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(perimeter * 2 * 3), 3));
  const bidx: number[] = [];
  for (let i = 0; i < perimeter; i++) {
    const n = (i + 1) % perimeter;
    bidx.push(i * 2, i * 2 + 1, n * 2, n * 2, i * 2 + 1, n * 2 + 1);
  }
  borderGeo.setIndex(bidx);

  const glow = { transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 } as const;
  const fillMat = new THREE.MeshBasicMaterial({ color: '#3ddc84', opacity: 0.24, side: THREE.DoubleSide, ...glow });
  const borderMat = new THREE.MeshBasicMaterial({ color: '#ffd25a', opacity: 0.4, side: THREE.DoubleSide, ...glow });
  const gridMat = new THREE.LineBasicMaterial({ color: '#ffffff', opacity: 0.25, transparent: true, depthWrite: false });

  const fill = new THREE.Mesh(fillGeo, fillMat);
  const border = new THREE.Mesh(borderGeo, borderMat);
  const grid = new THREE.LineSegments(gridGeo, gridMat);
  for (const o of [fill, border, grid]) { o.frustumCulled = false; o.raycast = noRaycast; }
  fill.renderOrder = 2;
  border.renderOrder = 3;
  grid.renderOrder = 3;

  const group = new THREE.Group();
  group.add(fill, grid, border);
  group.visible = false;
  return {
    group, fill, fillMat, grid, gridMat, border, borderMat,
    dispose: () => { fillGeo.dispose(); gridGeo.dispose(); borderGeo.dispose(); fillMat.dispose(); gridMat.dispose(); borderMat.dispose(); },
  };
}

/** Reposiciona as malhas do overlay sobre o relevo, com `origin` em quadrículas. */
function drapeOverlay(ov: Overlay, origin: GridCell): void {
  const ox = origin.gx * BASE_GRID;
  const oz = origin.gz * BASE_GRID;
  const step = (CLAIM_SIZE * BASE_GRID) / RES;
  const h = (x: number, z: number) => terrainHeight(x, z) + LIFT;

  const fp = ov.fill.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let j = 0; j <= RES; j++) {
    for (let i = 0; i <= RES; i++) {
      const x = ox + i * step;
      const z = oz + j * step;
      fp.setXYZ(j * (RES + 1) + i, x, h(x, z), z);
    }
  }
  fp.needsUpdate = true;

  const gp = ov.grid.geometry.getAttribute('position') as THREE.BufferAttribute;
  let g = 0;
  for (let k = 0; k <= CLAIM_SIZE; k++) {
    const line = k * BASE_GRID;
    for (let i = 0; i < RES; i++) {
      const a = i * step;
      const b = (i + 1) * step;
      gp.setXYZ(g++, ox + a, h(ox + a, oz + line) + 0.03, oz + line);
      gp.setXYZ(g++, ox + b, h(ox + b, oz + line) + 0.03, oz + line);
    }
    for (let i = 0; i < RES; i++) {
      const a = i * step;
      const b = (i + 1) * step;
      gp.setXYZ(g++, ox + line, h(ox + line, oz + a) + 0.03, oz + a);
      gp.setXYZ(g++, ox + line, h(ox + line, oz + b) + 0.03, oz + b);
    }
  }
  gp.needsUpdate = true;

  const bp = ov.border.geometry.getAttribute('position') as THREE.BufferAttribute;
  const W = 0.13;
  const total = CLAIM_SIZE * BASE_GRID;
  for (let i = 0; i < 4 * RES; i++) {
    const side = Math.floor(i / RES);
    const s = (i % RES) * step;
    let px = 0;
    let pz = 0;
    if (side === 0) { px = s; pz = 0; }
    else if (side === 1) { px = total; pz = s; }
    else if (side === 2) { px = total - s; pz = total; }
    else { px = 0; pz = total - s; }
    const nx = px <= 0 ? -1 : px >= total ? 1 : 0;
    const nz = pz <= 0 ? -1 : pz >= total ? 1 : 0;
    const wx = ox + px;
    const wz = oz + pz;
    const y = h(wx, wz) + 0.02;
    bp.setXYZ(i * 2, wx - nx * W, y, wz - nz * W);
    bp.setXYZ(i * 2 + 1, wx + nx * W, y, wz + nz * W);
  }
  bp.needsUpdate = true;
}

/** Ghost da prévia: caixa unitária com base em y = 0, tintada por instância. */
const GHOST_CAP = 48;
const GHOST_OK = new THREE.Color('#4dff8f');
const GHOST_POOR = new THREE.Color('#ff8a3c');
const GHOST_BAD = new THREE.Color('#ff3b30');
const GHOST_SIZE: Record<BasePieceKind, [number, number, number]> = {
  core: [1, 0.6, 1.8], wall: [2, 1.7, 0.6], door: [2, 2.1, 0.6], tower: [1.7, 3.6, 1.7], roof: [2, 2.6, 2],
};

type Mode = 'off' | 'claim-ok' | 'claim-bad' | 'build' | 'idle';

function costText(cost: readonly { itemId: string; quantity: number }[]): string {
  return cost.map(x => `${x.quantity} ${(ITEMS[x.itemId]?.name ?? x.itemId).toLowerCase()}`).join(' + ');
}

function BuildLayer({
  c, playerRef, paused,
}: { c: Palette; playerRef: React.RefObject<THREE.Group | null>; paused: boolean }) {
  const gl = useThree(s => s.gl);
  const getThree = useThree(s => s.get);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const overlay = useMemo(() => makeOverlay(), []);
  const ghost = useMemo(() => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    const mesh = new THREE.InstancedMesh(geo, mat, GHOST_CAP);
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.raycast = noRaycast;
    mesh.renderOrder = 4;
    mesh.setColorAt(0, GHOST_OK);
    return { geo, mat, mesh };
  }, []);

  // Rótulo flutuante único (motivo da recusa do claim / resumo da prévia).
  const labelGroup = useRef<THREE.Group>(null);
  const labelMesh = useRef<THREE.Mesh>(null);
  const labelMat = useRef<THREE.MeshBasicMaterial>(null);
  const initialLabel = useMemo(() => labelTexture('Base', c.light), [c.light]);

  const s = useRef({
    mode: 'off' as Mode,
    originKey: '',
    claimOrigin: { gx: 0, gz: 0 } as GridCell,
    claimCheck: null as ClaimCheck | null,
    cursorValid: false,
    cursor: { x: 0, z: 0 },
    dragging: false,
    dragFrom: { x: 0, z: 0 },
    previewKey: '',
    preview: null as BuildPreview | null,
    seenBase: null as unknown,
    seenInv: null as unknown,
    seenKind: '' as string,
    seenTier: 0,
    labelText: '',
    labelX: 0, labelY: 0, labelZ: 0,
    labelColor: '',
    wasActive: false,
  });

  useEffect(() => () => {
    overlay.dispose();
    ghost.geo.dispose();
    ghost.mat.dispose();
    ghost.mesh.dispose();
  }, [overlay, ghost]);

  /* ---------- prévia ---------- */
  const clearGhost = () => {
    ghost.mesh.count = 0;
    s.current.preview = null;
    s.current.previewKey = '';
    patchBuildMode({ previewCells: 0, previewBlocked: 0, previewAffordable: false, previewCost: [] });
    s.current.labelText = '';
  };

  const applyPreview = (pv: BuildPreview) => {
    const st = s.current;
    st.preview = pv;
    const bm = getBuildMode();
    let n = 0;
    const vertical = pv.cells.length > 1 && pv.cells[0]!.gx === pv.cells[1]!.gx;
    const size = GHOST_SIZE[pv.kind];
    const okColor = pv.affordable ? GHOST_OK : GHOST_POOR;
    for (const cell of pv.cells) {
      if (n >= GHOST_CAP) break;
      const ctr = cellCenter(cell);
      dummy.position.set(ctr.x, terrainHeight(ctr.x, ctr.z), ctr.z);
      dummy.rotation.set(0, vertical && (pv.kind === 'wall' || pv.kind === 'door') ? Math.PI / 2 : 0, 0);
      dummy.scale.set(size[0], size[1], size[2]);
      dummy.updateMatrix();
      ghost.mesh.setMatrixAt(n, dummy.matrix);
      ghost.mesh.setColorAt(n, okColor);
      n++;
    }
    for (const b of pv.blocked) {
      if (n >= GHOST_CAP) break;
      const ctr = cellCenter(b.cell);
      dummy.position.set(ctr.x, terrainHeight(ctr.x, ctr.z) + 0.05, ctr.z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1.9, 0.14, 1.9);
      dummy.updateMatrix();
      ghost.mesh.setMatrixAt(n, dummy.matrix);
      ghost.mesh.setColorAt(n, GHOST_BAD);
      n++;
    }
    ghost.mesh.count = n;
    ghost.mesh.instanceMatrix.needsUpdate = true;
    if (ghost.mesh.instanceColor) ghost.mesh.instanceColor.needsUpdate = true;

    patchBuildMode({
      previewCells: pv.cells.length,
      previewBlocked: pv.blocked.length,
      previewAffordable: pv.affordable,
      previewCost: pv.cost,
    });

    // Rótulo da prévia, na ponta do arrasto.
    const last = pv.cells[pv.cells.length - 1] ?? pv.blocked[0]?.cell;
    if (last) {
      const ctr = cellCenter(last);
      st.labelX = ctr.x; st.labelZ = ctr.z;
      st.labelY = terrainHeight(ctr.x, ctr.z) + GHOST_SIZE[pv.kind][1] + 1.0;
    }
    const name = BASE_PIECES[pv.kind].name;
    if (pv.cells.length === 0) {
      st.labelText = pv.blocked[0]?.reason ?? 'Nada para construir aí.';
      st.labelColor = '#ff8a7a';
    } else if (!pv.affordable) {
      st.labelText = `${name} x${pv.cells.length}: falta material (${costText(pv.cost)})`;
      st.labelColor = '#ffb070';
    } else {
      st.labelText = `${name} x${pv.cells.length}: ${costText(pv.cost)}`;
      st.labelColor = '#9cf0b2';
    }
    void bm;
  };

  const recomputePreview = (force = false) => {
    const st = s.current;
    const gs = useGameStore.getState();
    const base = gs.playerBase;
    const bm = getBuildMode();
    st.seenBase = base;
    st.seenInv = gs.player.inventory;
    if (!bm.active || !base || !st.cursorValid) { if (ghost.mesh.count > 0 || st.preview) clearGhost(); return; }
    const from = st.dragging ? st.dragFrom : st.cursor;
    const a = worldToCell(from);
    const b = worldToCell(st.cursor);
    const key = `${bm.kind}|${bm.tier}|${a.gx},${a.gz}|${b.gx},${b.gz}`;
    if (!force && key === st.previewKey && base === st.seenBase && gs.player.inventory === st.seenInv) return;
    st.previewKey = key;
    st.seenBase = base;
    st.seenInv = gs.player.inventory;
    applyPreview(previewLine(from, st.cursor, bm.kind, base, gs.player.inventory, bm.tier));
  };

  /* ---------- claim ---------- */
  const updateClaimCandidate = (): ClaimCheck | null => {
    const st = s.current;
    const p = playerRef.current;
    if (!p) return st.claimCheck;
    const cell = worldToCell({ x: p.position.x, z: p.position.z });
    const origin: GridCell = { gx: cell.gx - CLAIM_SIZE / 2, gz: cell.gz - CLAIM_SIZE / 2 };
    const key = `${origin.gx},${origin.gz}`;
    if (key !== st.originKey || !st.claimCheck) {
      st.originKey = key;
      st.claimOrigin = origin;
      st.claimCheck = checkClaim(origin, CLAIM_SIZE, { bases: [], heightAt: terrainHeight }, Date.now());
      drapeOverlay(overlay, origin);
      patchBuildMode({ phase: 'claim', claimOk: st.claimCheck.ok, claimMessage: st.claimCheck.message });
      st.labelText = st.claimCheck.ok ? 'Terreno livre: clique para reivindicar' : st.claimCheck.message;
      st.labelColor = st.claimCheck.ok ? '#9cf0b2' : '#ff8a7a';
    }
    return st.claimCheck;
  };

  const doClaim = () => {
    const gs = useGameStore.getState();
    if (gs.playerBase || !isBuildActive()) return;
    const chk = updateClaimCandidate();
    if (!chk) return;
    if (!chk.ok) { gs.setMessage(`Não dá para reivindicar: ${chk.message}`); return; }
    gs.claimBase(chk.origin, terrainHeight);    s.current.originKey = '';
    s.current.labelText = '';
  };

  useEffect(() => {
    registerClaimHandler(doClaim);
    return () => registerClaimHandler(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------- teclas ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      if (e.code === 'KeyN') { toggleBuildMode(); return; }
      if (!isBuildActive()) return;
      if (e.code === 'KeyX') cycleBuildKind();
      else if (e.code === 'KeyZ') cycleBuildTier();
      else if (e.code === 'Enter') confirmClaim();
      else if (e.code === 'Escape') setBuildActive(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      setBuildActive(false);
    };
  }, []);

  /* ---------- ponteiro ---------- */
  useEffect(() => {
    const canvas = gl.domElement;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const probe = new THREE.Vector3();

    /** Ponto do chão sob o cursor: marcha o raio entre y = 9 e y = -3 e refina por bisseção. */
    const pickGround = (e: PointerEvent): boolean => {
      const rect = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(ndc, getThree().camera);
      const { origin, direction } = raycaster.ray;
      if (direction.y > -1e-4) return false;
      const t0 = Math.max(0, (9 - origin.y) / direction.y);
      const t1 = (-3 - origin.y) / direction.y;
      const stepT = 0.3;
      let prev = t0;
      for (let t = t0; t <= t1 + stepT; t += stepT) {
        probe.copy(direction).multiplyScalar(t).add(origin);
        if (probe.y <= terrainHeight(probe.x, probe.z)) {
          let lo = prev;
          let hi = t;
          for (let k = 0; k < 7; k++) {
            const mid = (lo + hi) / 2;
            probe.copy(direction).multiplyScalar(mid).add(origin);
            if (probe.y <= terrainHeight(probe.x, probe.z)) hi = mid; else lo = mid;
          }
          probe.copy(direction).multiplyScalar(hi).add(origin);
          const st = s.current;
          st.cursor.x = probe.x;
          st.cursor.z = probe.z;
          st.cursorValid = true;
          return true;
        }
        prev = t;
      }
      return false;
    };

    const commit = () => {
      const st = s.current;
      // A prévia final sai do arrasto inteiro (início -> onde soltou); só depois o arrasto acaba.
      recomputePreview(true);
      st.dragging = false;
      const pv = st.preview;
      const gs = useGameStore.getState();
      if (!pv || pv.cells.length === 0) {
        gs.setMessage(pv?.blocked[0]?.reason ?? 'Nada para construir aí.');
        return;
      }
      if (!pv.affordable) { gs.setMessage(`Material insuficiente (${costText(pv.cost)}).`); return; }
      gs.placeBasePieces(pv, getBuildMode().tier);
      recomputePreview(true);
    };

    const onDown = (e: PointerEvent) => {
      if (!isBuildActive() || pausedRef.current) return;
      // Modo de construção é dono do ponteiro: nem recurso nem ataque veem o clique.
      e.stopImmediatePropagation();
      e.preventDefault();
      const st = s.current;
      if (e.button === 2) { st.dragging = false; recomputePreview(true); return; }
      if (e.button !== 0) return;
      if (!useGameStore.getState().playerBase) { doClaim(); return; }
      // Build MANUAL desligado (decisão selada): com base já reivindicada, a base
      // sobe ENTREGANDO recurso (botão de construir / martelo), não arrastando muro.
      useGameStore.getState().setMessage('Para construir, farme recursos e entregue na base (botão de construir).');
    };

    const onMove = (e: PointerEvent) => {
      if (!isBuildActive() || pausedRef.current) return;
      if (useGameStore.getState().playerBase) return; // sem prévia de build manual
      if (!pickGround(e)) return;
      recomputePreview();
    };

    const onUp = (e: PointerEvent) => {
      const st = s.current;
      if (!st.dragging || e.button !== 0) return;
      if (pickGround(e)) recomputePreview();
      commit();
    };

    canvas.addEventListener('pointerdown', onDown, true);
    canvas.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      canvas.removeEventListener('pointerdown', onDown, true);
      canvas.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, getThree]);

  /* ---------- quadro ---------- */
  useFrame(state => {
    const st = s.current;
    const gs = useGameStore.getState();
    const base = gs.playerBase;
    const bm = getBuildMode();

    // Entrou/saiu do modo: solta o mouse travado e limpa o arrasto.
    if (bm.active !== st.wasActive) {
      st.wasActive = bm.active;
      st.dragging = false;
      if (bm.active) {
        if (document.pointerLockElement) document.exitPointerLock();
        gl.domElement.style.cursor = 'crosshair';
        gs.setMessage(base
          ? 'Construção: arraste no chão para esticar. X peça, Z material, N sai.'
          : 'Construção: ande até o terreno, N sai, clique para reivindicar.');
      } else {
        gl.domElement.style.cursor = '';
        clearGhost();
      }
      st.originKey = '';
      st.seenBase = null;
    }

    let mode: Mode = 'off';
    if (bm.active && !base) {
      const chk = updateClaimCandidate();
      mode = chk && chk.ok ? 'claim-ok' : 'claim-bad';
    } else if (base) {
      mode = bm.active ? 'build' : 'idle';
      const key = `b${base.origin.gx},${base.origin.gz}`;
      if (key !== st.originKey) {
        st.originKey = key;
        drapeOverlay(overlay, base.origin);
      }
      if (bm.phase !== 'build') patchBuildMode({ phase: 'build' });
      if (bm.active) {
        if (base !== st.seenBase || gs.player.inventory !== st.seenInv || bm.kind !== st.seenKind || bm.tier !== st.seenTier) {
          st.seenKind = bm.kind;
          st.seenTier = bm.tier;
          recomputePreview(true);
        }
        if (st.labelText === '' && st.cursorValid === false) {
          st.labelText = 'Arraste no chão para esticar o muro';
          st.labelColor = '#ffe3b0';
        }
      }
    }

    // Visual do overlay só muda quando o modo muda.
    if (mode !== st.mode) {
      st.mode = mode;
      overlay.group.visible = mode !== 'off';
      overlay.fill.visible = mode !== 'idle';
      overlay.grid.visible = mode === 'build' || mode === 'claim-ok' || mode === 'claim-bad';
      if (mode === 'claim-ok') {
        overlay.fillMat.color.set('#3ddc84'); overlay.fillMat.opacity = 0.26;
        overlay.borderMat.color.set('#6dffa8'); overlay.borderMat.opacity = 0.95;
        overlay.gridMat.color.set('#b8ffd2'); overlay.gridMat.opacity = 0.4;
      } else if (mode === 'claim-bad') {
        overlay.fillMat.color.set('#ff4b3a'); overlay.fillMat.opacity = 0.28;
        overlay.borderMat.color.set('#ff7a6a'); overlay.borderMat.opacity = 0.95;
        overlay.gridMat.color.set('#ffb0a8'); overlay.gridMat.opacity = 0.4;
      } else if (mode === 'build') {
        overlay.fillMat.color.set('#7ec8ff'); overlay.fillMat.opacity = 0.09;
        overlay.borderMat.color.set('#ffd25a'); overlay.borderMat.opacity = 0.95;
        overlay.gridMat.color.set('#ffffff'); overlay.gridMat.opacity = 0.28;
      } else if (mode === 'idle') {
        overlay.borderMat.color.set(c.gold); overlay.borderMat.opacity = 0.38;
      }
    }

    // Rótulo: sempre de frente para a câmera, com altura constante em tela.
    const lg = labelGroup.current;
    if (lg) {
      const show = bm.active && st.labelText !== '' && (mode === 'claim-ok' || mode === 'claim-bad' || mode === 'build');
      lg.visible = show;
      if (show) {
        const p = playerRef.current;
        if (mode !== 'build' && p) {
          lg.position.set(p.position.x, p.position.y + 3.2, p.position.z);
        } else {
          lg.position.set(st.labelX, st.labelY, st.labelZ);
        }
        lg.quaternion.copy(state.camera.quaternion);
        const lm = labelMesh.current;
        const mat = labelMat.current;
        const key = `${st.labelText}|${st.labelColor}`;
        if (lm && mat && (lm.userData['key'] as string | undefined) !== key) {
          lm.userData['key'] = key;
          const tex = labelTexture(st.labelText, st.labelColor || '#ffe3b0');
          mat.map = tex.texture;
          mat.needsUpdate = true;
          lm.userData['aspect'] = tex.aspect;
        }
        if (lm) {
          const dist = state.camera.position.distanceTo(lg.position);
          const hgt = THREE.MathUtils.clamp(38 / pixelsPerUnit(state.camera, state.size.height, dist), 0.3, 2.4);
          lm.scale.set(hgt * ((lm.userData['aspect'] as number | undefined) ?? initialLabel.aspect), hgt, 1);
        }
      }
    }
  });

  return (
    <>
      <primitive object={overlay.group} />
      <primitive object={ghost.mesh} />
      <group ref={labelGroup} visible={false}>
        <mesh ref={labelMesh} renderOrder={14} raycast={noRaycast}>
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial ref={labelMat} map={initialLabel.texture} transparent depthTest={false} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

/* ================================================================== *
 * Público
 * ================================================================== */
export function PlayerBase({
  c, playerRef, paused,
}: { c: Palette; playerRef: React.RefObject<THREE.Group | null>; paused: boolean }) {
  return (
    <>
      <BaseStructures c={c} />
      <BuildLayer c={c} playerRef={playerRef} paused={paused} />
    </>
  );
}
