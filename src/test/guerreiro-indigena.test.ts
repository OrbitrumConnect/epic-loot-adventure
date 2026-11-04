import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { FLEE_ARMOR, fleeInsteadOfDeath, IND, indClock, indigenaMaySpawn, indigenaState, isUnkillable } from '@/game/systems/indigenaSystem';
import { deadCreature } from '@/game/state/game-store';
import { CREATURES } from '@/game/data/creatures';
import { calculateDamage } from '@/game/systems/combatSystem';
import type { CreatureState } from '@/game/types';

/* Pedro 03/11: "um indígena no mapa que aparece correndo atrás do jogador diversas vezes; não matar — dar dano até ele
   sumir; precisa ser meio forte; o dano que mataria ele, ele sai correndo e volta depois de um tempo". */
const read = (p: string) => fs.readFileSync(p, 'utf8');
const mk = (id: string): CreatureState => ({ id, speciesId: 'raider_indigena', name: 'Guerreiro Indígena', hp: 10, maxHp: 1500, attackPower: 40, armor: 14, attackCooldown: 1.6, lastAttackAt: 0, position: { x: 0, z: 0 }, behavior: 'attack', lootTable: [], respawnAt: null });

describe('Guerreiro Indígena: não morre — recua ferido e volta', () => {
  it('o golpe fatal vira RECUO (40% da vida, intocável até sumir); os outros bichos morrem como sempre', () => {
    const d = deadCreature(mk('ind_1'), 1000, () => 0.5);
    expect(d.behavior).toBe('flee');
    expect(d.hp).toBe(Math.round(1500 * IND.FLEE_HP));
    expect(d.armor).toBe(FLEE_ARMOR);
    expect(calculateDamage(99999, d.armor)).toBe(1); // todo golpe = 1 no recuo → não dá pra "abater" de novo e farmar
    expect(fleeInsteadOfDeath({ ...d, hp: 0 }).hp).toBe(1); // já recuando: não cura de novo
    expect(isUnkillable('ind_1')).toBe(true); expect(isUnkillable('wild_boar_1')).toBe(false);
    const other = deadCreature({ ...mk('wild_x'), speciesId: 'boar' }, 1000, () => 0.5);
    expect(other.behavior).toBe('dead'); expect(other.hp).toBe(0);
  });

  it('some depois de recuar (6 s ou 60 m) e volta em 2–4 min; se VOCÊ fugir (140 m), volta em ~1 min', () => {
    expect(indigenaState({ now: 10_000, fleeingSince: 9_000, dist: 20 })).toBe('stay');
    expect(indigenaState({ now: 9_000 + IND.FLEE_MS, fleeingSince: 9_000, dist: 20 })).toBe('gone_fled');
    expect(indigenaState({ now: 10_000, fleeingSince: 9_000, dist: IND.FLEE_GONE_DIST })).toBe('gone_fled');
    expect(indigenaState({ now: 10_000, fleeingSince: null, dist: IND.LEAVE_DIST + 1 })).toBe('gone_lost');
    expect(indigenaState({ now: 10_000, fleeingSince: null, dist: 30 })).toBe('stay');
    expect(IND.RETURN_MIN_MS).toBe(120_000); expect(IND.RETURN_MAX_MS).toBe(240_000);
  });

  it('aparece: 1ª após 3 min; nível 5+; longe da base e da zona segura; fora da caverna; um por vez', () => {
    indClock.startedAt = 0; indClock.nextAt = 0;
    const c = { level: 20, dead: false, inCave: false, present: false, baseDist: 300, safeDist: 300, safeR: 11 };
    expect(indigenaMaySpawn({ ...c, now: 1 })).toBe(false);
    const t = 1 + IND.FIRST_MS;
    expect(indigenaMaySpawn({ ...c, now: t })).toBe(true);
    expect(indigenaMaySpawn({ ...c, now: t, present: true })).toBe(false);
    expect(indigenaMaySpawn({ ...c, now: t, inCave: true })).toBe(false);
    expect(indigenaMaySpawn({ ...c, now: t, level: IND.MIN_LEVEL - 1 })).toBe(false);
    expect(indigenaMaySpawn({ ...c, now: t, baseDist: IND.BASE_CLEAR - 1 })).toBe(false);
  });

  it('meio forte e rápido; a IA respeita o recuo (a fila de estados não apaga); corre caçando e recuando', () => {
    const def = CREATURES['raider_indigena']!;
    expect(def.maxHp).toBeGreaterThanOrEqual(1500); expect(def.attackPower).toBeGreaterThanOrEqual(40);
    const ai = read('src/components/world/hostile-ai.ts');
    expect(ai).toMatch(/if \(!mirror && creature\.behavior === 'flee' && isUnkillable\(creatureId\)\) flee = true;/);
    expect(ai).toMatch(/const locked = cr\.behavior === 'dead' \|\| cr\.behavior === 'respawning' \|\| \(cr\.behavior === 'flee' && isUnkillable\(cr\.id\)\);/);
    const r = read('src/components/world/raider.tsx');
    expect(r).toMatch(/raider_indigena: \{ url: '\/models\/raiders\/indigena\.glb', standFixX: 0, height: 1\.95, bindFix: true/);
    expect(r).toMatch(/const stalkerRuns = isUnkillable\(creatureId\);/);
    const gs = read('src/game/state/game-store.ts');
    expect(gs).toMatch(/if \(isUnkillable\(c\.id\)\) return fleeInsteadOfDeath\(c\);/);
    expect(read('src/components/world/sorceress-stalker.tsx')).toMatch(/st\.tickIndigena\(now, heroFacing\.yaw\);/);
  });

  it('modelo: esqueleto do herói, sem animação embutida, KTX2, malha pela METADE (50 mil → 25 mil tri), leve', () => {
    const b = fs.readFileSync('public/models/raiders/indigena.glb'), j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
    const joints = new Set(j.skins[0].joints.map((i: number) => j.nodes[i].name));
    for (const n of ['mixamorig:Hips', 'mixamorig:RightHand', 'mixamorig:LeftFoot']) expect(joints.has(n)).toBe(true);
    expect(j.animations ?? []).toHaveLength(0);
    expect(j.images.every((im: { mimeType: string }) => im.mimeType === 'image/ktx2')).toBe(true);
    const tris = j.meshes.flatMap((m: { primitives: { indices: number }[] }) => m.primitives).reduce((s: number, p: { indices: number }) => s + j.accessors[p.indices].count / 3, 0);
    expect(tris).toBeLessThan(26_000);
    expect(b.length).toBeLessThan(2_000_000);
    const atk = fs.readFileSync('public/models/melee/attack_horizontal.glb'), ja = JSON.parse(atk.subarray(20, 20 + atk.readUInt32LE(12)).toString());
    expect(ja.meshes ?? []).toHaveLength(0); expect(ja.animations).toHaveLength(1);
  });
});
