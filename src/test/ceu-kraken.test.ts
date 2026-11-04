import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boltPath, boltSpot, flashAt, nextBoltIn, OMEN, omenEase, omenTarget, omenWeight, STORM } from '@/components/zona-sul/zs-omen';

/* Pedro, 04/11: "quando ele nasce o dia vira fim de tarde meio avermelhado escuro — o dia normal que já temos, só fim de
   tarde pra noite! … o que mais dá pra deixar mais cinematográfico sem perder FPS: ventos? raios? nuvem?" e "olho dele luz
   vermelha?! e/ou alguma neon luz leve no tentáculo … matou ele, volta o normal o dia, né?!" */
describe('céu do Kraken (fim de tarde)', () => {
  it('só com ele acordado, inteiro até 900 m e some até 1,6 km (cada jogador pela própria distância)', () => {
    expect(omenTarget(false, 0)).toBe(0);
    expect(omenTarget(true, 0)).toBe(1);
    expect(omenTarget(true, OMEN.FULL_M)).toBe(1);
    expect(omenTarget(true, OMEN.FADE_M)).toBe(0);
    expect(omenTarget(true, 5000)).toBe(0);
    const mid = omenTarget(true, (OMEN.FULL_M + OMEN.FADE_M) / 2);
    expect(mid).toBeGreaterThan(0.4); expect(mid).toBeLessThan(0.6);
    expect(omenTarget(true, Infinity)).toBe(0);
    expect(omenTarget(true, NaN)).toBe(0);
  });

  it('escurece em ~5 s (ele sobe em 6) e o dia volta em ~8 s quando ele morre/afunda', () => {
    let k = 0, t = 0;
    while (k < 1 && t < 20) { k = omenEase(k, 1, 0.1); t += 0.1; }
    expect(t).toBeCloseTo(OMEN.IN_S, 0);
    t = 0;
    while (k > 0 && t < 20) { k = omenEase(k, 0, 0.1); t += 0.1; }
    expect(t).toBeCloseTo(OMEN.OUT_S, 0);
    expect(omenEase(0.5, 0.5, 1)).toBe(0.5);
  });

  it('de NOITE não muda nada (a noite já é mais escura — não clareia); de dia entra inteiro', () => {
    expect(omenWeight(1, 1)).toBe(0);
    expect(omenWeight(1, 0)).toBe(1);
    expect(omenWeight(0, 0)).toBe(0);
    expect(omenWeight(0.5, 0)).toBeCloseTo(0.5, 5);
    expect(omenWeight(1, 0.5)).toBeCloseTo(0.5, 5);
  });

  it('o fim de tarde fica entre o dia (1,5 / 0,35) e a noite de lua (0,65 / 0,23); céu com o sol rente ao horizonte', () => {
    expect(OMEN.HEMI).toBeLessThan(1.5); expect(OMEN.HEMI).toBeGreaterThan(0.65);
    expect(OMEN.AMB).toBeLessThan(0.35); expect(OMEN.AMB).toBeGreaterThan(0.23);
    expect(OMEN.SKY_HOUR).toBeGreaterThan(17.5); expect(OMEN.SKY_HOUR).toBeLessThan(18.5);
  });

  it('é só VISUAL: não mexe no relógio nem na noite dos bichos/postes', () => {
    const omen = fs.readFileSync('src/components/zona-sul/zs-omen.ts', 'utf8');
    expect(omen).not.toMatch(/from '@\/game\/systems\/dayNightSystem'/);
    const dn = fs.readFileSync('src/components/zona-sul/zs-daynight.tsx', 'utf8');
    expect(dn).toMatch(/const w = omenWeight\(o\.k, nf\);/);
    expect(dn).not.toMatch(/setWorldEpoch/);
    // o céu de sempre vem de uma constante só (a Zona Sul monta com ela; o céu do Kraken volta pra ela)
    const world = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(world).toMatch(/<Sky ref=\{skyRef\} sunPosition=\{sunPos\} turbidity=\{ZS_SKY\.turbidity\} rayleigh=\{ZS_SKY\.rayleigh\} mieCoefficient=\{ZS_SKY\.mieCoefficient\}/);
    expect(dn).toMatch(/export const ZS_SKY = \{ turbidity: 5, rayleigh: 1\.4, mieCoefficient: 0\.006 \}/);
  });

  it('o Kraken liga pela distância do MEU herói e desliga ao sair da Zona Sul', () => {
    const v = fs.readFileSync('src/components/zona-sul/zs-kraken-boss-view.tsx', 'utf8');
    expect(v).toMatch(/zsOmen\.target = omenTarget\(whirlpoolOn\(K\.phase\), dHero\);/);
    expect(v).toMatch(/audioManager\.setBossMusic\(false\); zsOmen\.target = 0;/);
  });
});

describe('tempestade (nuvem + raios)', () => {
  it('raio a cada 3–8 s, caindo no anel de 60–380 m em volta dele', () => {
    expect(nextBoltIn(0)).toBe(STORM.BOLT_MIN_S);
    expect(nextBoltIn(1)).toBe(STORM.BOLT_MAX_S);
    expect(nextBoltIn(-5)).toBe(STORM.BOLT_MIN_S);
    for (const [a, b] of [[0, 0], [0.3, 1], [0.99, 0.5]] as const) {
      const p = boltSpot(-248, 932, a, b), d = Math.hypot(p.x + 248, p.z - 932);
      expect(d).toBeGreaterThanOrEqual(STORM.BOLT_R_MIN - 1e-6); expect(d).toBeLessThanOrEqual(STORM.BOLT_R_MAX + 1e-6);
    }
  });

  it('zigue-zague sai da nuvem e termina EXATAMENTE no ponto sorteado, sempre descendo', () => {
    let seed = 7;
    const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const pts = boltPath(rand, 10, 20, 260, 0);
    expect(pts).toHaveLength(STORM.BOLT_SEGS + 1);
    expect(pts[0]![1]).toBe(260);
    const end = pts[pts.length - 1]!;
    expect(end[0]).toBeCloseTo(10, 6); expect(end[1]).toBeCloseTo(0, 6); expect(end[2]).toBeCloseTo(20, 6);
    for (let i = 1; i < pts.length; i++) expect(pts[i]![1]).toBeLessThan(pts[i - 1]![1]);
    // desvia pros lados (não é reta), mas sem fugir longe
    const side = Math.max(...pts.map((q) => Math.hypot(q[0] - 10, q[2] - 20)));
    expect(side).toBeGreaterThan(1); expect(side).toBeLessThan(120);
  });

  it('clarão pisca 2× e some em 0,45 s', () => {
    expect(flashAt(0)).toBe(1);
    expect(flashAt(0.07)).toBeLessThan(0.5);
    expect(flashAt(0.12)).toBeGreaterThan(0.7);
    expect(flashAt(STORM.FLASH_S)).toBe(0);
    expect(flashAt(-1)).toBe(0);
    expect(flashAt(NaN)).toBe(0);
  });

  it('montada no Kraken; some junto com o céu; o clarão soma na luz (não na caverna); celular só 1 camada', () => {
    const v = fs.readFileSync('src/components/zona-sul/zs-kraken-boss-view.tsx', 'utf8');
    expect(v).toMatch(/<ZsKrakenStorm \/>/);
    const st = fs.readFileSync('src/components/zona-sul/zs-kraken-storm.tsx', 'utf8');
    expect(st).toMatch(/const show = k > 0\.01;/);
    expect(st).toMatch(/if \(k >= STORM\.MIN_K\)/);
    expect(st).toMatch(/parts\.low\.visible = !touchLayout\.on;/);
    const dn = fs.readFileSync('src/components/zona-sul/zs-daynight.tsx', 'utf8');
    expect(dn).toMatch(/const fl = o\.flash \* \(1 - dk\);/);
    expect(dn).toMatch(/\+ fl \* STORM\.FLASH_HEMI/);
  });
});

describe('olhos vermelhos + neon leve nos tentáculos', () => {
  const v = fs.readFileSync('src/components/zona-sul/zs-kraken-boss-view.tsx', 'utf8');
  it('olhos vermelhos presos nos ossos da cabeça (acompanham a animação) e somem quando ele afunda morto', () => {
    expect(v).toMatch(/EYE_COLOR: '#ff2a14'/);
    expect(v).toMatch(/if \(\/headfront\/i\.test\(o\.name\)\) f = o; else if \(\/Head\$\/\.test\(o\.name\)\) h = o;/);
    expect(v).toMatch(/eyeK = K\.phase === 'dead' \? Math\.max\(0, 1 - deadSink \/ \(outH \* 0\.3\)\) : S\.rise/);
  });
  it('neon = mapa de brilho no MESMO material (sem luz nova), pulso leve', () => {
    expect(v).toMatch(/emissive: '#ffffff', emissiveMap: makeNeonTexture\(\), emissiveIntensity: KRAKEN_LOOK\.NEON_MIN/);
    expect(v).toMatch(/NEON_MIN: 0\.3,\n  NEON_MAX: 0\.55,/);
    expect(v).toMatch(/g\.fillStyle = '#1a0610'; g\.fillRect\(0, 0, 64, 128\); \/\/ = o emissive antigo/);
    expect(v).not.toMatch(/new THREE\.PointLight/);
  });
});
