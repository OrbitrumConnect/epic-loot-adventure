import { describe, expect, it } from 'vitest';
import { CREATURES, scaleEnemyHp } from '@/game/data/creatures';
import { applyWorldLevel, difficultyStats, eliteChance, eliteLoot, eliteXp, hostileScale, isWorldSpawn, scalesWithWorld, worldLevel } from '@/game/systems/difficultySystem';
import type { CreatureState } from '@/game/types';

/* Pedro, 25/10 (nv 125: "andando no mapa ainda acho fácil"). Medido: do ~nv 40 em diante todo bicho do mapa morria
   com 1 golpe. Agora: escala leve + Enfurecidos (procedural pelo nível do mundo). Números aprovados pelo Pedro. */
const bear = CREATURES['bear']!;
const mk = (id: string, speciesId = 'bear'): CreatureState => ({
  id, speciesId, name: CREATURES[speciesId]!.name, hp: 10, maxHp: 10, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0,
  position: { x: 0, z: 0 }, behavior: 'patrol', lootTable: [], respawnAt: null,
});

describe('dificuldade pelo nível do mundo', () => {
  it('escala leve: nv1 = igual; nv125 = vida ×3,48 e dano ×2,86', () => {
    expect(hostileScale(1)).toEqual({ hp: 1, atk: 1 });
    expect(hostileScale(125).hp).toBeCloseTo(3.48, 2);
    expect(hostileScale(125).atk).toBeCloseTo(2.86, 2);
  });
  it('chance de Enfurecido: 0 até nv5, ~11% nv30, ~20% nv60, 35% nv125, teto 40%', () => {
    expect(eliteChance(5)).toBe(0);
    expect(eliteChance(30)).toBeCloseTo(0.112, 2);
    expect(eliteChance(60)).toBeCloseTo(0.195, 2);
    expect(eliteChance(125)).toBeCloseTo(0.35, 2);
    expect(eliteChance(250)).toBe(0.4);
  });
  it('búfalo nv125: normal 4 golpes, Enfurecido 10 (ataque 320) — antes 1', () => {
    const atk = 320;
    const n = difficultyStats(bear, 125, false), e = difficultyStats(bear, 125, true);
    expect(Math.ceil(n.maxHp / (atk - bear.armor))).toBe(4);
    expect(Math.ceil(e.maxHp / (atk - bear.armor))).toBe(10);
    expect(Math.abs(e.attackPower - n.attackPower * 2)).toBeLessThanOrEqual(1); // 2× (arredonda sobre o exato)
    expect(difficultyStats(bear, 1, false).maxHp).toBe(scaleEnemyHp(bear.maxHp)); // nv1 = o de sempre
  });
  it('só HOSTIS do mapa/acampamento: horda, chefe e pacíficos ficam de fora', () => {
    expect(isWorldSpawn('wild_bear_3')).toBe(true);
    expect(isWorldSpawn('raider_outpost_e0')).toBe(true);
    expect(isWorldSpawn('wave7_raider_brute_2')).toBe(false);
    expect(scalesWithWorld(mk('wild_deer_1', 'deer'), CREATURES['deer'])).toBe(false); // pacífico
    expect(scalesWithWorld(mk('wild_bear_1'), bear)).toBe(true);
  });
  it('Enfurecido: nome, vida cheia, loot ×2, XP +50%; renascer sorteia de novo', () => {
    const e = applyWorldLevel(mk('wild_bear_1'), bear, 125, () => 0, true); // rng 0 → sempre Enfurecido
    expect(e.elite).toBe(true);
    expect(e.name).toMatch(/Enfurecido$/);
    expect(e.hp).toBe(e.maxHp);
    expect(eliteLoot([{ itemId: 'ammo', quantity: 5 }], e)).toEqual([{ itemId: 'ammo', quantity: 10 }]);
    expect(eliteXp(100, e)).toBe(150);
    const n = applyWorldLevel(e, bear, 125, () => 0.99, true);
    expect(n.elite).toBe(false);
    expect(n.name).toBe(bear.name);
  });
  it('nível do mundo = o maior da sala', () => {
    expect(worldLevel(20, [125, 3])).toBe(125);
    expect(worldLevel(40, [])).toBe(40);
  });
});

describe('ligado no jogo', () => {
  it('IA: renascer sorteia; parado de vida cheia reescala quando o nível muda 5+; Enfurecido corre +35%', async () => {
    const fs = await import('node:fs');
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/applyWorldLevel\(back, def, currentWorldLevel\(\), Math\.random, true\)/);
    expect(ai).toMatch(/Math\.abs\(lv - creature\.scaledLevel\) >= RESCALE_STEP/);
    expect(ai).toMatch(/creature\.behavior !== 'chase' && creature\.behavior !== 'attack'/); // nunca no meio da luta
    expect(ai).toMatch(/const chaseSpeed = tuning\.speed \* CREATURE_SPEED_SCALE \* \(creature\.elite \? ELITE_SPEED : 1\);/);
    for (const f of ['beast', 'raider', 'wolf']) expect(fs.readFileSync(`src/components/world/${f}.tsx`, 'utf8')).toMatch(/\{elite && <EliteAura height=/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store.match(/eliteLoot\(scaleHordeAmmo/g)).toHaveLength(2);
    expect(store.match(/eliteXp\(creatureXp/g)).toHaveLength(2);
  });
});
