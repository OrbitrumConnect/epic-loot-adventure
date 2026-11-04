import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  BASE_MOVE_AFTER_HIT_MS, BASE_MOVE_COOLDOWN_MS, cellInSquare, checkClaim, claimBase, moveBaseProblem, moveBaseTo,
} from '@/game/systems/playerBaseSystem';
import { CLAIM_SIZE } from '@/game/data/base-pieces';
import { useGameStore } from '@/game/state/game-store';
import { createLocalSave, parseLocalSave } from '@/game/systems/persistenceSystem';
import type { GridCell, PlayerBaseState } from '@/game/types/playerbase';

/* Pedro 03/11: "preciso de um jeito de mover a base de local também! uma opção seria melhor, pode ser dentro do Minha
   base! move no nível atual que está para outro local". */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const NOW = 1_700_000_000_000;
const OWNER = { kind: 'player' as const, id: 'p', name: 'Teste' };
const free = (skip?: GridCell): GridCell[] => {
  const out: GridCell[] = [];
  for (let gz = -40; gz <= 30; gz += 2) for (let gx = -40; gx <= 30; gx += 2) {
    if (skip && Math.abs(gx - skip.gx) < CLAIM_SIZE + 2 && Math.abs(gz - skip.gz) < CLAIM_SIZE + 2) continue;
    if (checkClaim({ gx, gz }, CLAIM_SIZE, { bases: [] }, NOW).ok) out.push({ gx, gz });
  }
  return out;
};
/** base com várias peças (núcleo + muros/torre de níveis diferentes, uma ferida) */
function bigBase(origin: GridCell): PlayerBaseState {
  const b = claimBase(origin, CLAIM_SIZE, OWNER, { bases: [] }, NOW).base!;
  const extra = [
    { kind: 'wall' as const, dx: 1, dz: 1, tier: 2 as const, hp: 300, maxHp: 500 },
    { kind: 'wall' as const, dx: 2, dz: 1, tier: 3 as const, hp: 900, maxHp: 900 },
    { kind: 'tower' as const, dx: 1, dz: 2, tier: 2 as const, hp: 700, maxHp: 800, level: 7 },
  ].map((p) => ({ id: `${b.id}_${p.kind}_${origin.gx + p.dx}_${origin.gz + p.dz}`, kind: p.kind, cell: { gx: origin.gx + p.dx, gz: origin.gz + p.dz }, rotation: 0 as const, hp: p.hp, maxHp: p.maxHp, tier: p.tier, ...(p.level ? { level: p.level } : {}) }));
  return { ...b, pieces: [...b.pieces, ...extra], stage: 'walls' };
}

describe('mover a base (tudo no nível de agora)', () => {
  it('a base inteira anda junto: mesma vida/material/nível/rotação, ids novos e únicos, tudo dentro do quadrado novo', () => {
    const [a, b] = [free()[0]!, free(free()[0]!)[0]!];
    const base = bigBase(a);
    const moved = moveBaseTo(base, b, NOW + 5);
    expect(moved.origin).toEqual(b);
    expect(moved.movedAt).toBe(NOW + 5);
    expect(moved.pieces).toHaveLength(base.pieces.length);
    expect(new Set(moved.pieces.map((p) => p.id)).size).toBe(moved.pieces.length);
    for (let i = 0; i < base.pieces.length; i++) {
      const o = base.pieces[i]!, n = moved.pieces[i]!;
      expect({ ...n, id: '', cell: null }).toEqual({ ...o, id: '', cell: null }); // só posição e id mudam
      expect(n.cell).toEqual({ gx: o.cell.gx + b.gx - a.gx, gz: o.cell.gz + b.gz - a.gz });
      expect(cellInSquare(n.cell, moved.origin, moved.size)).toBe(true);
    }
    expect(moved.stage).toBe(base.stage); expect(moved.enclosed).toBe(base.enclosed); expect(moved.id).toBe(base.id);
  });

  it('o save aceita a base movida (ids únicos, peças dentro do quadrado) e guarda quando moveu', () => {
    const st = useGameStore.getState();
    const [a, b] = [free()[0]!, free(free()[0]!)[0]!];
    const moved = moveBaseTo(bigBase(a), b, NOW);
    const parsed = parseLocalSave(JSON.stringify(createLocalSave({ ...st, playerBase: moved })))!;
    expect(parsed).not.toBeNull();
    expect(parsed.playerBase!.origin).toEqual(b);
    expect(parsed.playerBase!.movedAt).toBe(NOW);
    const legacy = parseLocalSave(JSON.stringify(createLocalSave({ ...st, playerBase: bigBase(a) })))!;
    expect(legacy.playerBase!.movedAt).toBeUndefined(); // save antigo segue valendo
  });

  it('não move: no meio da horda, logo depois de levar dano (1 min), menos de 10 min depois de mover', () => {
    const base = bigBase(free()[0]!);
    expect(moveBaseProblem(null, NOW, false)).toMatch(/não tem base/);
    expect(moveBaseProblem(base, NOW, true)).toMatch(/horda/);
    expect(moveBaseProblem({ ...base, lastDamagedAt: NOW - 10_000 }, NOW, false)).toMatch(/atacada/);
    expect(moveBaseProblem({ ...base, lastDamagedAt: NOW - BASE_MOVE_AFTER_HIT_MS - 1 }, NOW, false)).toBeNull();
    expect(moveBaseProblem({ ...base, movedAt: NOW - 60_000 }, NOW, false)).toMatch(/de novo em 9 min/);
    expect(moveBaseProblem({ ...base, movedAt: NOW - BASE_MOVE_COOLDOWN_MS - 1 }, NOW, false)).toBeNull();
    expect(moveBaseProblem(base, NOW, false)).toBeNull();
  });

  it('na store: move pra um lugar livre (mesmas regras de reivindicar) e recusa lugar ruim / em horda', () => {
    const [a, b] = [free()[0]!, free(free()[0]!)[0]!];
    const st = useGameStore.getState();
    useGameStore.setState({ playerBase: bigBase(a), wave: { ...st.wave, phase: 'peace' } });
    expect(useGameStore.getState().moveBase({ gx: -4, gz: -4 })).toBe(false); // nascedouro: o claim recusa
    expect(useGameStore.getState().playerBase!.origin).toEqual(a);
    expect(useGameStore.getState().moveBase(b)).toBe(true);
    expect(useGameStore.getState().playerBase!.origin).toEqual(b);
    expect(useGameStore.getState().ui.message).toMatch(/Base movida/);
    expect(useGameStore.getState().moveBase(a)).toBe(false); // espera de 10 min
    useGameStore.setState({ playerBase: null });
  });

  it('ligado: botão em "Minha base", quadrado seguindo o jogador, clique/Enter move, N cancela', () => {
    const panel = read('src/components/hud/base-panel.tsx');
    expect(panel).toMatch(/onClick=\{\(\) => \{ startBaseMove\(\); if \(inCity\) setMode\('world'\); onClose\(\); \}\}>/);
    expect(panel).toMatch(/const moveProblem = moveBaseProblem\(base, now, wavePhase === 'combat'\);/);
    const bm = read('src/components/world/build-mode.ts');
    expect(bm).toMatch(/: \{ active: false, moving: false,/); // sair do modo cancela
    const pb = read('src/components/world/player-base.tsx');
    expect(pb).toMatch(/if \(bm\.active && \(!base \|\| bm\.moving\)\) \{/);
    expect(pb).toMatch(/if \(gs\.moveBase\(chk\.origin, terrainHeight\)\) setBuildActive\(false\);/);
    expect(pb).toMatch(/if \(!useGameStore\.getState\(\)\.playerBase \|\| getBuildMode\(\)\.moving\) \{ doClaim\(\); return; \}/);
    expect(read('src/components/hud/base-picker.tsx')).toMatch(/🏠 Movendo a base: ande até o lugar novo/); // o cartão explica o passo
  });
});
