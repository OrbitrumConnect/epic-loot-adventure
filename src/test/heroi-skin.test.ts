import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_HERO_SKIN, HERO_SKIN_IDS, HERO_SKINS, heroSkinOf } from '@/game/data/hero-skins';
import { useGameStore } from '@/game/state/game-store';
import { createLocalSave, parseLocalSave, restoreLocalSave, SAVED_PLAYER_KEYS } from '@/game/systems/persistenceSystem';

/* Pedro 03/11: "o herói pôr no local do herói; logou escolhe o homem ou a mulher — mulher soldada". Personagens do
   Meshy com o MESMO esqueleto do herói de antes (ossos renomeados pro padrão Mixamo no preparo). */
const glbJson = (url: string) => {
  const b = fs.readFileSync('public' + url);
  return JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString()) as {
    nodes: { name?: string }[]; skins?: { joints: number[] }[]; animations?: unknown[]; images?: { mimeType?: string }[];
  };
};
const HERO_JOINTS = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase', 'RightUpLeg',
  'RightLeg', 'RightFoot', 'RightToeBase'].map((n) => 'mixamorig:' + n);

describe('skins do herói (homem / mulher)', () => {
  it('2 skins; qualquer valor desconhecido (save antigo, cliente velho) vira homem', () => {
    expect(HERO_SKIN_IDS).toEqual(['homem', 'mulher']);
    expect(DEFAULT_HERO_SKIN).toBe('homem');
    expect(heroSkinOf(undefined).id).toBe('homem');
    expect(heroSkinOf('xyz').id).toBe('homem');
    expect(heroSkinOf('mulher').id).toBe('mulher');
  });

  it('cada skin: o esqueleto do herói (os mesmos ossos das ~30 animações), sem animação embutida, textura KTX2, retrato', () => {
    for (const id of HERO_SKIN_IDS) {
      const s = HERO_SKINS[id];
      const j = glbJson(s.url);
      const joints = new Set(j.skins![0]!.joints.map((i) => j.nodes[i]!.name));
      for (const n of HERO_JOINTS) expect(joints.has(n), `${id}: ${n}`).toBe(true);
      expect(j.animations ?? []).toHaveLength(0);
      expect((j.images ?? []).every((im) => im.mimeType === 'image/ktx2')).toBe(true);
      expect(fs.statSync('public' + s.url).size).toBeLessThan(3_000_000); // ~11 MB brutos → ~2,4 MB
      expect(fs.existsSync('public' + s.portrait)).toBe(true);
      expect(s.bindFix).toBe(true); // GLB do Meshy: esqueleto salvo noutra pose (mesmo caso dos raiders)
    }
  });

  it('vai no save da conta: grava, valida, volta; save antigo sem skin carrega (e a tela de escolha aparece)', () => {
    const st = useGameStore.getState();
    expect(SAVED_PLAYER_KEYS).toContain('skin');
    const withSkin = createLocalSave({ ...st, player: { ...st.player, skin: 'mulher' } });
    expect(withSkin.player.skin).toBe('mulher');
    const parsed = parseLocalSave(JSON.stringify(withSkin))!;
    expect(parsed.player.skin).toBe('mulher');
    expect(restoreLocalSave(parsed, st, Date.now()).player.skin).toBe('mulher');
    const legacy = createLocalSave({ ...st, player: { ...st.player, skin: undefined } });
    expect('skin' in legacy.player).toBe(false);
    expect(parseLocalSave(JSON.stringify(legacy))!.player.skin).toBeUndefined();
    const bad = JSON.parse(JSON.stringify(withSkin)); bad.player.skin = 'robo';
    expect(parseLocalSave(JSON.stringify(bad))).toBeNull(); // valor estranho não entra
  });

  it('o herói é desenhado pela skin nos 4 lugares (Vale, Zona Sul, ficha, online) e a rede leva a escolha', () => {
    const read = (p: string) => fs.readFileSync(p, 'utf8');
    expect(read('src/components/game-world.tsx')).toMatch(/<LocalHeroBody actionRef=\{heroAction\}/);
    expect(read('src/components/zona-sul/zona-sul-world.tsx')).toMatch(/<LocalHeroBody actionRef=\{action\} speedRef=\{speed\}/);
    expect(read('src/components/hud/hero-preview.tsx')).toMatch(/<LocalHeroBody noNet /);
    const rp = read('src/components/world/remote-players.tsx');
    expect(rp).toMatch(/const skin = heroSkinOf\(useNet\(\(s\) => s\.players\[id\]\?\.sk\)\);/);
    expect(rp.match(/<GlbHeroMixamo key=\{skin\.id\} charUrl=\{skin\.url\} bindFix=\{skin\.bindFix\}/g)).toHaveLength(2);
    const mp = read('src/net/multiplayer.ts');
    expect(mp).toMatch(/\.\.\.\(poseSkin === 'mulher' \? \{ sk: 'mulher' as const \} : \{\}\),/);
    expect(read('src/components/world/glb-hero-mixamo.tsx')).toMatch(/preloadKTX2GLTF\(HERO_SKINS\.homem\.url\);/);
    const idx = read('src/routes/index.tsx');
    expect(idx).toMatch(/\{worldOn && <HeroSkinPicker waitAccount=\{AUTH_ENABLED && !!authUser\} \/>\}/);
  });
});
