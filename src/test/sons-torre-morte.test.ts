import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { distanceGain, SFX_MAX_M, TOWER_SFX_GAP_MS, WORLD_SFX } from '@/game/audio/audio-manager';

vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: vi.fn() }));

/* Pedro, 25/10: "as torres não estão fazendo barulho quando atiram; falta som de bicho morrendo — urgh, carne que
   explode". Torre = disparo de balestra; morte = splat + gemido (raider) ou rosnado (bicho), pela distância. */
describe('sons de torre e de morte', () => {
  it('volume pela distância: cheio perto, cai suave, some em 45 m', () => {
    expect(distanceGain(0)).toBe(1);
    expect(distanceGain(6)).toBe(1);
    expect(distanceGain(25)).toBeGreaterThan(0.2);
    expect(distanceGain(25)).toBeLessThan(0.4);
    expect(distanceGain(SFX_MAX_M)).toBe(0);
    expect(distanceGain(200)).toBe(0);
  });
  it('arquivos existem (gerados por scripts/gen-death-sfx.mjs) e são leves', () => {
    for (const k of Object.keys(WORLD_SFX) as (keyof typeof WORLD_SFX)[]) {
      const p = 'public' + WORLD_SFX[k].url;
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeLessThan(250_000);
    }
  });
  it('raider geme, bicho rosna', async () => {
    const { deathVoice } = await import('@/components/world/combat-feedback');
    expect(deathVoice('raider_brute')).toBe('groan');
    expect(deathVoice('wolf_alpha')).toBe('growl');
  }, 20_000); // importa o combat-feedback inteiro: na suíte cheia (paralela) passou dos 5 s
  it('ligado: as 3 formas da torre atirar tocam som (com limite); a morte toca no mesmo evento do sangue', () => {
    expect(TOWER_SFX_GAP_MS).toBeGreaterThanOrEqual(60);
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store.match(/towerSfx\(tower, state\.player\.position\);/g)!.length).toBe(3);
    const fb = fs.readFileSync('src/components/world/combat-feedback.tsx', 'utf8');
    expect(fb).toMatch(/if \(ev\.kind === 'death'\) \{ markImpact\(1\.6\); playDeathSfx\(ev\); \}/);
  });
});

/* Pedro, 25/10: "quando disparo em sequência sai apenas 1 som — devia sair o barulho de cada bala". */
describe('rajada: cada bala soa', () => {
  it('tiro do herói gira entre 4 cópias (não reinicia o mesmo som a cada 0,1 s)', async () => {
    const { audioManager, HERO_SHOT_POOL } = await import('@/game/audio/audio-manager');
    const used = new Set<HTMLMediaElement>();
    const spy = vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) { used.add(this); return Promise.resolve(); });
    for (let i = 0; i < 8; i++) audioManager.playGunShot();
    expect(used.size).toBe(HERO_SHOT_POOL);
    spy.mockRestore();
  });
});
