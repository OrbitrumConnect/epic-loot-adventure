import { describe, expect, it } from 'vitest';
import { useGameStore } from '../game/state/game-store';
import { createInventory } from '../game/systems/inventorySystem';
import { checkClaim } from '../game/systems/playerBaseSystem';
import { CLAIM_SIZE } from '../game/data/base-pieces';
import type { GridCell } from '../game/types/playerbase';

function freeOrigin(): GridCell {
  for (let gz = -40; gz <= 30; gz += 2) {
    for (let gx = -40; gx <= 30; gx += 2) {
      if (checkClaim({ gx, gz }, CLAIM_SIZE, { bases: [] }, 1_000).ok) return { gx, gz };
    }
  }
  throw new Error('nenhum terreno livre');
}

describe('base destruída (Pedro 21/10): só −5 níveis e materiais de construção', () => {
  it('perde 5 níveis + madeira/pedra/ferro; MANTÉM armas, munição, flecha, poção e drops', () => {
    useGameStore.getState().claimBase(freeOrigin());
    const pb = useGameStore.getState().playerBase!;
    const core = pb.pieces.find(p => p.kind === 'core')!;
    useGameStore.setState(s => ({
      player: {
        ...s.player, level: 12,
        inventory: createInventory([
          { itemId: 'wood', quantity: 300 }, { itemId: 'stone', quantity: 200 },
          { itemId: 'iron_ore', quantity: 40 }, { itemId: 'bow', quantity: 1 },
          { itemId: 'ammo', quantity: 1500 }, { itemId: 'arrow', quantity: 900 },
          { itemId: 'health_potion', quantity: 120 }, { itemId: 'gold_ore', quantity: 3 },
        ]),
      },
    }));

    useGameStore.getState().damageBasePiece(core.id, 1e9);

    const s = useGameStore.getState();
    expect(s.playerBase).toBeNull();
    expect(s.player.level).toBe(7);
    expect(s.getItemCount('wood')).toBe(0);
    expect(s.getItemCount('stone')).toBe(0);
    expect(s.getItemCount('iron_ore')).toBe(0);
    expect(s.getItemCount('bow')).toBe(1);
    expect(s.getItemCount('ammo')).toBe(1500);
    expect(s.getItemCount('arrow')).toBe(900);
    expect(s.getItemCount('health_potion')).toBe(120);
    expect(s.getItemCount('gold_ore')).toBe(3);
    expect(s.ui.baseFell).toBe(true); // aviso aparece, mas o botão principal é "Continuar"
  });
});
