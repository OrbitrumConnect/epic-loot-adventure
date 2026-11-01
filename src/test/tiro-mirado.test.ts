import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AIMED_FAR_DAMAGE, aimedDamageScale, aimedRangeFor, weaponRangeFor } from '@/game/data/weapons';

/* Pedro 01/11: "com fuzil, vendo o inimigo, o tiro tem que ir lá — não preciso chegar 100% perto no modo 3ª pessoa com a
   câmera no ombro; no PvP o jogador não pode ter a sensação de que atira e a bala não chega; no idle curto fica legal". */
describe('tiro MIRADO (pontinho/3ª pessoa/PvP) = alcance real; piloto/idle = alcance curto', () => {
  it('alcance real: fuzil 150, pistola 60, arco 80 — nunca menor que o curto; corpo a corpo não muda', () => {
    expect(aimedRangeFor('rifle', 1)).toBe(150);
    expect(aimedRangeFor('pistol', 1)).toBe(60);
    expect(aimedRangeFor('bow', 1)).toBe(80);
    expect(weaponRangeFor('rifle', 1)).toBe(20); // o idle segue curto
    expect(aimedRangeFor('iron_sword', 50)).toBe(weaponRangeFor('iron_sword', 50));
  });
  it('dano cheio até o alcance curto; depois cai até 60% no máximo (não vira sniper de 1 tiro)', () => {
    expect(aimedDamageScale(15, 20, 150)).toBe(1);
    expect(aimedDamageScale(150, 20, 150)).toBeCloseTo(AIMED_FAR_DAMAGE);
    const mid = aimedDamageScale(85, 20, 150);
    expect(mid).toBeLessThan(1); expect(mid).toBeGreaterThan(AIMED_FAR_DAMAGE);
  });
  it('a mira (aimFire) usa o alcance real no bicho e no PvP; o piloto/clique não', () => {
    const aim = fs.readFileSync('src/components/world/aim.ts', 'utf8');
    expect(aim).toMatch(/useGameStore\.getState\(\)\.attack\(t\.id, false, true\);/);
    expect(aim).toMatch(/pvpStrike\(t\.name, t\.x, t\.z, 0\.6, \(raw\) => broadcastPlayerHit\(t\.id, raw\), false, true\)/);
    expect(aim).toMatch(/const far = skip \+ aimedRangeFor\(heldId\(st\), st\.player\.level\);/);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/const reach = aimed \? aimedRangeFor\(heldItemId, state\.player\.level\) : nearReach;/);
    expect(store).toMatch(/get\(\)\.attack\(targetId, true, aimed\)/); // a rajada do fuzil mantém o mirado
    const proj = fs.readFileSync('src/components/world/projectiles.tsx', 'utf8');
    expect(proj).toMatch(/const BULLET_SPEED = 220;/);
  });
});
