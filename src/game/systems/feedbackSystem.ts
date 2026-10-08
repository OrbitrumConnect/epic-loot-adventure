import type {
  CampState, CreatureState, FeedbackEvent, FeedbackKind, HealthBarInfo, Objective, PlayerState, Position,
} from '../types';
import { ITEMS } from '../data/items';
import { CREATURES } from '../data/creatures';

/** Teto da lista: o feed nunca cresce sem limite, mesmo com muitos golpes por segundo. */
export const MAX_FEEDBACK_EVENTS = 40;

/** Duração em ms de cada tipo de evento antes de sumir. */
export const FEEDBACK_TTL: Record<FeedbackKind, number> = {
  damage: 900,
  heal: 1100,
  death: 1500,
  xp: 1800,
  loot: 2600,
  harvest: 2200,
  levelup: 3000,
};

/** Evento ainda sem `id` e `createdAt`: quem os preenche é `pushEvent`. */
export type FeedbackDraft = Omit<FeedbackEvent, 'id' | 'createdAt'>;

let eventCounter = 0;

/** Remove os eventos cujo `ttl` já passou. Devolve a mesma lista se nada expirou. */
export function pruneEvents(list: FeedbackEvent[], now: number): FeedbackEvent[] {
  const alive = list.filter(e => now - e.createdAt < e.ttl);
  return alive.length === list.length ? list : alive;
}

/**
 * Acrescenta um evento: atribui o próximo id, descarta os vencidos e limita a
 * lista a `MAX_FEEDBACK_EVENTS` (os mais antigos saem primeiro).
 */
export function pushEvent(list: FeedbackEvent[], draft: FeedbackDraft, now: number): FeedbackEvent[] {
  const event: FeedbackEvent = { ...draft, id: ++eventCounter, createdAt: now };
  const next = [...pruneEvents(list, now), event];
  return next.length > MAX_FEEDBACK_EVENTS ? next.slice(next.length - MAX_FEEDBACK_EVENTS) : next;
}

/** Junta vários rascunhos de uma vez (uma só cópia de lista por chamada ao store). */
export function pushEvents(list: FeedbackEvent[], drafts: FeedbackDraft[], now: number): FeedbackEvent[] {
  let next = list;
  for (const draft of drafts) next = pushEvent(next, draft, now);
  return next;
}

// ---------------------------------------------------------------------------
// Construtores
// ---------------------------------------------------------------------------

export function damageEvent(
  targetId: string,
  amount: number,
  position: Position,
  opts: { onPlayer?: boolean; critical?: boolean; fire?: boolean } = {},
): FeedbackDraft {
  const critical = opts.critical === true;
  return {
    kind: 'damage',
    position: { ...position },
    targetId,
    label: critical ? `-${amount}!` : `-${amount}`,
    amount,
    onPlayer: opts.onPlayer === true,
    critical,
    fire: opts.fire === true,
    ttl: FEEDBACK_TTL.damage,
  };
}

export function healEvent(targetId: string, amount: number, position: Position): FeedbackDraft {
  return {
    kind: 'heal',
    position: { ...position },
    targetId,
    label: `+${amount} de vida`,
    amount,
    ttl: FEEDBACK_TTL.heal,
  };
}

export function xpEvent(amount: number, position: Position): FeedbackDraft {
  return {
    kind: 'xp',
    position: { ...position },
    targetId: 'player',
    label: `+${amount} XP`,
    amount,
    ttl: FEEDBACK_TTL.xp,
  };
}

export function lootEvent(itemId: string, quantity: number, position: Position): FeedbackDraft {
  return {
    kind: 'loot',
    position: { ...position },
    targetId: 'player',
    label: `+${quantity} ${ITEMS[itemId]?.name ?? itemId}`,
    amount: quantity,
    itemId,
    ttl: FEEDBACK_TTL.loot,
  };
}

export function harvestEvent(itemId: string, quantity: number, position: Position): FeedbackDraft {
  return {
    kind: 'harvest',
    position: { ...position },
    targetId: 'player',
    label: `+${quantity} ${ITEMS[itemId]?.name ?? itemId}`,
    amount: quantity,
    itemId,
    ttl: FEEDBACK_TTL.harvest,
  };
}

export function deathEvent(targetId: string, name: string, position: Position): FeedbackDraft {
  return {
    kind: 'death',
    position: { ...position },
    targetId,
    label: `${name} derrotado`,
    amount: 0,
    ttl: FEEDBACK_TTL.death,
  };
}

export function levelUpEvent(newLevel: number, position: Position): FeedbackDraft {
  return {
    kind: 'levelup',
    position: { ...position },
    targetId: 'player',
    label: `Nível ${newLevel}!`,
    amount: newLevel,
    ttl: FEEDBACK_TTL.levelup,
  };
}

// ---------------------------------------------------------------------------
// Barras de vida
// ---------------------------------------------------------------------------

export type HealthBarInput = {
  creatures: CreatureState[];
  player: Pick<PlayerState, 'id' | 'name' | 'hp' | 'maxHp' | 'position' | 'dead'>;
  /** Criatura escolhida à mão. */
  targetId: string | null;
  /** Objetivo ativo, se houver. `hunt_creature` destaca a criatura; `clear_camp`, as do acampamento. */
  objective: Objective | null;
  /** Necessário só para destacar as criaturas de um `clear_camp`. */
  camps?: CampState[];
};

/** Id usado na barra do próprio jogador. */
export const PLAYER_BAR_ID = 'player';

/**
 * Quais barras desenhar. Não inclui criaturas mortas ou renascendo, nem o
 * jogador morto. `now` entra só para ignorar quem ainda espera renascer.
 */
export function buildHealthBars(input: HealthBarInput, now: number): HealthBarInfo[] {
  const { creatures, player, targetId, objective, camps } = input;

  const objectiveIds = new Set<string>();
  if (objective && (objective.status === 'active' || objective.status === 'queued')) {
    if (objective.kind === 'hunt_creature' && objective.targetId) {
      objectiveIds.add(objective.targetId);
    } else if (objective.kind === 'clear_camp' && objective.targetId) {
      const camp = camps?.find(c => c.id === objective.targetId);
      for (const id of camp?.creatureIds ?? []) objectiveIds.add(id);
    }
  }

  const bars: HealthBarInfo[] = [];
  for (const c of creatures) {
    if (c.behavior === 'dead' || c.behavior === 'respawning' || c.hp <= 0) continue;
    if (c.respawnAt != null && c.respawnAt > now) continue;
    bars.push({
      id: c.id,
      name: c.name,
      hp: c.hp,
      maxHp: c.maxHp,
      position: c.position,
      hostile: CREATURES[c.speciesId]?.peaceful !== true,
      highlighted: c.id === targetId || objectiveIds.has(c.id),
    });
  }

  if (!player.dead) {
    bars.push({
      id: PLAYER_BAR_ID,
      name: player.name,
      hp: player.hp,
      maxHp: player.maxHp,
      position: player.position,
      hostile: false,
      highlighted: false,
    });
  }
  return bars;
}
