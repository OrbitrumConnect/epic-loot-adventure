import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }), useAnimations: vi.fn() }));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: vi.fn(), createPortal: vi.fn() }));

/* Pedro, 25/10: "quais inimigos podemos pôr animação de arma pra atirar nos acampamentos?" → o pirata (guarda da
   frente) atira de pistola de 12 m, só no acampamento; persegue correndo, para no alcance e atira. */
describe('pirata de acampamento atira', () => {
  it('ajuste do atirador: alcance 12 m, nota de 16 m, tiro com rastro na altura do cano; resto igual', async () => {
    const { campGunnerTuning, CAMP_GUN_RANGE, CAMP_GUNNERS } = await import('@/components/world/raider');
    expect([...CAMP_GUNNERS]).toEqual(['raider_scout']);
    const base = { speed: 4.6, wanderSpeed: 1, aggroRange: 12, attackRange: 2.2, leashRange: 16, chaseTimeout: 15, provokeRange: 22, walkSpeedChase: 18, walkSpeedIdle: 9, hitVerb: 'cortou' };
    const t = campGunnerTuning(base, 0.49);
    expect(t.attackRange).toBe(CAMP_GUN_RANGE);
    expect(t.aggroRange).toBe(16);
    expect(t.shot!.height).toBeCloseTo(0.637, 3);
    expect({ ...t, attackRange: base.attackRange, aggroRange: base.aggroRange, hitVerb: base.hitVerb, shot: undefined }).toEqual({ ...base, shot: undefined });
    expect(base.attackRange).toBe(2.2); // não muta a tabela da espécie (horda segue na faca)
  }, 20_000); // importa o raider inteiro: na suíte cheia (paralela) passava dos 5 s padrão
  it('ligado: só no acampamento; clip de tiro + pistola na mão; IA solta rastro + som nos 2 golpes', () => {
    const r = fs.readFileSync('src/components/world/raider.tsx', 'utf8');
    expect(r).toMatch(/const gunner = isCampSpawn\(creatureId\) && CAMP_GUNNERS\.has\(speciesId\);/);
    expect(r).toMatch(/forceGun=\{gunner\}/);
    expect(r).toMatch(/weapon=\{gunner \? <HeldItem c=\{c\} itemId="rifle" \/> : undefined\}/); // 26/10: fuzil = o do herói
    const hero = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(hero).toMatch(/else if \(forceGun && actions\['attackGun'\]\) \{\s*atkName = 'attackGun';/);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai.match(/if \(tuning\.shot\) enemyShot\(/g)!.length).toBe(2);
  });
});
