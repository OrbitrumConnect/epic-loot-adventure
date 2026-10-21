import { z } from 'zod';
import { ITEMS } from '../data/items';
import { BUILDINGS, PLOT_COUNT } from '../data/buildings';
import { EXPEDITIONS, UNITS } from '../data/units';
import type { BaseState, BuildingId } from '../types/base';
import { createInitialBase, tickBase } from './baseSystem';
import type { PlayerState, HarvestNodeState, ResourceNode, UIState } from '../types';
import type { PlayerBaseState } from '../types/playerbase';
import { createHarvestNodes, tickHarvestNodes } from './harvestSystem';
import { cellInSquare, worldToCell } from './playerBaseSystem';
import { INVENTORY_SLOTS } from './inventorySystem';

export const SAVE_KEY = 'tribos.local.v1';
export type PersistState = {
  ui?: UIState;
  base: BaseState;
  player: PlayerState;
  playerBase: PlayerBaseState | null;
  towerLastShotAt: Record<string, number>;
  harvestNodes: HarvestNodeState[];
  resources: ResourceNode[];
};

const number = z.number().finite().nonnegative();
const integer = number.int();
const id = z.string().min(1).max(160);
const position = z.object({ x: z.number().finite(), z: z.number().finite() });
const cell = z.object({ gx: z.number().int(), gz: z.number().int() });
const item = id.refine(value => Object.hasOwn(ITEMS, value)).nullable();
const inventory = z.object({
  slots: z.array(z.object({ itemId: item, quantity: integer })).max(1000),
  maxSlots: integer.positive().max(1000), maxWeight: number,
  equipment: z.object({ primary: item, secondary: item, armor: item, accessory: item }),
  hotbar: z.object({ slots: z.array(integer.nullable()).max(100) }),
}).refine(v => v.slots.length === v.maxSlots && v.hotbar.slots.every(i => i === null || i < v.slots.length));
const playerBaseSchema = z.object({
  baseType: z.enum(['fortress', 'watchpost', 'workshop']).optional(),
  id, owner: z.object({ kind: z.enum(['player', 'tribe']), id, name: z.string() }),
  worldPosition: position, origin: cell, size: integer.positive().max(100),
  stage: z.enum(['none', 'bed', 'foundation', 'walls', 'towers', 'enclosed', 'clash']),
  pieces: z.array(z.object({
    id, kind: z.enum(['core', 'wall', 'door', 'tower', 'roof', 'training']), cell,
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    hp: number, maxHp: number.positive(), tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    level: integer.min(1).max(20).optional(),
  }).refine(p => p.hp <= p.maxHp)).max(10000),
  enclosed: z.boolean(), claimedAt: number, lastDamagedAt: number.nullable(),
}).refine(b => new Set(b.pieces.map(p => p.id)).size === b.pieces.length
  && b.pieces.every(p => cellInSquare(p.cell, b.origin, b.size)));

const baseResources = z.object({ wood: number, stone: number, food: number, essence: number });
const buildingId = z.custom<BuildingId>(value => typeof value === 'string' && Object.hasOwn(BUILDINGS, value));
const jobTimes = { startedAt: number.nullable(), endsAt: number.nullable() };
const validTimes = (job: { startedAt: number | null; endsAt: number | null; durationMs: number }) =>
  job.startedAt === null ? job.endsAt === null
    : job.endsAt !== null && job.endsAt === job.startedAt + job.durationMs;
const construction = z.object({
  targetLevel: integer.positive(), durationMs: number.positive(), order: integer.positive(), ...jobTimes,
}).refine(validTimes);
const queueItem = z.object({
  id, unitId: id.refine(value => Object.hasOwn(UNITS, value)),
  durationMs: number.positive(), cost: baseResources, ...jobTimes,
}).refine(validTimes);
const cityBuilding = z.object({
  id, defId: buildingId, level: integer, plotIndex: integer.max(PLOT_COUNT - 1),
  construction: construction.nullable(), queue: z.array(queueItem).max(1000),
}).refine(b => b.level <= BUILDINGS[b.defId].maxLevel
  && (!b.construction || (b.construction.targetLevel === b.level + 1
    && b.construction.targetLevel <= BUILDINGS[b.defId].maxLevel))
  && b.queue.every((q, i) => UNITS[q.unitId]!.building === b.defId
    && (i === 0 ? q.startedAt !== null : q.startedAt === null)));

// Campos opcionais mantêm compatibilidade v1; objetos presentes são validados por inteiro.
const cityBase = z.object({
  resources: baseResources.partial().optional(),
  buildings: z.array(cityBuilding).max(PLOT_COUNT).refine(buildings =>
    new Set(buildings.map(b => b.id)).size === buildings.length
    && new Set(buildings.map(b => b.plotIndex)).size === buildings.length
    && new Set(buildings.flatMap(b => b.queue.map(q => q.id))).size
      === buildings.reduce((n, b) => n + b.queue.length, 0)).optional(),
  builders: integer.positive().optional(), troops: z.record(integer).optional(),
  research: z.record(integer).optional(), toolStash: z.record(integer).optional(),
  expeditions: z.array(z.object({
    id, defId: id.refine(value => Object.hasOwn(EXPEDITIONS, value)), scouts: integer.positive(),
    startedAt: number, endsAt: number,
  }).refine(e => e.endsAt > e.startedAt)).max(1000).optional(),
  explored: number.max(100).optional(), lastTickAt: number.optional(), seq: integer.positive().optional(),
}).optional();

const schema = z.object({
  v: z.literal(1), playerBase: playerBaseSchema.nullable(), base: cityBase,
  player: z.object({
    inventory, level: integer.positive(), xp: number, xpToNext: number.positive(), totalXp: number,
    maxHp: number.positive(), maxMana: number, maxStamina: number, gold: number,
    attributes: z.object({ damage: number, dexterity: number, carry: number, moveSpeed: number }),
    skillPoints: integer, huntValue: number, huntSeen: z.record(integer),
  }),
  towerLastShotAt: z.record(number),
  harvest: z.array(z.object({ id, quantity: integer, depleted: z.boolean(), respawnAt: number.nullable() })).max(2000),
});
export type LocalSave = z.infer<typeof schema>;

/** Lista explícita impede movimento, HP e cooldown do jogador de agendarem saves. */
export const SAVED_PLAYER_KEYS = ['inventory', 'level', 'xp', 'xpToNext', 'totalXp', 'maxHp', 'maxMana',
  'maxStamina', 'gold', 'attributes', 'skillPoints', 'huntValue', 'huntSeen'] as const;

export function persistedStateChanged(a: PersistState, b: PersistState): boolean {
  return a.base !== b.base || a.playerBase !== b.playerBase || a.harvestNodes !== b.harvestNodes || a.towerLastShotAt !== b.towerLastShotAt
    || SAVED_PLAYER_KEYS.some(key => a.player[key] !== b.player[key]);
}

export function createLocalSave(state: PersistState): LocalSave {
  const p = state.player;
  return {
    v: 1, playerBase: state.playerBase, base: state.base,
    player: {
      inventory: p.inventory, level: p.level, xp: p.xp, xpToNext: p.xpToNext, totalXp: p.totalXp,
      maxHp: p.maxHp, maxMana: p.maxMana, maxStamina: p.maxStamina, gold: p.gold,
      attributes: p.attributes ?? { damage: 0, dexterity: 0, carry: 0, moveSpeed: 0 },
      skillPoints: p.skillPoints ?? 0, huntValue: p.huntValue ?? 0, huntSeen: p.huntSeen ?? {},
    },
    towerLastShotAt: state.towerLastShotAt,
    // Só deltas: posição, capacidade e seed são reconstruídas pelos dados atuais.
    harvest: state.harvestNodes.filter(n => n.quantity !== n.maxQuantity || n.depleted || n.respawnAt !== null)
      .map(n => ({ id: n.id, quantity: n.quantity, depleted: n.depleted, respawnAt: n.respawnAt })),
  };
}

/** Falha fechada: versão/desenho desconhecido deixa o jogo inicial intacto. */
export function parseLocalSave(raw: string | null): LocalSave | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch { return null; }
}

/** Migração de transição (Pedro): saves ANTIGOS (feitos antes da flecha existir) ganham
 *  as caixas novas — 2000 flecha + garante 2000 bala + 500 poção. Gate = não ter 'arrow'
 *  no inventário (uma vez; depois o save já tem flecha). Preserva o resto. */
function grantTransitionBoxes<T extends { slots: { itemId: string | null; quantity: number }[] }>(inv: T): T {
  if (inv.slots.some(s => s.itemId === 'arrow')) return inv; // já tem flecha = já migrado
  const slots = inv.slots.map(s => ({ ...s }));
  const ensure = (itemId: string, qty: number) => {
    const have = slots.find(s => s.itemId === itemId);
    if (have) { if (have.quantity < qty) have.quantity = qty; return; }
    const empty = slots.find(s => s.itemId === null);
    if (empty) { empty.itemId = itemId; empty.quantity = qty; }
  };
  ensure('arrow', 2000);
  ensure('ammo', 2000);
  ensure('health_potion', 500);
  return { ...inv, slots };
}

/** Migração de slots (Pedro pediu +50): saves ANTIGOS (24 slots) ganham slots VAZIOS até
 *  `INVENTORY_SLOTS`, sem perder nada. Idempotente (save já grande passa direto). */
function padSlots<T extends { slots: { itemId: string | null; quantity: number }[]; maxSlots: number }>(inv: T): T {
  if (inv.slots.length >= INVENTORY_SLOTS) return inv;
  const slots = inv.slots.map(s => ({ ...s }));
  while (slots.length < INVENTORY_SLOTS) slots.push({ itemId: null, quantity: 0 });
  return { ...inv, slots, maxSlots: INVENTORY_SLOTS };
}

export function restoreLocalSave(save: LocalSave, initial: PersistState, now: number): PersistState {
  const defaults = createInitialBase(now);
  const city: BaseState = {
    buildings: save.base?.buildings ?? defaults.buildings,
    builders: save.base?.builders ?? defaults.builders,
    troops: save.base?.troops ?? defaults.troops,
    research: save.base?.research ?? defaults.research,
    expeditions: save.base?.expeditions ?? defaults.expeditions,
    explored: save.base?.explored ?? defaults.explored,
    toolStash: save.base?.toolStash ?? defaults.toolStash,
    lastTickAt: save.base?.lastTickAt ?? defaults.lastTickAt,
    seq: save.base?.seq ?? defaults.seq,
    resources: {
      wood: save.base?.resources?.wood ?? defaults.resources.wood,
      stone: save.base?.resources?.stone ?? defaults.resources.stone,
      food: save.base?.resources?.food ?? defaults.resources.food,
      essence: save.base?.resources?.essence ?? defaults.resources.essence,
    } };
  // Relógio recuado não congela a cidade. Preserva tempo restante dos jobs futuros.
  const offset = Math.max(0, city.lastTickAt - now);
  if (offset > 0) {
    const shiftJob = <T extends { startedAt: number | null; endsAt: number | null; durationMs: number }>(job: T): T => {
      if (job.startedAt === null) return job;
      const startedAt = Math.max(0, job.startedAt - offset);
      return { ...job, startedAt, endsAt: startedAt + job.durationMs };
    };
    city.buildings = city.buildings.map(b => ({ ...b,
      construction: b.construction ? shiftJob(b.construction) : null,
      queue: b.queue.map(shiftJob),
    }));
    city.expeditions = city.expeditions.map(e => {
      const startedAt = Math.max(0, e.startedAt - offset);
      return { ...e, startedAt, endsAt: startedAt + (e.endsAt - e.startedAt) };
    });
  }
  // Inferir contador evita colisões ao carregar um snapshot parcial sem seq.
  city.seq = Math.max(city.seq, ...city.buildings.flatMap(b => [Number(b.id.slice(1)) || 0,
    b.construction?.order ?? 0, ...b.queue.map(q => Number(q.id.slice(1)) || 0)]),
  ...city.expeditions.map(e => Number(e.id.slice(1)) || 0));
  city.lastTickAt = Math.min(city.lastTickAt, now);
  const claim = save.playerBase;
  const outside = (p: { x: number; z: number }) => !claim || !cellInSquare(worldToCell(p), claim.origin, claim.size);
  const deltas = new Map(save.harvest.map(n => [n.id, n]));
  const nodes = createHarvestNodes().filter(n => outside(n.position)).map(n => {
    const delta = deltas.get(n.id);
    if (!delta || delta.quantity > n.maxQuantity || delta.depleted !== (delta.quantity === 0)) return n;
    if (delta.depleted && delta.respawnAt === null) return n;
    return { ...n, quantity: delta.quantity, depleted: delta.depleted, respawnAt: delta.respawnAt };
  });
  const towerLastShotAt: Record<string, number> = {};
  // A arma ativa é lida pela hotbar no combate. Equipamento restaurado precisa
  // selecionar o mesmo slot, inclusive nos saves v1 anteriores a este campo de UI.
  const equipped = save.player.inventory.equipment.primary;
  const hotbarIndex = equipped === null ? -1 : save.player.inventory.hotbar.slots.findIndex(slot =>
    slot !== null && save.player.inventory.slots[slot]?.itemId === equipped);
  for (const piece of claim?.pieces ?? []) {
    const stamp = save.towerLastShotAt[piece.id];
    if (piece.kind === 'tower' && stamp !== undefined) towerLastShotAt[piece.id] = Math.min(stamp, now);
  }
  return {
    base: tickBase(city, now),
    ...(initial.ui ? { ui: { ...initial.ui, selectedHotbar: hotbarIndex < 0 ? 0 : hotbarIndex } } : {}),
    playerBase: claim, towerLastShotAt,
    player: { ...initial.player, ...save.player, inventory: padSlots(grantTransitionBoxes(save.player.inventory)),
      hp: save.player.maxHp, mana: save.player.maxMana,
      stamina: save.player.maxStamina, dead: false, respawnAt: 0 },
    harvestNodes: tickHarvestNodes(nodes, now), resources: initial.resources.filter(r => outside(r.position)),
  };
}
