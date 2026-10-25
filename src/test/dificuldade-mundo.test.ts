import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { CREATURES, scaleEnemyHp } from '@/game/data/creatures';
import { PLAYER_SPAWN } from '@/game/data/camps';
import { applyWorldLevel, difficultyStats, eliteChance, eliteLoot, eliteXp, hostileScale, isWorldSpawn, scalesWithWorld, zoneAt, zoneLevel, ZONE_LEVEL } from '@/game/systems/difficultySystem';
import type { CreatureState } from '@/game/types';

/* Pedro, 25/10. 1ª versão escalava pelo nível do JOGADOR — fora da regra selada "nível não é porta" (07/10: a REGIÃO
   define o perigo, sem level-scaling no overworld). Agora: ZONA pela distância do nascedouro + noite. Enfurecidos
   mantidos (3× vida, 2× dano, +35% velocidade, fumaça vermelha, loot ×2, XP +50%). */
const bear = CREATURES['bear']!;
const mk = (id: string, speciesId = 'bear'): CreatureState => ({
  id, speciesId, name: CREATURES[speciesId]!.name, hp: 10, maxHp: 10, attackPower: 1, armor: 0, attackCooldown: 1, lastAttackAt: 0,
  position: { x: 0, z: 0 }, behavior: 'patrol', lootTable: [], respawnAt: null,
});
const at = (d: number) => ({ x: PLAYER_SPAWN.x + d, z: PLAYER_SPAWN.z });

describe('perigo pela geografia', () => {
  it('zonas pela distância do nascedouro: <30 m = 1 … ≥105 m = 5', () => {
    expect(zoneAt(at(0))).toBe(1);
    expect(zoneAt(at(29))).toBe(1);
    expect(zoneAt(at(40))).toBe(2);
    expect(zoneAt(at(70))).toBe(3);
    expect(zoneAt(at(90))).toBe(4);
    expect(zoneAt(at(120))).toBe(5);
    expect(zoneLevel(at(0))).toBe(1); // zona 1 = o jogo de sempre (novato protegido)
  });
  it('zona 1 sem Enfurecido; zona 5 ~36%; noite +10% (teto 40%)', () => {
    expect(eliteChance(ZONE_LEVEL[0])).toBe(0);
    expect(eliteChance(ZONE_LEVEL[0], true)).toBe(0); // nascedouro protegido até de noite
    expect(eliteChance(ZONE_LEVEL[1])).toBeCloseTo(0.112, 2);
    expect(eliteChance(ZONE_LEVEL[4])).toBeCloseTo(0.361, 2);
    expect(eliteChance(ZONE_LEVEL[2], true)).toBeCloseTo(eliteChance(ZONE_LEVEL[2]) + 0.1, 5);
    expect(eliteChance(ZONE_LEVEL[4], true)).toBe(0.4);
  });
  it('escala pela zona: zona 1 = igual; zona 5 = vida ×3,58 / dano ×2,94', () => {
    expect(hostileScale(ZONE_LEVEL[0])).toEqual({ hp: 1, atk: 1 });
    expect(hostileScale(ZONE_LEVEL[4]).hp).toBeCloseTo(3.58, 2);
    expect(difficultyStats(bear, ZONE_LEVEL[0], false).maxHp).toBe(scaleEnemyHp(bear.maxHp));
  });
  it('só HOSTIS do mapa/acampamento: horda, chefe e pacíficos ficam de fora', () => {
    expect(isWorldSpawn('wild_bear_3')).toBe(true);
    expect(isWorldSpawn('raider_outpost_e0')).toBe(true);
    expect(isWorldSpawn('wave7_raider_brute_2')).toBe(false);
    expect(scalesWithWorld(mk('wild_deer_1', 'deer'), CREATURES['deer'])).toBe(false);
    expect(scalesWithWorld(mk('wild_bear_1'), bear)).toBe(true);
  });
  it('Enfurecido: nome, vida cheia, loot ×2, XP +50%; renascer sorteia de novo', () => {
    const e = applyWorldLevel(mk('wild_bear_1'), bear, ZONE_LEVEL[4], () => 0, true);
    expect(e.elite).toBe(true);
    expect(e.name).toMatch(/Enfurecido$/);
    expect(e.hp).toBe(e.maxHp);
    expect(eliteLoot([{ itemId: 'ammo', quantity: 5 }], e)).toEqual([{ itemId: 'ammo', quantity: 10 }]);
    expect(eliteXp(100, e)).toBe(150);
    expect(applyWorldLevel(e, bear, ZONE_LEVEL[4], () => 0.99, true).elite).toBe(false);
  });
});

describe('ligado no jogo (sem nível do jogador)', () => {
  it('IA usa a zona da CASA do bicho (1ª vez + renascer, com noite); nada de nível do jogador', () => {
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/applyWorldLevel\(back, def, zoneLevel\(home\), Math\.random, true, isNight\(\)\)/);
    expect(ai).toMatch(/const lv = zoneLevel\(homePos\.current\);/);
    expect(ai).not.toMatch(/player\.level/);
    expect(ai).toMatch(/const chaseSpeed = tuning\.speed \* CREATURE_SPEED_SCALE \* \(creature\.elite \? ELITE_SPEED : 1\)( \* hordeSpeedScale\(creatureId, creature\.speciesId\))?;/);
    for (const f of ['beast', 'raider', 'wolf']) expect(fs.readFileSync(`src/components/world/${f}.tsx`, 'utf8')).toMatch(/\{elite && <EliteAura height=/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store.match(/eliteLoot\(scaleHordeAmmo/g)).toHaveLength(2);
    expect(store.match(/eliteXp\(creatureXp/g)).toHaveLength(2);
  });
});
