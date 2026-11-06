import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_LAIR, CAVE_ROOMS, LAIR_SKY, caveField, lairCeilingY, setCaveTerrain } from '@/components/zona-sul/zs-cave';

/* Pedro, 06/11 (jogando o Canibal): "o olho do boss está meio estourado, o vermelho" · "parece que o machado sai da mão
   dele" · "a cena é um pouco escura — pode ter algo que ilumine ali, uma claraboia, algo assim". */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});
const covil = CAVE_ROOMS.find((r) => r.id === 'covil')!;
const view = () => fs.readFileSync('src/components/zona-sul/zs-cave-view.tsx', 'utf8');
const boss = () => fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');

describe('CLARABOIA do covil (06/11)', () => {
  it('a fresta fica no TETO do covil, no meio; a luz do dia fica no ar da caverna, lá no alto, e alcança o chão', () => {
    const ceil = lairCeilingY();
    expect(ceil).toBeGreaterThan(covil.y + 0.9 * covil.h);             // teto de verdade (o covil tem 125 m de pé-direito)
    expect(ceil).toBeLessThan(covil.y + covil.h + covil.lobe + 8);
    expect(caveField(covil.x, ceil - 0.5, covil.z)).toBeLessThan(0.5); // logo abaixo é ar (a boca clara fica na rocha)
    const ly = ceil - LAIR_SKY.light.below;
    expect(caveField(covil.x, ly, covil.z)).toBeLessThan(0);           // a luz no AR (o pool só acende luz da camada do herói)
    expect(LAIR_SKY.light.d).toBeGreaterThan(ly - CAVE_LAIR.floor);    // alcança o chão da arena
    expect(LAIR_SKY.beamR).toBeLessThan(covil.rx * 0.5);               // o facho cai no meio da arena
  });
  it('só com o herói no FUNDO do covil, pelo POOL de luzes (sem luz nova) — e a boca/facho somem fora dali', () => {
    const v = view();
    expect(v).toContain('if (inLair && zsCave.deep) {');
    expect(v).toContain('requestLight(lr.x, sky.ceil - LAIR_SKY.light.below, lr.z, SKY_LIGHT, LAIR_SKY.light.i, LAIR_SKY.light.d, LAIR_SKY.light.decay);');
    expect(v).toContain('sky.g.visible = false;\n    if (!near) return;'.replace(/\n/g, v.includes('\r\n') ? '\r\n' : '\n'));
    expect(v).not.toMatch(/new THREE\.(PointLight|SpotLight|DirectionalLight)/);
  });
});

describe('Canibal: olhos no rosto e machado na mão (06/11)', () => {
  it('olhos achados na MALHA da cabeça, presos no osso, do tamanho da cabeça (antes: brasa 0,7 m + halo 4 m fixos)', () => {
    const b = boss();
    expect(b).toContain('function faceEyes(sm: THREE.SkinnedMesh, head: THREE.Object3D)');
    expect(b).toContain("export const CANIBAL_EYES = { UP: 0.55, SEP: 0.16, CORE: 0.045, HALO: 0.42, OUT: 0.08 } as const;");
    expect(b).toContain('e.glow.scale.setScalar(hw * CANIBAL_EYES.HALO * glow);');
  });
  it('a pega do machado cresce com o corpo (antes: 9 cm de gente — no pulso do gigante)', () => {
    const b = boss();
    expect(b).toContain('export const CANIBAL_GRIP: [number, number, number] = [0.04, 0.04, 0.08].map((v) => (v * CANIBAL.BODY_H) / 1.8)');
    expect(b).toContain('gripPos={CANIBAL_GRIP}');
  });
});
