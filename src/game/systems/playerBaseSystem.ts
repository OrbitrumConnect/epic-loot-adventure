import type { InventoryState, Position } from '../types';
import {
  BASE_GRID,
  type BasePiece, type BasePieceKind, type BaseStage, type BuildPreview, type ClaimCheck,
  type ClaimIssue, type GridCell, type PlayerBaseState,
} from '../types/playerbase';
import {
  BASE_PIECES, CLAIM_SIZE, CLAIM_WATER_MARGIN, FOUNDATION_MIN_WALLS, MAX_CLAIM_RELIEF,
  MIN_BASE_DISTANCE, TOWERS_MIN, WALLS_MIN, pieceCost, pieceMaxHp, type BaseCost,
} from '../data/base-pieces';
import {
  CAMPS, CAMP_PLACEMENTS, PLAYER_SPAWN, findPlacementProblems, isOnWater, type PlacementProblemKind,
} from '../data/camps';
import { getItemCount, removeItem } from './inventorySystem';

// ---------------------------------------------------------------------------
// Grade (UM lugar só: mundo 3D e HUD importam daqui)
// ---------------------------------------------------------------------------

/** Metros -> quadrícula que contém o ponto. */
export function worldToCell(p: Position): GridCell {
  return { gx: Math.floor(p.x / BASE_GRID), gz: Math.floor(p.z / BASE_GRID) };
}

/** Centro da quadrícula, em metros. */
export function cellCenter(cell: GridCell): Position {
  return { x: (cell.gx + 0.5) * BASE_GRID, z: (cell.gz + 0.5) * BASE_GRID };
}

/** Encaixa um ponto em metros no centro da quadrícula mais próxima (onde ele cai). */
export function snapToGrid(p: Position): Position {
  return cellCenter(worldToCell(p));
}

export function cellKey(cell: GridCell): string {
  return `${cell.gx},${cell.gz}`;
}

export function sameCell(a: GridCell, b: GridCell): boolean {
  return a.gx === b.gx && a.gz === b.gz;
}

/** Todas as células do quadrado, linha a linha (gz externo, gx interno). */
export function squareCells(origin: GridCell, size: number): GridCell[] {
  const cells: GridCell[] = [];
  for (let dz = 0; dz < size; dz++) {
    for (let dx = 0; dx < size; dx++) cells.push({ gx: origin.gx + dx, gz: origin.gz + dz });
  }
  return cells;
}

export function cellInSquare(cell: GridCell, origin: GridCell, size: number): boolean {
  return cell.gx >= origin.gx && cell.gx < origin.gx + size
    && cell.gz >= origin.gz && cell.gz < origin.gz + size;
}

/** Centro do quadrado do claim, em metros. */
export function squareCenter(origin: GridCell, size: number): Position {
  return {
    x: (origin.gx + size / 2) * BASE_GRID,
    z: (origin.gz + size / 2) * BASE_GRID,
  };
}

/** Célula do núcleo (cama): o meio do claim. */
export function coreCellFor(origin: GridCell, size: number): GridCell {
  return { gx: origin.gx + Math.floor(size / 2), gz: origin.gz + Math.floor(size / 2) };
}

// ---------------------------------------------------------------------------
// Claim
// ---------------------------------------------------------------------------

export type ClaimWorld = {
  /** Bases de OUTROS donos já no mundo. */
  bases: PlayerBaseState[];
  /**
   * Altura do terreno em (x, z). O mundo 3D passa `terrainHeight` (vive em
   * `components/`, a camada pura não importa de lá). Sem ela, o relevo não é checado.
   */
  heightAt?: ((x: number, z: number) => number) | undefined;
};

export type LandQuality = 'nobre' | 'comum' | 'fronteira';

const ISSUE_MESSAGES: Record<ClaimIssue, string> = {
  'fora-do-mapa': 'O terreno sai do mapa.',
  'perto-do-nascedouro': 'Perto demais do nascedouro.',
  'sobre-ruinas': 'Perto demais das ruínas.',
  'sobre-acampamento': 'Encosta em um acampamento.',
  'sobre-agua': 'Pega água (lago ou córrego).',
  'perto-de-outra-base': 'Perto demais de outra base.',
  'terreno-ingreme': 'Terreno íngreme demais.',
};

const PROBLEM_TO_ISSUE: Partial<Record<PlacementProblemKind, ClaimIssue>> = {
  'fora-do-mapa': 'fora-do-mapa',
  'perto-do-nascedouro': 'perto-do-nascedouro',
  'sobre-ruinas': 'sobre-ruinas',
  'sobre-acampamento': 'sobre-acampamento',
};

/** Distância real (euclidiana) entre as bordas de dois quadrados, em quadrículas. */
export function squareGap(aOrigin: GridCell, aSize: number, bOrigin: GridCell, bSize: number): number {
  const gapX = Math.max(aOrigin.gx - (bOrigin.gx + bSize), bOrigin.gx - (aOrigin.gx + aSize), 0);
  const gapZ = Math.max(aOrigin.gz - (bOrigin.gz + bSize), bOrigin.gz - (aOrigin.gz + aSize), 0);
  return Math.hypot(gapX, gapZ);
}

/**
 * Valida um claim. Mapa, nascedouro, ruínas e acampamentos passam pelo MESMO
 * `findPlacementProblems` dos acampamentos (o claim entra como pegada circular
 * que circunscreve o quadrado). Aqui só entram o que o acampamento não tem:
 * água, distância entre bases e relevo.
 */
export function checkClaim(
  origin: GridCell,
  size: number,
  world: ClaimWorld,
  _now: number,
): ClaimCheck {
  const issues: ClaimIssue[] = [];
  const add = (issue: ClaimIssue) => {
    if (!issues.includes(issue)) issues.push(issue);
  };

  const center = squareCenter(origin, size);
  const radius = (size * BASE_GRID / 2) * Math.SQRT2;
  for (const problem of findPlacementProblems(CAMP_PLACEMENTS, [{ id: 'claim', position: center, radius }])) {
    const issue = PROBLEM_TO_ISSUE[problem.kind];
    if (issue) add(issue);
  }

  const waterMargin = CLAIM_WATER_MARGIN + BASE_GRID * Math.SQRT1_2;
  if (squareCells(origin, size).some(c => {
    const p = cellCenter(c);
    return isOnWater(p.x, p.z, waterMargin);
  })) add('sobre-agua');

  if (world.bases.some(b => squareGap(origin, size, b.origin, b.size) < MIN_BASE_DISTANCE)) {
    add('perto-de-outra-base');
  }

  if (world.heightAt) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let dz = 0; dz <= size; dz++) {
      for (let dx = 0; dx <= size; dx++) {
        const h = world.heightAt((origin.gx + dx) * BASE_GRID, (origin.gz + dz) * BASE_GRID);
        if (h < lo) lo = h;
        if (h > hi) hi = h;
      }
    }
    if (hi - lo > MAX_CLAIM_RELIEF) add('terreno-ingreme');
  }

  return {
    ok: issues.length === 0,
    issues,
    message: issues.length === 0 ? 'Terreno livre para reivindicar.' : ISSUE_MESSAGES[issues[0]!],
    origin,
    size,
  };
}

/**
 * Qualidade da terra: escassez vem daqui, não de um teto. Perto de acampamento
 * ou do nascedouro é terra nobre (disputada); longe de tudo é fronteira, sempre
 * aberta para quem sofreu wipe reconstruir.
 */
export function claimLandQuality(origin: GridCell, size: number): LandQuality {
  const c = squareCenter(origin, size);
  const dist = (a: Position, b: Position) => Math.hypot(a.x - b.x, a.z - b.z);
  const spawnDist = dist(c, PLAYER_SPAWN);
  let campEdge = Infinity;
  for (const placement of CAMP_PLACEMENTS) {
    const def = CAMPS[placement.defId];
    if (!def) continue;
    campEdge = Math.min(campEdge, dist(c, placement.position) - def.radius);
  }
  if (campEdge < 30 || spawnDist < 45) return 'nobre';
  if (campEdge > 45 && spawnDist > 60) return 'fronteira';
  return 'comum';
}

export type ClaimResult = {
  ok: boolean;
  check: ClaimCheck;
  base: PlayerBaseState | null;
  message: string;
};

/** Cria a base em estágio `bed`, com a cama no meio do quadrado. */
export function claimBase(
  origin: GridCell,
  size: number,
  owner: PlayerBaseState['owner'],
  world: ClaimWorld,
  now: number,
): ClaimResult {
  const check = checkClaim(origin, size, world, now);
  if (!check.ok) return { ok: false, check, base: null, message: check.message };

  const id = `base_${owner.id}`;
  const coreCell = coreCellFor(origin, size);
  const core: BasePiece = {
    id: pieceId(id, 'core', coreCell),
    kind: 'core',
    cell: coreCell,
    rotation: 0,
    hp: pieceMaxHp('core', 1),
    maxHp: pieceMaxHp('core', 1),
    tier: 1,
  };
  const base: PlayerBaseState = {
    id,
    owner,
    worldPosition: squareCenter(origin, size),
    origin,
    size,
    stage: 'bed',
    pieces: [core],
    enclosed: false,
    claimedAt: now,
    lastDamagedAt: null,
  };
  return { ok: true, check, base, message: 'Terreno reivindicado. Sua cama está no lugar.' };
}

/** Tamanho padrão do claim, para quem não quiser importar de `data/`. */
export const DEFAULT_CLAIM_SIZE = CLAIM_SIZE;

function pieceId(baseId: string, kind: BasePieceKind, cell: GridCell): string {
  return `${baseId}_${kind}_${cell.gx}_${cell.gz}`;
}

// ---------------------------------------------------------------------------
// Construção
// ---------------------------------------------------------------------------

function mergeCost(into: Map<string, number>, cost: BaseCost[]): void {
  for (const c of cost) into.set(c.itemId, (into.get(c.itemId) ?? 0) + c.quantity);
}

function costToList(m: Map<string, number>): BaseCost[] {
  return [...m.entries()].map(([itemId, quantity]) => ({ itemId, quantity }));
}

function canPay(inventory: InventoryState, cost: BaseCost[]): boolean {
  return cost.every(c => getItemCount(inventory, c.itemId) >= c.quantity);
}

/** Células de uma reta presa à grade, do ponto `from` ao `to` (eixo dominante vence). */
export function lineCells(from: Position, to: Position): GridCell[] {
  const a = worldToCell(from);
  const b = worldToCell(to);
  const dx = b.gx - a.gx;
  const dz = b.gz - a.gz;
  const cells: GridCell[] = [];
  if (Math.abs(dx) >= Math.abs(dz)) {
    const step = dx >= 0 ? 1 : -1;
    for (let i = 0; i <= Math.abs(dx); i++) cells.push({ gx: a.gx + i * step, gz: a.gz });
  } else {
    const step = dz >= 0 ? 1 : -1;
    for (let i = 0; i <= Math.abs(dz); i++) cells.push({ gx: a.gx, gz: a.gz + i * step });
  }
  return cells;
}

/**
 * Prévia do muro esticado. `from` e `to` em metros (posição do mouse no chão);
 * a linha é reta e presa à grade. Células fora do claim ou ocupadas vão para
 * `blocked`; o custo soma só o que seria de fato construído.
 */
export function previewLine(
  from: Position,
  to: Position,
  kind: BasePieceKind,
  state: PlayerBaseState,
  inventory: InventoryState,
  tier: 1 | 2 | 3 = 1,
): BuildPreview {
  const taken = new Set(state.pieces.map(p => cellKey(p.cell)));
  const cells: GridCell[] = [];
  const blocked: BuildPreview['blocked'] = [];
  const total = new Map<string, number>();

  if (kind === 'core') {
    // A cama nasce com o claim; não se constrói outra.
    for (const cell of lineCells(from, to)) blocked.push({ cell, reason: 'A cama já foi colocada.' });
    return { cells, kind, cost: [], blocked, affordable: false };
  }

  for (const cell of lineCells(from, to)) {
    if (!cellInSquare(cell, state.origin, state.size)) {
      blocked.push({ cell, reason: 'Fora do terreno reivindicado.' });
    } else if (taken.has(cellKey(cell))) {
      blocked.push({ cell, reason: 'Já tem uma peça aqui.' });
    } else {
      cells.push(cell);
      mergeCost(total, pieceCost(kind, tier));
    }
  }

  const cost = costToList(total);
  return { cells, kind, cost, blocked, affordable: cells.length > 0 && canPay(inventory, cost) };
}

export type PlaceResult = {
  ok: boolean;
  base: PlayerBaseState;
  inventory: InventoryState;
  placed: BasePiece[];
  message: string;
};

/** Confirma a prévia: cobra o material e põe as peças. Reconfere tudo (não confia na prévia). */
export function placePieces(
  state: PlayerBaseState,
  preview: BuildPreview,
  inventory: InventoryState,
  _now: number,
  tier: 1 | 2 | 3 = 1,
): PlaceResult {
  const fail = (message: string): PlaceResult => ({ ok: false, base: state, inventory, placed: [], message });
  if (preview.kind === 'core') return fail('A cama já foi colocada.');

  const taken = new Set(state.pieces.map(p => cellKey(p.cell)));
  const cells = preview.cells.filter(c => cellInSquare(c, state.origin, state.size) && !taken.has(cellKey(c)));
  if (cells.length === 0) return fail('Nada para construir aí.');

  const total = new Map<string, number>();
  for (let i = 0; i < cells.length; i++) mergeCost(total, pieceCost(preview.kind, tier));
  const cost = costToList(total);
  if (!canPay(inventory, cost)) return fail('Material insuficiente.');

  let inv = inventory;
  for (const c of cost) inv = removeItem(inv, c.itemId, c.quantity);

  const vertical = cells.length > 1 && cells[0]!.gx === cells[1]!.gx;
  const placed: BasePiece[] = cells.map(cell => ({
    id: pieceId(state.id, preview.kind, cell),
    kind: preview.kind,
    cell,
    rotation: vertical ? 90 : 0,
    hp: pieceMaxHp(preview.kind, tier),
    maxHp: pieceMaxHp(preview.kind, tier),
    tier,
  }));

  const next: PlayerBaseState = { ...state, pieces: [...state.pieces, ...placed] };
  const base = { ...next, enclosed: isEnclosed(next) };
  return {
    ok: true,
    base,
    inventory: inv,
    placed,
    message: `${BASE_PIECES[preview.kind].name}: ${placed.length} ${placed.length === 1 ? 'peça' : 'peças'}.`,
  };
}

// ---------------------------------------------------------------------------
// Cerco fechado
// ---------------------------------------------------------------------------

/**
 * Enchente a partir de FORA do claim (anel de uma célula em volta, que nunca
 * tem peça). Peças sólidas (muro, porta, torre) barram; telhado e cama não.
 * Se a enchente alcança a cama, há brecha. Vizinhança de 4 lados: dois muros
 * que só se tocam na quina contam como fechados.
 */
export function isEnclosed(base: PlayerBaseState): boolean {
  const core = base.pieces.find(p => p.kind === 'core');
  if (!core) return false;

  const solid = new Set(base.pieces.filter(p => BASE_PIECES[p.kind].solid).map(p => cellKey(p.cell)));
  const minX = base.origin.gx - 1;
  const minZ = base.origin.gz - 1;
  const maxX = base.origin.gx + base.size;
  const maxZ = base.origin.gz + base.size;

  const seen = new Set<string>();
  const stack: GridCell[] = [{ gx: minX, gz: minZ }];
  seen.add(cellKey(stack[0]!));
  const target = cellKey(core.cell);

  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cellKey(cur) === target) return false;
    const neighbours: GridCell[] = [
      { gx: cur.gx + 1, gz: cur.gz }, { gx: cur.gx - 1, gz: cur.gz },
      { gx: cur.gx, gz: cur.gz + 1 }, { gx: cur.gx, gz: cur.gz - 1 },
    ];
    for (const n of neighbours) {
      if (n.gx < minX || n.gx > maxX || n.gz < minZ || n.gz > maxZ) continue;
      const key = cellKey(n);
      if (seen.has(key) || solid.has(key)) continue;
      seen.add(key);
      stack.push(n);
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Estágios
// ---------------------------------------------------------------------------

export const STAGE_ORDER: BaseStage[] = ['none', 'bed', 'foundation', 'walls', 'towers', 'enclosed', 'clash'];

function count(base: PlayerBaseState, ...kinds: BasePieceKind[]): number {
  return base.pieces.filter(p => kinds.includes(p.kind)).length;
}

/** Condição para ENTRAR em `stage` (já estando no anterior). */
function meets(base: PlayerBaseState, stage: BaseStage): boolean {
  switch (stage) {
    case 'none': return true;
    case 'bed': return count(base, 'core') >= 1;
    case 'foundation': return count(base, 'wall', 'door') >= FOUNDATION_MIN_WALLS;
    case 'walls': return count(base, 'wall', 'door') >= WALLS_MIN;
    case 'towers': return count(base, 'tower') >= TOWERS_MIN;
    case 'enclosed': return isEnclosed(base);
    case 'clash': return isEnclosed(base) && count(base, 'door') >= 1;
  }
}

export type StageProgress = {
  current: BaseStage;
  next: BaseStage | null;
  met: boolean;
  /** Frase para a UI dizer o que falta. */
  requirement: string;
};

const STAGE_REQUIREMENTS: Record<BaseStage, string> = {
  none: 'Reivindique um terreno.',
  bed: 'Coloque a cama.',
  foundation: `Erga ${FOUNDATION_MIN_WALLS} peças de muro (a primeira fiada).`,
  walls: `Erga ${WALLS_MIN} peças de muro ou porta.`,
  towers: `Construa ${TOWERS_MIN} torre.`,
  enclosed: 'Feche o perímetro, sem nenhuma brecha.',
  clash: 'Perímetro fechado e com ao menos uma porta.',
};

export function stageProgress(base: PlayerBaseState): StageProgress {
  const idx = STAGE_ORDER.indexOf(base.stage);
  const next = STAGE_ORDER[idx + 1] ?? null;
  return {
    current: base.stage,
    next,
    met: next !== null && meets(base, next),
    requirement: next ? STAGE_REQUIREMENTS[next] : 'Base completa.',
  };
}

/** Sobe UM estágio se a condição real do próximo estiver cumprida. Nunca pula. */
export function advanceStage(base: PlayerBaseState): PlayerBaseState {
  const p = stageProgress(base);
  if (!p.next || !p.met) return base;
  return { ...base, stage: p.next, enclosed: isEnclosed(base) };
}

/** Sobe quantos estágios as condições permitirem, um de cada vez. */
export function advanceStageFully(base: PlayerBaseState): PlayerBaseState {
  let cur = base;
  for (;;) {
    const next = advanceStage(cur);
    if (next === cur) return cur;
    cur = next;
  }
}

/** Maior estágio cujas condições valem hoje, subindo em ordem a partir de `bed`. */
export function deriveStage(base: PlayerBaseState): BaseStage {
  let stage: BaseStage = 'none';
  for (const s of STAGE_ORDER.slice(1)) {
    if (!meets(base, s)) break;
    stage = s;
  }
  return stage;
}

/** A vista de cidade (isométrica) só abre com o perímetro fechado: `clash`. */
/**
 * Trava a vista de cidade atrás do perímetro fechado.
 *
 * É a mudança de produto mais forte da Fase 3: antes dela a cidade abria desde
 * o primeiro minuto. A direção selada do Pedro é "perímetro fechado → Clash
 * desbloqueia", e é isso que dá sentido a erguer o muro. Mas se ele preferir a
 * cidade aberta como antes, basta virar esta constante para `false` — nada mais
 * precisa mudar.
 */
export const REQUIRE_BASE_FOR_CITY = true;

export function canOpenCityView(base: PlayerBaseState | null): boolean {
  if (!REQUIRE_BASE_FOR_CITY) return true;
  return base !== null && base.stage === 'clash';
}

// ---------------------------------------------------------------------------
// Dano
// ---------------------------------------------------------------------------

export type DamageResult = {
  base: PlayerBaseState;
  destroyed: boolean;
  /** O perímetro estava fechado e agora não está. */
  reopened: boolean;
  /** A cama caiu: a base inteira se perde e o terreno volta a ficar livre. */
  wiped: boolean;
};

/**
 * Tira HP de uma peça; a 0, ela some e o teste de cerco roda de novo (um buraco
 * reabre a base e o estágio recua ao que as condições ainda sustentam).
 */
export function damagePiece(
  base: PlayerBaseState,
  pieceIdToHit: string,
  amount: number,
  now: number,
): DamageResult {
  const piece = base.pieces.find(p => p.id === pieceIdToHit);
  const unchanged: DamageResult = { base, destroyed: false, reopened: false, wiped: false };
  if (!piece || amount <= 0) return unchanged;

  const hp = Math.max(0, piece.hp - amount);
  const destroyed = hp === 0;
  const pieces = destroyed
    ? base.pieces.filter(p => p.id !== piece.id)
    : base.pieces.map(p => (p.id === piece.id ? { ...p, hp } : p));

  const hit: PlayerBaseState = { ...base, pieces, lastDamagedAt: now };
  const enclosed = isEnclosed(hit);
  const wiped = destroyed && piece.kind === 'core';

  // Quem já chegou ao `clash` não perde a vista de cidade por um muro quebrado:
  // trancar a tela de gestão não é consequência interessante, é só chato. A
  // consequência de ficar aberto é o inimigo entrar — e `enclosed` continua
  // falso para quem quiser reagir a isso. Abaixo de `clash`, o estágio recua
  // normalmente, porque ali ele ainda descreve a obra em andamento.
  const derived = deriveStage(hit);
  const regressed = STAGE_ORDER.indexOf(derived) < STAGE_ORDER.indexOf(base.stage) ? derived : base.stage;
  const stage = base.stage === 'clash' ? 'clash' : regressed;

  return {
    base: { ...hit, enclosed, stage: wiped ? 'none' : stage },
    destroyed,
    reopened: base.enclosed && !enclosed,
    wiped,
  };
}
