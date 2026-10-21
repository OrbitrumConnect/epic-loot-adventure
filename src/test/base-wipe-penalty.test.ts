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

describe('base destruída (Pedro 21/10, regra final)', () => {
  it('−5 níveis + kit inicial; MANTÉM armas/armaduras/raros; perde o farm; base volta pra madeira', () => {
    useGameStore.getState().claimBase(freeOrigin());
    const pb = useGameStore.getState().playerBase!;
    const core = pb.pieces.find(p => p.kind === 'core')!;
    useGameStore.setState(s => ({
      baseEvolved: true, baseMetal: true,
      player: {
        ...s.player, level: 12,
        inventory: {
          ...createInventory([
            { itemId: 'wood', quantity: 300 }, { itemId: 'stone', quantity: 200 },
            { itemId: 'iron_ore', quantity: 40 }, { itemId: 'deer_hide', quantity: 9 },
            { itemId: 'ammo', quantity: 50 }, { itemId: 'eclipse_blade', quantity: 1 },
            { itemId: 'bone_armor', quantity: 1 }, { itemId: 'gold_ore', quantity: 3 },
          ]),
          equipment: { primary: 'eclipse_blade', secondary: null, armor: 'bone_armor', accessory: null },
        },
      },
    }));

    useGameStore.getState().damageBasePiece(core.id, 1e9);

    const s = useGameStore.getState();
    expect(s.playerBase).toBeNull();
    expect(s.baseEvolved).toBe(false);
    expect(s.baseMetal).toBe(false);
    expect(s.player.level).toBe(7);
    // Farm volta ao kit (madeira 12 / pedra 8 do kit; ferro e couro comum somem).
    expect(s.getItemCount('wood')).toBe(12);
    expect(s.getItemCount('stone')).toBe(8);
    expect(s.getItemCount('iron_ore')).toBe(0);
    expect(s.getItemCount('deer_hide')).toBe(0);
    // Caixas voltam ao kit.
    expect(s.getItemCount('ammo')).toBe(2000);
    expect(s.getItemCount('arrow')).toBe(2000);
    expect(s.getItemCount('health_potion')).toBe(500);
    // Especial fica (e segue equipado).
    expect(s.getItemCount('eclipse_blade')).toBe(1);
    expect(s.getItemCount('bone_armor')).toBe(1);
    expect(s.getItemCount('gold_ore')).toBe(3);
    expect(s.player.inventory.equipment.primary).toBe('eclipse_blade');
    expect(s.player.inventory.equipment.armor).toBe('bone_armor');
    expect(s.ui.baseFell).toBe(true); // aviso aparece; botão principal é "Continuar"
  });
});
