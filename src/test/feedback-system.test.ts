import { describe, it, expect } from 'vitest';
import type { CreatureState, FeedbackEvent, Objective } from '../game/types';
import {
  MAX_FEEDBACK_EVENTS, FEEDBACK_TTL, pushEvent, pruneEvents, damageEvent, xpEvent, lootEvent,
  harvestEvent, deathEvent, levelUpEvent, healEvent, buildHealthBars,
} from '../game/systems/feedbackSystem';
import { isCriticalDamage, calculateDamage } from '../game/systems/combatSystem';
import { rollCreatureLoot } from '../game/systems/lootSystem';
import { CREATURES } from '../game/data/creatures';
import { ITEMS, itemSpriteUrl } from '../game/data/items';
import { RECIPES } from '../game/data/recipes';

const POS = { x: 1, z: 2 };

function creature(over: Partial<CreatureState> = {}): CreatureState {
  return {
    id: 'c1', speciesId: 'wolf', name: 'Lobo', hp: 50, maxHp: 80, attackPower: 8, armor: 2,
    attackCooldown: 1.5, lastAttackAt: 0, position: POS, behavior: 'patrol', lootTable: [], respawnAt: null,
    ...over,
  };
}

const PLAYER = { id: 'player_1', name: 'Kael', hp: 100, maxHp: 100, position: { x: 0, z: 0 }, dead: false };

describe('feed de eventos', () => {
  it('atribui ids crescentes e createdAt', () => {
    let list: FeedbackEvent[] = [];
    list = pushEvent(list, damageEvent('c1', 10, POS), 1000);
    list = pushEvent(list, damageEvent('c1', 12, POS), 1010);
    expect(list).toHaveLength(2);
    expect(list[1]!.id).toBeGreaterThan(list[0]!.id);
    expect(list[0]!.createdAt).toBe(1000);
  });

  it('descarta eventos vencidos pelo ttl', () => {
    let list = pushEvent([], damageEvent('c1', 10, POS), 0);
    list = pushEvent(list, lootEvent('bone', 1, POS), 100);
    expect(pruneEvents(list, FEEDBACK_TTL.damage - 1)).toHaveLength(2);
    const after = pruneEvents(list, FEEDBACK_TTL.damage + 1);
    expect(after).toHaveLength(1);
    expect(after[0]!.kind).toBe('loot');
    expect(pruneEvents(list, 10_000)).toHaveLength(0);
  });

  it('pruneEvents devolve a mesma lista quando nada expira', () => {
    const list = pushEvent([], lootEvent('bone', 1, POS), 0);
    expect(pruneEvents(list, 10)).toBe(list);
  });

  it('pushEvent também limpa os vencidos', () => {
    const list = pushEvent([], damageEvent('c1', 5, POS), 0);
    const next = pushEvent(list, damageEvent('c1', 6, POS), 5000);
    expect(next).toHaveLength(1);
    expect(next[0]!.amount).toBe(6);
  });

  it('limita a lista ao teto, removendo os mais antigos', () => {
    let list: FeedbackEvent[] = [];
    for (let i = 0; i < MAX_FEEDBACK_EVENTS + 25; i++) {
      list = pushEvent(list, lootEvent('bone', i + 1, POS), 0);
    }
    expect(list).toHaveLength(MAX_FEEDBACK_EVENTS);
    expect(list[list.length - 1]!.amount).toBe(MAX_FEEDBACK_EVENTS + 25);
    expect(list[0]!.amount).toBe(26);
  });

  it('não muta a lista original', () => {
    const base = pushEvent([], lootEvent('bone', 1, POS), 0);
    pushEvent(base, lootEvent('sinew', 1, POS), 1);
    expect(base).toHaveLength(1);
  });
});

describe('construtores', () => {
  it('rótulos em português', () => {
    expect(damageEvent('c1', 12, POS).label).toBe('-12');
    expect(damageEvent('c1', 20, POS, { critical: true }).label).toBe('-20!');
    expect(xpEvent(30, POS).label).toBe('+30 XP');
    expect(lootEvent('bone', 2, POS).label).toBe('+2 Osso');
    expect(harvestEvent('wood', 3, POS).label).toBe('+3 Madeira');
    expect(deathEvent('c1', 'Lobo do Vale', POS).label).toBe('Lobo do Vale derrotado');
    expect(levelUpEvent(4, POS).label).toBe('Nível 4!');
    expect(healEvent('player_1', 30, POS).label).toBe('+30 de vida');
  });

  it('loot e harvest levam o itemId para o sprite', () => {
    expect(lootEvent('antler', 1, POS).itemId).toBe('antler');
    expect(harvestEvent('stone', 1, POS).itemId).toBe('stone');
  });

  it('dano marca onPlayer e critical', () => {
    const e = damageEvent('player_1', 5, POS, { onPlayer: true });
    expect(e.onPlayer).toBe(true);
    expect(e.critical).toBe(false);
  });

  it('ttl: dano curto, loot e xp mais longos', () => {
    expect(damageEvent('c1', 1, POS).ttl).toBeLessThan(lootEvent('bone', 1, POS).ttl);
    expect(damageEvent('c1', 1, POS).ttl).toBeLessThan(xpEvent(1, POS).ttl);
  });

  it('copia a posição em vez de compartilhar a referência', () => {
    const p = { x: 5, z: 5 };
    const e = damageEvent('c1', 1, p);
    p.x = 99;
    expect(e.position.x).toBe(5);
  });
});

describe('golpe crítico', () => {
  it('reconhece a faixa alta do sorteio e ignora a baixa', () => {
    expect(isCriticalDamage(100, 0, 114)).toBe(true);
    expect(isCriticalDamage(100, 0, 90)).toBe(false);
    expect(isCriticalDamage(0, 0, 5)).toBe(false);
  });

  it('é coerente com calculateDamage: nunca marca crítico abaixo de 1,10x', () => {
    for (let i = 0; i < 200; i++) {
      const dmg = calculateDamage(100, 0);
      expect(isCriticalDamage(100, 0, dmg)).toBe(dmg >= 110);
    }
  });
});

describe('buildHealthBars', () => {
  it('exclui mortos e renascendo, inclui o jogador', () => {
    const bars = buildHealthBars({
      creatures: [
        creature({ id: 'a' }),
        creature({ id: 'b', hp: 0, behavior: 'dead' }),
        creature({ id: 'c', behavior: 'respawning' }),
        creature({ id: 'd', respawnAt: 5000 }),
      ],
      player: PLAYER, targetId: null, objective: null,
    }, 1000);
    expect(bars.map(b => b.id)).toEqual(['a', 'player']);
  });

  it('não inclui o jogador morto', () => {
    const bars = buildHealthBars({
      creatures: [], player: { ...PLAYER, dead: true, hp: 0 }, targetId: null, objective: null,
    }, 0);
    expect(bars).toHaveLength(0);
  });

  it('hostil vs pacífica vem da definição da espécie', () => {
    const bars = buildHealthBars({
      creatures: [
        creature({ id: 'w', speciesId: 'wolf' }),
        creature({ id: 'r', speciesId: 'rabbit' }),
      ],
      player: PLAYER, targetId: null, objective: null,
    }, 0);
    expect(bars.find(b => b.id === 'w')!.hostile).toBe(true);
    expect(bars.find(b => b.id === 'r')!.hostile).toBe(false);
  });

  it('destaca o alvo selecionado e o alvo do objetivo ativo', () => {
    const objective: Objective = {
      id: 'o1', kind: 'hunt_creature', targetId: 'b', position: POS, label: 'Caçar',
      status: 'active', createdAt: 0, startedAt: 0, completedAt: null, failedReason: null,
    };
    const bars = buildHealthBars({
      creatures: [creature({ id: 'a' }), creature({ id: 'b' }), creature({ id: 'c' })],
      player: PLAYER, targetId: 'a', objective,
    }, 0);
    const lit = bars.filter(b => b.highlighted).map(b => b.id);
    expect(lit).toEqual(['a', 'b']);
  });
});

describe('loot', () => {
  it('toda tabela de criatura só sorteia itens que existem', () => {
    for (const def of Object.values(CREATURES)) {
      for (const entry of def.lootTable) {
        expect(ITEMS[entry.itemId], `${def.id} -> ${entry.itemId}`).toBeDefined();
        expect(entry.chance).toBeGreaterThan(0);
        expect(entry.chance).toBeLessThanOrEqual(1);
        expect(entry.quantity).toBeGreaterThan(0);
      }
      const rolled = rollCreatureLoot(def, () => 0);
      expect(rolled).toHaveLength(def.lootTable.length);
      for (const slot of rolled) expect(ITEMS[slot.itemId!]).toBeDefined();
      expect(rollCreatureLoot(def, () => 0.9999)
        .every(s => ITEMS[s.itemId!] !== undefined)).toBe(true);
    }
  });

  it('os sete materiais novos existem e caem de alguma criatura', () => {
    const wanted = ['bone', 'sinew', 'raw_meat', 'antler', 'bear_claw', 'rabbit_foot', 'raider_token'];
    const dropped = new Set(Object.values(CREATURES).flatMap(c => c.lootTable.map(e => e.itemId)));
    for (const id of wanted) {
      expect(ITEMS[id]?.dropOnDeath, id).toBe(true);
      expect(dropped.has(id), id).toBe(true);
    }
  });

  it('receitas só usam itens válidos', () => {
    for (const r of Object.values(RECIPES)) {
      expect(ITEMS[r.result.itemId], r.id).toBeDefined();
      for (const m of r.materials) expect(ITEMS[m.itemId], `${r.id} -> ${m.itemId}`).toBeDefined();
    }
  });

  it('sprite segue a convenção por id', () => {
    expect(itemSpriteUrl('bone')).toBe('/assets/items/bone.webp');
  });
});
