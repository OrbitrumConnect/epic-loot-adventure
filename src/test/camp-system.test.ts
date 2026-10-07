import { describe, expect, it } from 'vitest';

import type { CampState, CreatureState } from '@/game/types';
import {
  CAMPS, CAMP_PLACEMENTS, PLAYER_SPAWN, WORLD_HALF, findPlacementIssues,
} from '@/game/data/camps';
import { CREATURES } from '@/game/data/creatures';
import {
  CAMP_SIGHT_MARGIN, createCamps, discoverCamps, getAliveCount, getCamp, getCampCreatures,
  getNearestLivingEnemy, getSpawnCreatureId, isCampCleared, tickCamps,
} from '@/game/systems/campSystem';
import { getDistance } from '@/game/systems/combatSystem';

const T0 = 2_000_000;

function kill(creatures: CreatureState[], ids: string[]): CreatureState[] {
  const set = new Set(ids);
  return creatures.map(c => (set.has(c.id) ? { ...c, hp: 0, behavior: 'dead' as const } : c));
}

function campById(camps: CampState[], id: string): CampState {
  const camp = getCamp(camps, id);
  if (!camp) throw new Error(`acampamento ${id} não existe`);
  return camp;
}

describe('camps · dados e posicionamento', () => {
  it('as posições atuais respeitam todas as regras de espaçamento', () => {
    expect(findPlacementIssues()).toEqual([]);
  });

  it('a regra de espaçamento realmente reprova sobreposição', () => {
    const broken = findPlacementIssues([
      { id: 'a', defId: 'raider_outpost', position: { x: 20, z: 14 } },
      { id: 'b', defId: 'blackclaw_camp', position: { x: 21, z: 15 } },
    ]);
    expect(broken.length).toBeGreaterThan(0);
    expect(broken.join(' ')).toContain('folga');

    const nearSpawn = findPlacementIssues([
      { id: 'a', defId: 'raider_outpost', position: { x: 2, z: 2 } },
    ]);
    expect(nearSpawn.join(' ')).toContain('nascedouro');
  });

  it('cobre os quatro tiers e o tier 1 é o mais próximo do nascedouro', () => {
    const tiers = CAMP_PLACEMENTS.map(p => CAMPS[p.defId]!.tier);
    expect(new Set(tiers)).toEqual(new Set([1, 2, 3, 4]));

    const byDistance = [...CAMP_PLACEMENTS].sort(
      (a, b) => getDistance(a.position, PLAYER_SPAWN) - getDistance(b.position, PLAYER_SPAWN),
    );
    const nearest = byDistance[0]!;
    expect(CAMPS[nearest.defId]!.tier).toBe(1);
    const dist = getDistance(nearest.position, PLAYER_SPAWN);
    expect(dist).toBeGreaterThanOrEqual(18);
    expect(dist).toBeLessThanOrEqual(25);
  });

  it('cada definição tem estruturas, postos, guardas e recompensa crescente', () => {
    const ordered = [...Object.values(CAMPS)].sort((a, b) => a.tier - b.tier);
    let lastGold = 0;
    let lastEnemies = 0;
    for (const def of ordered) {
      expect(def.structures.length).toBeGreaterThan(0);
      expect(def.spawns.length).toBeGreaterThan(0);
      expect(def.spawns.some(s => s.guard)).toBe(true);
      expect(def.respawnMs).toBeGreaterThan(0);
      expect(def.reward.gold).toBeGreaterThan(lastGold);
      expect(def.spawns.length).toBeGreaterThanOrEqual(lastEnemies);
      for (const spawn of def.spawns) expect(CREATURES[spawn.speciesId]).toBeDefined();
      lastGold = def.reward.gold;
      lastEnemies = def.spawns.length;
    }
  });

  it('inimigos dos acampamentos são saqueadores escalonados', () => {
    const scout = CREATURES['raider_scout']!;
    const warrior = CREATURES['raider_warrior']!;
    const brute = CREATURES['raider_brute']!;
    const shaman = CREATURES['raider_shaman']!;

    expect(scout.maxHp).toBeLessThan(warrior.maxHp);
    expect(warrior.maxHp).toBeLessThan(brute.maxHp);
    expect(brute.attackPower).toBeGreaterThan(warrior.attackPower);
    expect(brute.attackCooldown).toBeGreaterThan(warrior.attackCooldown);
    expect(shaman.attackRange).toBeGreaterThan(warrior.attackRange);
    expect(shaman.maxHp).toBeLessThan(warrior.maxHp);

    // Nível 1 com Espada de Ferro (10 + 25 de poder) mata um batedor em 2 golpes.
    const minDamage = Math.round(35 * 0.85 - scout.armor * 0.5);
    expect(minDamage * 2).toBeGreaterThanOrEqual(scout.maxHp);
  });
});

describe('campSystem · criação', () => {
  it('cria um estado por acampamento e uma criatura por posto, com ids determinísticos', () => {
    const a = createCamps(T0);
    const b = createCamps(T0 + 999);

    expect(a.camps).toHaveLength(CAMP_PLACEMENTS.length);
    const totalSpawns = CAMP_PLACEMENTS.reduce((sum, p) => sum + CAMPS[p.defId]!.spawns.length, 0);
    expect(a.creatures).toHaveLength(totalSpawns);
    expect(b.creatures.map(c => c.id)).toEqual(a.creatures.map(c => c.id));

    const outpost = campById(a.camps, 'raider_outpost');
    expect(outpost.creatureIds[0]).toBe(getSpawnCreatureId('raider_outpost', 0));
    expect(outpost.cleared).toBe(false);
    expect(outpost.discovered).toBe(false);
    expect(getAliveCount(outpost, a.creatures)).toBe(CAMPS['raider_outpost']!.spawns.length);
  });

  it('posiciona cada criatura no posto do acampamento, dentro do mapa', () => {
    const { camps, creatures } = createCamps(T0);
    for (const camp of camps) {
      const def = CAMPS[camp.defId]!;
      const mine = getCampCreatures(camp, creatures);
      expect(mine).toHaveLength(def.spawns.length);
      mine.forEach((creature, index) => {
        const spawn = def.spawns[index]!;
        expect(creature.position.x).toBeCloseTo(camp.position.x + spawn.offset.x, 5);
        expect(creature.position.z).toBeCloseTo(camp.position.z + spawn.offset.z, 5);
        expect(Math.abs(creature.position.x)).toBeLessThanOrEqual(WORLD_HALF);
        expect(Math.abs(creature.position.z)).toBeLessThanOrEqual(WORLD_HALF);
        expect(creature.hp).toBe(creature.maxHp);
      });
    }
  });
});

describe('campSystem · limpeza e recompensa', () => {
  it('só fica limpo quando o último inimigo morre', () => {
    const { camps, creatures } = createCamps(T0);
    const camp = campById(camps, 'raider_outpost');
    const ids = camp.creatureIds;

    const partial = kill(creatures, ids.slice(0, ids.length - 1));
    expect(isCampCleared(camp, partial)).toBe(false);
    expect(getAliveCount(camp, partial)).toBe(1);
    const stillFighting = tickCamps(camps, partial, T0);
    expect(stillFighting.newlyCleared).toHaveLength(0);
    expect(campById(stillFighting.camps, camp.id).cleared).toBe(false);

    const wiped = kill(creatures, ids);
    const done = tickCamps(camps, wiped, T0 + 10);
    expect(done.newlyCleared.map(c => c.id)).toEqual([camp.id]);
    const cleared = campById(done.camps, camp.id);
    expect(cleared.cleared).toBe(true);
    expect(cleared.clearedAt).toBe(T0 + 10);
    expect(cleared.respawnAt).toBe(T0 + 10 + CAMPS[camp.defId]!.respawnMs);
  });

  it('a recompensa só pode sair uma vez: ticks seguintes não reportam de novo', () => {
    const { camps, creatures } = createCamps(T0);
    const camp = campById(camps, 'raider_outpost');
    const wiped = kill(creatures, camp.creatureIds);

    const first = tickCamps(camps, wiped, T0);
    expect(first.newlyCleared).toHaveLength(1);

    const second = tickCamps(first.camps, first.creatures, T0 + 1000);
    expect(second.newlyCleared).toHaveLength(0);
    const third = tickCamps(second.camps, second.creatures, T0 + 2000);
    expect(third.newlyCleared).toHaveLength(0);
  });

  it('um acampamento limpo não afeta os outros', () => {
    const { camps, creatures } = createCamps(T0);
    const outpost = campById(camps, 'raider_outpost');
    const result = tickCamps(camps, kill(creatures, outpost.creatureIds), T0);
    expect(result.newlyCleared).toHaveLength(1);
    expect(campById(result.camps, 'blackclaw_camp').cleared).toBe(false);
  });

  it('respawn devolve as criaturas aos postos com vida cheia', () => {
    const { camps, creatures } = createCamps(T0);
    const camp = campById(camps, 'raider_outpost');
    const def = CAMPS[camp.defId]!;

    // Mata todo mundo e move os corpos para longe do posto.
    const scattered = kill(creatures, camp.creatureIds).map(c => (
      camp.creatureIds.includes(c.id) ? { ...c, position: { x: 1, z: 1 } } : c
    ));
    const cleared = tickCamps(camps, scattered, T0);
    const respawnAt = campById(cleared.camps, camp.id).respawnAt!;

    const early = tickCamps(cleared.camps, cleared.creatures, respawnAt - 1);
    expect(early.respawned).toHaveLength(0);
    expect(campById(early.camps, camp.id).cleared).toBe(true);

    const back = tickCamps(cleared.camps, cleared.creatures, respawnAt);
    expect(back.respawned.map(c => c.id)).toEqual([camp.id]);
    const restored = campById(back.camps, camp.id);
    expect(restored.cleared).toBe(false);
    expect(restored.respawnAt).toBeNull();
    expect(restored.clearedAt).toBeNull();
    expect(getAliveCount(restored, back.creatures)).toBe(def.spawns.length);

    getCampCreatures(restored, back.creatures).forEach((creature, index) => {
      const spawn = def.spawns[index]!;
      expect(creature.hp).toBe(creature.maxHp);
      expect(creature.position.x).toBeCloseTo(camp.position.x + spawn.offset.x, 5);
      expect(creature.position.z).toBeCloseTo(camp.position.z + spawn.offset.z, 5);
    });

    // Criaturas de fora do acampamento não são tocadas.
    expect(back.creatures.filter(c => !camp.creatureIds.includes(c.id)))
      .toEqual(cleared.creatures.filter(c => !camp.creatureIds.includes(c.id)));
  });

  it('nada mudou: tick devolve as mesmas referências', () => {
    const { camps, creatures } = createCamps(T0);
    const result = tickCamps(camps, creatures, T0 + 50);
    expect(result.camps).toBe(camps);
    expect(result.creatures).toBe(creatures);
  });
});

describe('campSystem · descoberta e alvos', () => {
  it('descobre só o acampamento dentro do alcance de vista, e só uma vez', () => {
    const { camps } = createCamps(T0);
    const outpost = campById(camps, 'raider_outpost');

    const far = discoverCamps(camps, { x: 0, z: 0 });
    expect(far.newlyDiscovered).toHaveLength(0);
    expect(far.camps).toBe(camps);

    const near = discoverCamps(camps, outpost.position);
    expect(near.newlyDiscovered.map(c => c.id)).toEqual([outpost.id]);
    expect(campById(near.camps, outpost.id).discovered).toBe(true);

    const again = discoverCamps(near.camps, outpost.position);
    expect(again.newlyDiscovered).toHaveLength(0);
    expect(again.camps).toBe(near.camps);
  });

  it('o alcance de vista é o raio mais a margem', () => {
    const { camps } = createCamps(T0);
    const camp = campById(camps, 'raider_outpost');
    const radius = CAMPS[camp.defId]!.radius;
    const edge = { x: camp.position.x + radius + CAMP_SIGHT_MARGIN - 0.5, z: camp.position.z };
    const beyond = { x: camp.position.x + radius + CAMP_SIGHT_MARGIN + 0.5, z: camp.position.z };
    expect(discoverCamps(camps, edge).newlyDiscovered).toHaveLength(1);
    expect(discoverCamps(camps, beyond).newlyDiscovered).toHaveLength(0);
  });

  it('o inimigo vivo mais próximo é o alvo, e mortos são ignorados', () => {
    const { camps, creatures } = createCamps(T0);
    const camp = campById(camps, 'raider_outpost');
    const first = camp.creatureIds[0]!;

    const from = creatures.find(c => c.id === first)!.position;
    expect(getNearestLivingEnemy(camp, creatures, from)?.id).toBe(first);

    const afterKill = kill(creatures, [first]);
    const next = getNearestLivingEnemy(camp, afterKill, from);
    expect(next).not.toBeNull();
    expect(next!.id).not.toBe(first);

    const wiped = kill(creatures, camp.creatureIds);
    expect(getNearestLivingEnemy(camp, wiped, from)).toBeNull();
  });
});
