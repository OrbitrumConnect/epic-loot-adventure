import { describe, expect, it } from 'vitest';

import type { AutoSnapshot, Position } from '@/game/types';
import { CREATURES } from '@/game/data/creatures';
import {
  LEVEL_GAINS, MAX_LEVEL, applyXp, createProgression, creatureXp, grantXp, levelUpMessage,
  playerBaseAttack, xpForLevel,
} from '@/game/systems/progressionSystem';
import {
  addObjective, createQueue, decideIntent, tickObjectives, HUNT_AREA_RADIUS, RETREAT_HP_RATIO,
} from '@/game/systems/objectiveSystem';
import { AUTO_DRINK_HP_RATIO, drinkBestPotion, findBestHealItem, shouldAutoDrink } from '@/game/systems/potionSystem';
import { createInventory } from '@/game/systems/inventorySystem';
import { createWildCreatures, WILD_CREATURE_COUNT } from '@/game/systems/wildlifeSystem';
import { CAMPS, CAMP_PLACEMENTS, PLAYER_SPAWN } from '@/game/data/camps';
import { useGameStore } from '@/game/state/game-store';

const T0 = 5_000_000;
const ORIGIN: Position = { x: 0, z: 0 };

function wolfXp() { return creatureXp(CREATURES['wolf']!); }

describe('XP de criatura', () => {
  it('criatura mais forte vale mais XP', () => {
    const order = ['rabbit', 'deer', 'raider_scout', 'wolf', 'boar', 'raider_shaman', 'raider_warrior', 'wolf_alpha', 'raider_brute', 'bear']
      .map(id => creatureXp(CREATURES[id]!));
    for (let i = 1; i < order.length; i++) expect(order[i]).toBeGreaterThanOrEqual(order[i - 1]!);
  });

  it('lobo e brutamontes ficam bem distantes', () => {
    const wolf = wolfXp();
    const brute = creatureXp(CREATURES['raider_brute']!);
    expect(wolf).toBe(34);
    expect(brute).toBe(95);
    expect(brute).toBeGreaterThan(wolf * 2.5);
  });
});

describe('curva de nível', () => {
  it('sobe a cada nível e nível 2 custa 3 a 4 lobos', () => {
    for (let lv = 1; lv < MAX_LEVEL; lv++) expect(xpForLevel(lv + 1)).toBeGreaterThan(xpForLevel(lv));
    const kills = xpForLevel(1) / wolfXp();
    expect(kills).toBeGreaterThan(3);
    expect(kills).toBeLessThanOrEqual(4);
  });

  it('um ganho grande sobe vários níveis de uma vez', () => {
    const start = createProgression(1);
    const need = xpForLevel(1) + xpForLevel(2) + xpForLevel(3);
    const { progression, level, result } = applyXp(start, 1, need + 7);
    expect(level).toBe(4);
    expect(result.levelsGained).toBe(3);
    expect(result.newLevel).toBe(4);
    expect(result.gains.maxHp).toBe(LEVEL_GAINS.maxHp * 3);
    expect(progression.xp).toBe(7);
    expect(progression.xpToNext).toBe(xpForLevel(4));
    expect(progression.totalXp).toBe(need + 7);
  });

  it('não passa do nível máximo', () => {
    const { progression, level, result } = applyXp(createProgression(1), 1, 10_000_000);
    expect(level).toBe(MAX_LEVEL);
    expect(result.newLevel).toBe(MAX_LEVEL);
    expect(result.levelsGained).toBe(MAX_LEVEL - 1);
    expect(progression.xp).toBe(progression.xpToNext);

    const again = applyXp(progression, level, 500);
    expect(again.level).toBe(MAX_LEVEL);
    expect(again.result.levelsGained).toBe(0);
    expect(again.progression.totalXp).toBe(progression.totalXp + 500);
  });

  it('sem XP não muda nada', () => {
    const { progression, result } = applyXp(createProgression(1), 1, 0);
    expect(progression.xp).toBe(0);
    expect(result.levelsGained).toBe(0);
  });

  it('ataque base vem do nível', () => {
    expect(playerBaseAttack(1)).toBe(10);
    expect(playerBaseAttack(5)).toBe(10 + LEVEL_GAINS.attackPower * 4);
  });

  it('grantXp aumenta máximos, cura tudo e monta a mensagem em PT-BR', () => {
    const player = { ...useGameStore.getState().player, hp: 10, mana: 1, stamina: 1 };
    const { player: next, result, message } = grantXp(player, xpForLevel(1));
    expect(next.level).toBe(2);
    expect(next.maxHp).toBe(player.maxHp + LEVEL_GAINS.maxHp);
    expect(next.hp).toBe(next.maxHp);
    expect(next.mana).toBe(next.maxMana);
    expect(message).toBe(levelUpMessage(result));
    expect(message).toBe(`Nível 2! +${LEVEL_GAINS.maxHp} de vida máxima.`);
  });
});

describe('attack concede XP', () => {
  it('matar criatura dá XP e a mensagem de nível quando sobe', () => {
    const store = useGameStore;
    const creature = store.getState().creatures.find(c => c.id === 'wild_rabbit_0')!;
    // Coloca o jogador colado no coelho e dá vida baixa ao coelho: um golpe mata.
    store.setState(s => ({
      player: { ...s.player, position: { ...creature.position }, lastAttackAt: 0, xp: 0, totalXp: 0 },
      creatures: s.creatures.map(c => (c.id === creature.id ? { ...c, hp: 1 } : c)),
    }));
    store.getState().attack(creature.id);
    const after = store.getState().player;
    expect(after.totalXp).toBe(creatureXp(CREATURES['rabbit']!));
    expect(store.getState().ui.message).toContain('XP');
  });

  it('XP grande no kill sobe de nível com mensagem exata', () => {
    const store = useGameStore;
    const creature = store.getState().creatures.find(c => c.id === 'wild_bear_0')!;
    store.setState(s => ({
      player: {
        ...s.player, position: { ...creature.position }, lastAttackAt: 0, level: 1, xp: xpForLevel(1) - 1,
        xpToNext: xpForLevel(1), totalXp: 0, maxHp: 100, hp: 50,
      },
      creatures: s.creatures.map(c => (c.id === creature.id ? { ...c, hp: 1 } : c)),
    }));
    store.getState().attack(creature.id);
    const after = store.getState().player;
    expect(after.level).toBeGreaterThanOrEqual(2);
    expect(after.hp).toBe(after.maxHp);
    expect(store.getState().ui.message).toBe(`Nível ${after.level}! +${LEVEL_GAINS.maxHp * (after.level - 1)} de vida máxima.`);
  });
});

// ---------------------------------------------------------------------------

function snapshot(partial: Partial<AutoSnapshot> = {}): AutoSnapshot {
  return {
    playerPosition: ORIGIN,
    playerHp: 100,
    playerMaxHp: 100,
    playerDead: false,
    healSlot: null,
    creatures: [],
    camps: [],
    resources: [],
    objectives: createQueue(),
    homePosition: { x: 0, z: 1 },
    ...partial,
  };
}

function huntAreaQueue(center: Position, radius?: number) {
  const queue = addObjective(createQueue(), {
    kind: 'hunt_area', targetId: 'area_x', position: center, label: 'Caçar área',
    ...(radius != null ? { radius } : {}),
  }, T0);
  return tickObjectives(queue, { playerPosition: ORIGIN, creatures: [], camps: [], resources: [] }, T0).queue;
}

describe('objetivo hunt_area', () => {
  const center: Position = { x: 30, z: 30 };

  it('ataca a criatura viva mais próxima dentro do raio', () => {
    const objectives = huntAreaQueue(center);
    const creatures = [
      { id: 'longe_da_area', position: { x: 0, z: 0 }, behavior: 'idle', hp: 10 },
      { id: 'dentro_longe', position: { x: 40, z: 30 }, behavior: 'idle', hp: 10 },
      { id: 'dentro_perto', position: { x: 31, z: 30 }, behavior: 'patrol', hp: 10 },
    ];
    const intent = decideIntent(snapshot({ objectives, creatures, playerPosition: { x: 30, z: 30 } }), T0);
    expect(intent).toMatchObject({ kind: 'attack', creatureId: 'dentro_perto' });
  });

  it('anda até a criatura quando está longe dela', () => {
    const objectives = huntAreaQueue(center);
    const creatures = [{ id: 'c1', position: { x: 35, z: 30 }, behavior: 'idle', hp: 10 }];
    const intent = decideIntent(snapshot({ objectives, creatures, playerPosition: { x: 30, z: 30 } }), T0);
    expect(intent.kind).toBe('move');
  });

  it('ignora criaturas mortas e fora do raio', () => {
    const objectives = huntAreaQueue(center, 5);
    const creatures = [
      { id: 'morta', position: { x: 31, z: 30 }, behavior: 'dead', hp: 0 },
      { id: 'fora', position: { x: 30 + 6, z: 30 }, behavior: 'idle', hp: 10 },
    ];
    const intent = decideIntent(snapshot({ objectives, creatures, playerPosition: center }), T0);
    expect(intent.kind).toBe('idle');
  });

  it('sem criatura viva, volta ao centro e espera lá', () => {
    const objectives = huntAreaQueue(center);
    const away = decideIntent(snapshot({ objectives, playerPosition: { x: 0, z: 0 } }), T0);
    expect(away).toMatchObject({ kind: 'move', to: center });

    const waiting = decideIntent(snapshot({ objectives, playerPosition: { x: 30.5, z: 30 } }), T0);
    expect(waiting.kind).toBe('idle');
  });

  it('nunca conclui sozinho, nem com a área vazia ou o jogador no centro', () => {
    const objectives = huntAreaQueue(center);
    const world = { playerPosition: center, creatures: [], camps: [], resources: [] };
    const result = tickObjectives(objectives, world, T0 + 1000);
    expect(result.completed).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.queue.items[0]!.status).toBe('active');
  });

  it('usa o raio padrão quando o objetivo não traz raio', () => {
    const objectives = huntAreaQueue(center);
    const edge = { x: 30 + HUNT_AREA_RADIUS - 1, z: 30 };
    const creatures = [{ id: 'borda', position: edge, behavior: 'idle', hp: 10 }];
    const intent = decideIntent(snapshot({ objectives, creatures, playerPosition: edge }), T0);
    expect(intent.kind).toBe('attack');
  });

  it('addHuntArea enfileira com rótulo da região e raio ~14', () => {
    useGameStore.setState(s => ({ objectives: createQueue(), ui: { ...s.ui } }));
    useGameStore.getState().addHuntArea(20, -20);
    const item = useGameStore.getState().objectives.items[0]!;
    expect(item.kind).toBe('hunt_area');
    expect(item.radius).toBe(14);
    expect(item.label).toContain('Nordeste');
    // duplicado não entra
    useGameStore.getState().addHuntArea(20, -20);
    expect(useGameStore.getState().objectives.items).toHaveLength(1);
  });
});

describe('poção automática', () => {
  it('desligada: vida baixa com cura disponível recua em vez de curar', () => {
    const base = { playerHp: 100 * RETREAT_HP_RATIO - 1, healSlot: 2 };
    expect(decideIntent(snapshot({ ...base, autoPotion: true }), T0).kind).toBe('heal');
    expect(decideIntent(snapshot(base), T0).kind).toBe('heal'); // ausente = ligada
    expect(decideIntent(snapshot({ ...base, autoPotion: false }), T0).kind).toBe('retreat');
  });

  it('shouldAutoDrink respeita o interruptor, a vida e a morte', () => {
    const low = { hp: 100 * AUTO_DRINK_HP_RATIO - 1, maxHp: 100, dead: false };
    expect(shouldAutoDrink(low, true)).toBe(true);
    expect(shouldAutoDrink(low, false)).toBe(false);
    expect(shouldAutoDrink({ ...low, hp: 90 }, true)).toBe(false);
    expect(shouldAutoDrink({ ...low, dead: true }, true)).toBe(false);
  });

  it('beber gasta a poção; com infinito não gasta e funciona sem estoque', () => {
    const inv = createInventory([{ itemId: 'health_potion', quantity: 2 }]);
    const spent = drinkBestPotion(inv, 10, 100, false);
    expect(spent.ok).toBe(true);
    expect(spent.hp).toBe(40);
    expect(spent.inventory.slots[0]!.quantity).toBe(1);

    const free = drinkBestPotion(inv, 10, 100, true);
    expect(free.inventory.slots[0]!.quantity).toBe(2);

    const empty = createInventory([]);
    expect(drinkBestPotion(empty, 10, 100, false).ok).toBe(false);
    expect(findBestHealItem(empty, true)).toBe('health_potion');
    expect(drinkBestPotion(empty, 10, 100, true).ok).toBe(true);
  });

  it('escolhe a maior cura disponível', () => {
    const inv = createInventory([{ itemId: 'cooked_meat', quantity: 3 }, { itemId: 'health_potion', quantity: 1 }]);
    expect(findBestHealItem(inv)).toBe('health_potion');
  });

  it('toggleAutoPotion liga e desliga (começa ligado)', () => {
    useGameStore.setState({ autoPotion: true });
    useGameStore.getState().toggleAutoPotion();
    expect(useGameStore.getState().autoPotion).toBe(false);
    expect(useGameStore.getState().buildAutoSnapshot().autoPotion).toBe(false);
    useGameStore.getState().toggleAutoPotion();
    expect(useGameStore.getState().autoPotion).toBe(true);
  });
});

describe('fauna selvagem', () => {
  const wild = createWildCreatures();

  it('gera entre 25 e 40 criaturas, determinístico, ids únicos', () => {
    expect(wild).toHaveLength(WILD_CREATURE_COUNT);
    expect(wild.length).toBeGreaterThanOrEqual(25);
    expect(wild.length).toBeLessThanOrEqual(WILD_CREATURE_COUNT);
    expect(createWildCreatures()).toEqual(wild);
    expect(new Set(wild.map(c => c.id)).size).toBe(wild.length);
  });

  it('fica fora de acampamentos e da clareira do nascedouro', () => {
    for (const c of wild) {
      expect(Math.hypot(c.position.x - PLAYER_SPAWN.x, c.position.z - PLAYER_SPAWN.z)).toBeGreaterThanOrEqual(12);
      for (const p of CAMP_PLACEMENTS) {
        const r = CAMPS[p.defId]!.radius;
        expect(Math.hypot(c.position.x - p.position.x, c.position.z - p.position.z)).toBeGreaterThan(r);
      }
    }
  });

  it('marca espécies pacíficas e hostis', () => {
    expect(CREATURES['deer']!.peaceful).toBe(true);
    expect(CREATURES['rabbit']!.peaceful).toBe(true);
    expect(CREATURES['bear']!.peaceful).toBe(false);
    expect(CREATURES['wolf_alpha']!.peaceful).toBe(false);
    expect(CREATURES['boar']!.peaceful).toBe(false);
  });

  it('o estado inicial da loja inclui a fauna', () => {
    const ids = new Set(useGameStore.getState().creatures.map(c => c.id));
    for (const c of wild) expect(ids.has(c.id)).toBe(true);
  });
});
