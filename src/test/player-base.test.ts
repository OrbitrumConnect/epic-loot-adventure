import { beforeEach, describe, expect, it } from 'vitest';
import type { BuildPreview, GridCell, PlayerBaseState } from '../game/types/playerbase';
import { BASE_GRID } from '../game/types/playerbase';
import { createInventory } from '../game/systems/inventorySystem';
import {
  CLAIM_SIZE, FOUNDATION_MIN_WALLS, MIN_BASE_DISTANCE, TOWERS_MIN, WALLS_MIN,
} from '../game/data/base-pieces';
import {
  advanceStage, advanceStageFully, canOpenCityView, cellCenter, checkClaim, claimBase,
  claimLandQuality, coreCellFor, damagePiece, deriveStage, isEnclosed, placePieces, previewLine,
  squareCells, squareGap, worldToCell, type ClaimWorld,
} from '../game/systems/playerBaseSystem';
import { useGameStore } from '../game/state/game-store';

const NOW = 1_000;
const EMPTY: ClaimWorld = { bases: [] };
const OWNER = { kind: 'player' as const, id: 'p1', name: 'Teste' };
const RICH = createInventory([
  { itemId: 'wood', quantity: 99 },
  { itemId: 'stone', quantity: 99 },
]);

/** Primeiro quadrado livre varrendo o mapa — evita fixar coordenadas no olhômetro. */
function findFreeOrigin(world: ClaimWorld = EMPTY): GridCell {
  for (let gz = -40; gz <= 30; gz += 2) {
    for (let gx = -40; gx <= 30; gx += 2) {
      if (checkClaim({ gx, gz }, CLAIM_SIZE, world, NOW).ok) return { gx, gz };
    }
  }
  throw new Error('nenhum terreno livre');
}

function freshBase(): PlayerBaseState {
  const r = claimBase(findFreeOrigin(), CLAIM_SIZE, OWNER, EMPTY, NOW);
  if (!r.base) throw new Error(r.message);
  return r.base;
}

/** Metros do centro de uma célula, relativa ao canto da base. */
function at(base: PlayerBaseState, dx: number, dz: number) {
  return cellCenter({ gx: base.origin.gx + dx, gz: base.origin.gz + dz });
}

function build(base: PlayerBaseState, a: [number, number], b: [number, number], kind: 'wall' | 'door' | 'tower' | 'roof' = 'wall'): PlayerBaseState {
  const preview = previewLine(at(base, ...a), at(base, ...b), kind, base, RICH);
  const res = placePieces(base, preview, RICH, NOW);
  if (!res.ok) throw new Error(res.message);
  return res.base;
}

/** Anel completo do quadrado (28 células para size 8). */
function ring(base: PlayerBaseState, skip: [number, number][] = []): PlayerBaseState {
  const n = base.size - 1;
  let b = base;
  const skipSet = new Set(skip.map(s => s.join(',')));
  const edges: [number, number, number, number][] = [[0, 0, n, 0], [0, n, n, n], [0, 1, 0, n - 1], [n, 1, n, n - 1]];
  for (const [x1, z1, x2, z2] of edges) {
    const line = previewLine(at(b, x1, z1), at(b, x2, z2), 'wall', b, RICH);
    const cells = line.cells.filter(c => !skipSet.has(`${c.gx - b.origin.gx},${c.gz - b.origin.gz}`));
    const res = placePieces(b, { ...line, cells }, RICH, NOW);
    if (res.ok) b = res.base;
  }
  return b;
}

describe('playerBase · grade', () => {
  it('metros <-> células e centro', () => {
    expect(worldToCell({ x: 0.1, z: -0.1 })).toEqual({ gx: 0, gz: -1 });
    expect(cellCenter({ gx: 3, gz: -2 })).toEqual({ x: 7, z: -3 });
    expect(worldToCell(cellCenter({ gx: -7, gz: 12 }))).toEqual({ gx: -7, gz: 12 });
    expect(squareCells({ gx: 0, gz: 0 }, 3)).toHaveLength(9);
    expect(BASE_GRID).toBe(2);
  });
});

describe('playerBase · claim', () => {
  it('terreno livre é aceito e nasce em estágio bed com a cama no meio', () => {
    const origin = findFreeOrigin();
    const r = claimBase(origin, CLAIM_SIZE, OWNER, EMPTY, NOW);
    expect(r.ok).toBe(true);
    expect(r.base!.stage).toBe('bed');
    expect(r.base!.pieces).toHaveLength(1);
    expect(r.base!.pieces[0]!.cell).toEqual(coreCellFor(origin, CLAIM_SIZE));
    expect(r.base!.claimedAt).toBe(NOW);
  });

  it('recusa sobre acampamento', () => {
    // Posto dos Saqueadores em (23, 7): quadrado centrado nele.
    const c = checkClaim({ gx: 7, gz: 3 }, CLAIM_SIZE, EMPTY, NOW);
    expect(c.ok).toBe(false);
    expect(c.issues).toContain('sobre-acampamento');
    expect(claimBase({ gx: 7, gz: 3 }, CLAIM_SIZE, OWNER, EMPTY, NOW).base).toBeNull();
  });

  it('recusa sobre as ruínas', () => {
    // Ruínas em (7, -8): quadrado centrado nelas.
    const c = checkClaim({ gx: -1, gz: -8 }, CLAIM_SIZE, EMPTY, NOW);
    expect(c.issues).toContain('sobre-ruinas');
  });

  it('recusa na clareira do nascedouro', () => {
    const c = checkClaim({ gx: -4, gz: -4 }, CLAIM_SIZE, EMPTY, NOW);
    expect(c.issues).toContain('perto-do-nascedouro');
    expect(c.message.length).toBeGreaterThan(0);
  });

  it('recusa na água (lago)', () => {
    // Lago em (-60, -15) r 12 -> centro do quadrado em (-60, -16).
    const c = checkClaim({ gx: -34, gz: -12 }, CLAIM_SIZE, EMPTY, NOW);
    expect(c.issues).toContain('sobre-agua');
  });

  it('recusa fora do mapa', () => {
    const c = checkClaim({ gx: 44, gz: 0 }, CLAIM_SIZE, EMPTY, NOW);
    expect(c.issues).toContain('fora-do-mapa');
  });

  it('recusa terreno íngreme quando o mundo informa as alturas', () => {
    const origin = findFreeOrigin();
    const slope: ClaimWorld = { bases: [], heightAt: (x) => x * 0.5 };
    expect(checkClaim(origin, CLAIM_SIZE, slope, NOW).issues).toContain('terreno-ingreme');
    const flat: ClaimWorld = { bases: [], heightAt: () => 0 };
    expect(checkClaim(origin, CLAIM_SIZE, flat, NOW).ok).toBe(true);
  });

  it('duas bases a menos de MIN_BASE_DISTANCE são recusadas, a distância é real (diagonal)', () => {
    const base = freshBase();
    const world: ClaimWorld = { bases: [base] };
    const { gx, gz } = base.origin;
    // Colado ao lado.
    expect(checkClaim({ gx: gx + CLAIM_SIZE + 1, gz }, CLAIM_SIZE, world, NOW).issues).toContain('perto-de-outra-base');
    // Sobreposto.
    expect(checkClaim({ gx: gx + 2, gz: gz + 2 }, CLAIM_SIZE, world, NOW).issues).toContain('perto-de-outra-base');
    // Diagonal: 3 + 3 de folga em cada eixo = ~4,24 >= 4, passa só pela distância real.
    const diag: GridCell = { gx: gx + CLAIM_SIZE + 3, gz: gz + CLAIM_SIZE + 3 };
    expect(squareGap(base.origin, CLAIM_SIZE, diag, CLAIM_SIZE)).toBeGreaterThanOrEqual(MIN_BASE_DISTANCE);
    expect(checkClaim(diag, CLAIM_SIZE, world, NOW).issues).not.toContain('perto-de-outra-base');
    // Diagonal 2+2 = ~2,83 < 4: recusa, embora cada eixo isolado esteja a 2.
    const tight: GridCell = { gx: gx + CLAIM_SIZE + 2, gz: gz + CLAIM_SIZE + 2 };
    expect(checkClaim(tight, CLAIM_SIZE, world, NOW).issues).toContain('perto-de-outra-base');
  });

  it('qualidade da terra: junto de acampamento é nobre; longe de tudo é fronteira', () => {
    expect(claimLandQuality({ gx: 7, gz: -8 }, CLAIM_SIZE)).toBe('nobre');
    expect(claimLandQuality({ gx: 30, gz: 30 }, CLAIM_SIZE)).toBe('fronteira');
  });
});

describe('playerBase · construção', () => {
  let base: PlayerBaseState;
  beforeEach(() => { base = freshBase(); });

  it('o muro estica em linha reta presa à grade e soma o custo', () => {
    const p = previewLine(at(base, 0, 0), at(base, 4, 1), 'wall', base, RICH);
    expect(p.cells).toHaveLength(5);
    expect(p.cells.every(c => c.gz === base.origin.gz)).toBe(true);
    expect(p.cost).toEqual([{ itemId: 'wood', quantity: 10 }]);
    expect(p.affordable).toBe(true);
  });

  it('recusa células fora do claim e já ocupadas, e não cobra por elas', () => {
    const out = previewLine(at(base, 6, 0), at(base, 10, 0), 'wall', base, RICH);
    expect(out.cells).toHaveLength(2);
    expect(out.blocked).toHaveLength(3);
    const core = base.pieces[0]!.cell;
    const over = previewLine(cellCenter({ gx: core.gx - 1, gz: core.gz }), cellCenter({ gx: core.gx + 1, gz: core.gz }), 'wall', base, RICH);
    expect(over.blocked.map(b => b.cell)).toContainEqual(core);
    expect(over.cost).toEqual([{ itemId: 'wood', quantity: 4 }]);
  });

  it('sem material não é bancável e placePieces não muda nada', () => {
    const poor = createInventory([{ itemId: 'wood', quantity: 1 }]);
    const p = previewLine(at(base, 0, 0), at(base, 4, 0), 'wall', base, poor);
    expect(p.affordable).toBe(false);
    const r = placePieces(base, p, poor, NOW);
    expect(r.ok).toBe(false);
    expect(r.base).toBe(base);
  });

  it('placePieces cobra o material e põe as peças com HP cheio', () => {
    const p = previewLine(at(base, 0, 0), at(base, 2, 0), 'wall', base, RICH);
    const r = placePieces(base, p, RICH, NOW);
    expect(r.ok).toBe(true);
    expect(r.base.pieces.filter(x => x.kind === 'wall')).toHaveLength(3);
    expect(r.placed[0]!.hp).toBe(r.placed[0]!.maxHp);
    const woodBefore = RICH.slots.filter(s => s.itemId === 'wood').reduce((n, s) => n + s.quantity, 0);
    const woodAfter = r.inventory.slots.filter(s => s.itemId === 'wood').reduce((n, s) => n + s.quantity, 0);
    expect(woodBefore - woodAfter).toBe(6);
  });
});

describe('playerBase · cerco', () => {
  it('anel completo fecha; com uma célula de brecha não fecha; a porta fecha', () => {
    const base = freshBase();
    expect(isEnclosed(base)).toBe(false);

    const closed = ring(base);
    expect(closed.pieces.filter(p => p.kind === 'wall')).toHaveLength(28);
    expect(closed.enclosed).toBe(true);
    expect(isEnclosed(closed)).toBe(true);

    const gap = ring(base, [[3, 0]]);
    expect(gap.pieces.filter(p => p.kind === 'wall')).toHaveLength(27);
    expect(gap.enclosed).toBe(false);

    const door = build(gap, [3, 0], [3, 0], 'door');
    expect(door.enclosed).toBe(true);
  });

  it('telhado não fecha o cerco', () => {
    const base = freshBase();
    const roofed = build(base, [0, 0], [7, 0], 'roof');
    expect(isEnclosed(roofed)).toBe(false);
  });
});

describe('playerBase · estágios', () => {
  it('nunca pulam, cada um exige a sua condição', () => {
    let base = freshBase();
    expect(base.stage).toBe('bed');
    expect(advanceStage(base)).toBe(base); // sem muros

    // Cerco inteiro de uma vez NÃO pula: advanceStage sobe um por chamada.
    const full = build(ring(base, [[3, 0]]), [3, 0], [3, 0], 'door');
    expect(full.stage).toBe('bed');
    expect(full.pieces.filter(p => p.kind === 'wall' || p.kind === 'door').length).toBeGreaterThanOrEqual(WALLS_MIN);

    const s1 = advanceStage(full);
    expect(s1.stage).toBe('foundation');
    const s2 = advanceStage(s1);
    expect(s2.stage).toBe('walls');
    // Sem torre: trava em walls, mesmo com o perímetro fechado.
    expect(advanceStage(s2)).toBe(s2);
    expect(advanceStageFully(full).stage).toBe('walls');

    const withTower = build(s2, [1, 1], [1, 1], 'tower');
    expect(withTower.pieces.filter(p => p.kind === 'tower')).toHaveLength(TOWERS_MIN);
    const s3 = advanceStage(withTower);
    expect(s3.stage).toBe('towers');
    const s4 = advanceStage(s3);
    expect(s4.stage).toBe('enclosed');
    const s5 = advanceStage(s4);
    expect(s5.stage).toBe('clash');
    expect(advanceStage(s5)).toBe(s5);
  });

  it('fundação pede a primeira fiada de muros', () => {
    let base = freshBase();
    base = build(base, [0, 0], [FOUNDATION_MIN_WALLS - 2, 0]);
    expect(advanceStage(base).stage).toBe('bed');
    base = build(base, [FOUNDATION_MIN_WALLS - 1, 0], [FOUNDATION_MIN_WALLS - 1, 0]);
    expect(advanceStage(base).stage).toBe('foundation');
  });

  it('cerco aberto (sem porta nem buraco fechado) não chega a enclosed', () => {
    const base = ring(freshBase(), [[3, 0]]);
    const withTower = build(base, [1, 1], [1, 1], 'tower');
    expect(advanceStageFully(withTower).stage).toBe('towers');
  });

  it('a vista de cidade só destrava em clash', () => {
    expect(canOpenCityView(null)).toBe(false);
    let base = freshBase();
    expect(canOpenCityView(base)).toBe(false);
    base = build(ring(base, [[3, 0]]), [3, 0], [3, 0], 'door');
    base = build(base, [1, 1], [1, 1], 'tower');
    for (const stage of ['foundation', 'walls', 'towers', 'enclosed'] as const) {
      base = advanceStage(base);
      expect(base.stage).toBe(stage);
      expect(canOpenCityView(base)).toBe(false);
    }
    base = advanceStage(base);
    expect(base.stage).toBe('clash');
    expect(canOpenCityView(base)).toBe(true);
  });
});

describe('playerBase · dano', () => {
  function clashBase(): PlayerBaseState {
    let base = build(ring(freshBase(), [[3, 0]]), [3, 0], [3, 0], 'door');
    base = build(base, [1, 1], [1, 1], 'tower');
    return advanceStageFully(base);
  }

  it('baixa HP, marca lastDamagedAt e não destrói antes de zerar', () => {
    const base = clashBase();
    const wall = base.pieces.find(p => p.kind === 'wall')!;
    const r = damagePiece(base, wall.id, 30, 5_000);
    expect(r.destroyed).toBe(false);
    expect(r.base.pieces.find(p => p.id === wall.id)!.hp).toBe(wall.hp - 30);
    expect(r.base.lastDamagedAt).toBe(5_000);
    expect(r.base.enclosed).toBe(true);
    expect(r.base.stage).toBe('clash');
  });

  it('destruir um muro reabre a base, mas a cidade continua acessível', () => {
    const base = clashBase();
    expect(base.stage).toBe('clash');
    // Meio de um lado (uma quina não abre: com vizinhança de 4 lados ela é redundante).
    const wall = base.pieces.find(p => p.kind === 'wall' && p.cell.gx === base.origin.gx + 4 && p.cell.gz === base.origin.gz)!;
    const r = damagePiece(base, wall.id, 9_999, 7_000);
    expect(r.destroyed).toBe(true);
    expect(r.reopened).toBe(true);
    expect(r.base.pieces.find(p => p.id === wall.id)).toBeUndefined();
    expect(r.base.enclosed).toBe(false);
    // Decisão: quem já chegou ao `clash` não perde a tela de gestão por um muro
    // quebrado. O buraco aparece em `enclosed`, não em perder acesso à UI.
    expect(r.base.stage).toBe('clash');
    expect(canOpenCityView(r.base)).toBe(true);
    // O estágio que as peças sustentam sozinhas caiu — é por aí que a UI avisa
    // que o perímetro está aberto.
    expect(deriveStage(r.base)).toBe('towers');
    // Consertar o buraco fecha de novo e a cidade volta.
    const fixed = advanceStageFully(build(r.base, [wall.cell.gx - r.base.origin.gx, wall.cell.gz - r.base.origin.gz], [wall.cell.gx - r.base.origin.gx, wall.cell.gz - r.base.origin.gz]));
    expect(fixed.stage).toBe('clash');
  });

  it('cama destruída = base perdida', () => {
    const base = clashBase();
    const core = base.pieces.find(p => p.kind === 'core')!;
    const r = damagePiece(base, core.id, 9_999, 1);
    expect(r.wiped).toBe(true);
    expect(r.base.stage).toBe('none');
  });

  it('peça inexistente ou dano zero não muda nada', () => {
    const base = clashBase();
    expect(damagePiece(base, 'nao-existe', 10, 1).base).toBe(base);
    expect(damagePiece(base, base.pieces[0]!.id, 0, 1).base).toBe(base);
  });
});

describe('playerBase · store', () => {
  beforeEach(() => {
    useGameStore.setState({ playerBase: null });
  });

  it('claim, construção, cidade trancada e ações existentes seguem de pé', () => {
    const s = useGameStore.getState();
    expect(s.playerBase).toBeNull();
    expect(s.canOpenCityView()).toBe(false);
    expect(s.base).toBeDefined();

    s.claimBase({ gx: -4, gz: -4 });
    expect(useGameStore.getState().playerBase).toBeNull();

    const origin = findFreeOrigin();
    useGameStore.getState().claimBase(origin);
    const pb = useGameStore.getState().playerBase!;
    expect(pb.stage).toBe('bed');
    expect(pb.owner.kind).toBe('player');

    const preview: BuildPreview = previewLine(
      cellCenter(pb.origin), cellCenter({ gx: pb.origin.gx + 3, gz: pb.origin.gz }),
      'wall', pb, useGameStore.getState().player.inventory,
    );
    const woodBefore = useGameStore.getState().getItemCount('wood');
    useGameStore.getState().placeBasePieces(preview);
    const after = useGameStore.getState();
    expect(after.playerBase!.pieces.filter(p => p.kind === 'wall')).toHaveLength(4);
    expect(after.getItemCount('wood')).toBe(woodBefore - 8);
    expect(after.playerBase!.stage).toBe('foundation');
    expect(after.canOpenCityView()).toBe(false);

    const wall = after.playerBase!.pieces.find(p => p.kind === 'wall')!;
    after.damageBasePiece(wall.id, 10);
    expect(useGameStore.getState().playerBase!.lastDamagedAt).not.toBeNull();
    useGameStore.getState().advanceBaseStage();
  });
});
