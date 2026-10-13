import { z } from 'zod';
import { ITEMS } from '../data/items';
import type { PlayerState, HarvestNodeState, ResourceNode } from '../types';
import type { PlayerBaseState } from '../types/playerbase';
import { createHarvestNodes, tickHarvestNodes } from './harvestSystem';
import { cellInSquare, worldToCell } from './playerBaseSystem';

export const SAVE_KEY = 'tribos.local.v1';
export type PersistState = {
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
const base = z.object({
  id, owner: z.object({ kind: z.enum(['player', 'tribe']), id, name: z.string() }),
  worldPosition: position, origin: cell, size: integer.positive().max(100),
  stage: z.enum(['none', 'bed', 'foundation', 'walls', 'towers', 'enclosed', 'clash']),
  pieces: z.array(z.object({
    id, kind: z.enum(['core', 'wall', 'door', 'tower', 'roof']), cell,
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    hp: number, maxHp: number.positive(), tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  }).refine(p => p.hp <= p.maxHp)).max(10000),
  enclosed: z.boolean(), claimedAt: number, lastDamagedAt: number.nullable(),
}).refine(b => new Set(b.pieces.map(p => p.id)).size === b.pieces.length
  && b.pieces.every(p => cellInSquare(p.cell, b.origin, b.size)));

const schema = z.object({
  v: z.literal(1), playerBase: base.nullable(),
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
  return a.playerBase !== b.playerBase || a.harvestNodes !== b.harvestNodes || a.towerLastShotAt !== b.towerLastShotAt
    || SAVED_PLAYER_KEYS.some(key => a.player[key] !== b.player[key]);
}

export function createLocalSave(state: PersistState): LocalSave {
  const p = state.player;
  return {
    v: 1, playerBase: state.playerBase,
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

export function restoreLocalSave(save: LocalSave, initial: PersistState, now: number): PersistState {
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
  for (const piece of claim?.pieces ?? []) {
    const stamp = save.towerLastShotAt[piece.id];
    if (piece.kind === 'tower' && stamp !== undefined) towerLastShotAt[piece.id] = Math.min(stamp, now);
  }
  return {
    playerBase: claim, towerLastShotAt,
    player: { ...initial.player, ...save.player, hp: save.player.maxHp, mana: save.player.maxMana,
      stamina: save.player.maxStamina, dead: false, respawnAt: 0 },
    harvestNodes: tickHarvestNodes(nodes, now), resources: initial.resources.filter(r => outside(r.position)),
  };
}
