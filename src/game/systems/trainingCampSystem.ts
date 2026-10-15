import type { BaseState, InventoryState } from '../types';
import type { GridCell, PlayerBaseState } from '../types/playerbase';
import { PLOT_COUNT } from '../data/buildings';
import { basePieceCost } from './baseTypeSystem';
import { placeBuilding } from './baseSystem';
import { baseLv1Layout } from './baseLv1';
import { advanceStageFully, cellKey, placePieces } from './playerBaseSystem';

/** One-cell internal footprint, away from the central house and reserved perimeter. */
export function trainingCampCell(base: PlayerBaseState): GridCell | null {
  const occupied = new Set(base.pieces.map(piece => cellKey(piece.cell)));
  const core = base.pieces.find(piece => piece.kind === 'core')?.cell;
  if (!core) return null;
  for (let gz = base.origin.gz + 1; gz < base.origin.gz + base.size - 1; gz++) {
    for (let gx = base.origin.gx + 1; gx < base.origin.gx + base.size - 1; gx++) {
      if (Math.max(Math.abs(gx - core.gx), Math.abs(gz - core.gz)) <= 3) continue;
      const cell = { gx, gz };
      if (!occupied.has(cellKey(cell))) return cell;
    }
  }
  return null;
}

/** Transaction across the existing city and inventory economies; failures preserve all inputs. */
export function constructTrainingCamp(base: BaseState, playerBase: PlayerBaseState | null, inventory: InventoryState, now: number) {
  const fail = (message: string) => ({ ok: false, base, playerBase, inventory, message });
  if (!playerBase) return fail('Reivindique um terreno primeiro.');
  if (playerBase.pieces.some(piece => piece.kind === 'training')) return fail('Centro de treinamento já construído.');
  const cell = trainingCampCell(playerBase);
  if (!cell) return fail('Sem espaço interno livre para o centro de treinamento.');
  let city = base;
  if (!base.buildings.some(building => building.defId === 'war_camp')) {
    const plot = Array.from({ length: PLOT_COUNT }, (_, i) => i).find(i => !base.buildings.some(b => b.plotIndex === i));
    if (plot == null) return fail('Sem terreno livre na cidade.');
    const logical = placeBuilding(base, 'war_camp', plot, now);
    if (!logical.ok) return fail(logical.message);
    city = logical.state;
  }
  const physical = placePieces(playerBase, {
    kind: 'training', cells: [cell], cost: basePieceCost('training', 1, playerBase.baseType), blocked: [], affordable: true,
  }, inventory, now);
  if (!physical.ok) return fail(physical.message);
  return { ok: true, base: city, playerBase: advanceStageFully(physical.base), inventory: physical.inventory, message: 'Centro de treinamento instalado. Produção vinculada ao Campo de Guerra da cidade.' };
}

export function nextWall(base: PlayerBaseState) {
  const occupied = new Set(base.pieces.map(piece => cellKey(piece.cell)));
  return baseLv1Layout(base.origin, base.size).find(piece => piece.kind === 'wall' && !occupied.has(cellKey(piece.cell))) ?? null;
}

/** Direct construction follows the same layout as deliveries; door and tower slots stay reserved. */
export function constructNextWall(playerBase: PlayerBaseState | null, inventory: InventoryState, now: number) {
  const fail = (message: string) => ({ ok: false, playerBase, inventory, message });
  if (!playerBase) return fail('Reivindique um terreno primeiro.');
  const wall = nextWall(playerBase);
  if (!wall) return fail('Todos os muros do perímetro já estão construídos.');
  const result = placePieces(playerBase, {
    kind: 'wall', cells: [wall.cell], rotation: wall.rotation,
    cost: basePieceCost('wall', 1, playerBase.baseType), blocked: [], affordable: true,
  }, inventory, now);
  if (!result.ok) return fail(result.message);
  return { ok: true, playerBase: advanceStageFully(result.base), inventory: result.inventory, message: result.message };
}
