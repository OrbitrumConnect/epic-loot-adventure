import { describe, expect, it } from 'vitest';
import { WANDER_MIN_STRENGTH, wanderHeading, wanderStep } from '@/components/world/wander';

/* Pedro, 25/10: de longe alguns bichos "ficam tentando ir pra um lado e pro outro". Causa: média de ÂNGULOS
   (errava na virada de 360°) + puxada pra casa que pulava 0,2→0,8 exatamente nos 5 m. */
const ang = (a: number, b: number) => { let d = Math.abs(a - b) % (2 * Math.PI); if (d > Math.PI) d = 2 * Math.PI - d; return d; };

describe('passeio dos bichos', () => {
  it('virada de 360°: direção aleatória ≈ direção de casa → segue nela (antes errava ~70°)', () => {
    // aleatória 6,0 rad (≈ −0,28) e casa a −0,3 rad, a 10 m
    const h = wanderHeading(6.0, Math.sin(-0.3) * 10, Math.cos(-0.3) * 10);
    expect(ang(h, -0.29)).toBeLessThan(0.05);
  });

  it('longe de casa puxa pra casa; perto, passeia livre', () => {
    const away = 0; // aleatória apontando +Z; casa em −Z
    expect(ang(wanderHeading(away, 0, -12), Math.PI)).toBeLessThan(0.5); // 12 m: quase direto pra casa
    expect(ang(wanderHeading(away, 0, -1), 0)).toBeLessThan(0.01);        // 1 m: segue o passeio
  });

  it('na beirada de casa não fica indo e voltando: para (pasta) em vez de tremer (simulação 20 s)', () => {
    for (const z0 of [3, 4.5, 5.5, 7, 10]) {
      let x = 0.01, z = z0, prev: number | null = null, flips = 0;
      const wander = 0; // pior caso: insiste em sair de casa (+Z) e casa puxa (−Z)
      for (let i = 0; i < 400; i++) {
        const st = wanderStep(wander, -x, -z);
        if (st.strength < WANDER_MIN_STRENGTH) { prev = null; continue; } // parado
        if (prev !== null && ang(st.heading, prev) > Math.PI / 2) flips++;
        prev = st.heading;
        x += Math.sin(st.heading) * 0.05 * st.strength; z += Math.cos(st.heading) * 0.05 * st.strength;
      }
      expect(flips, `começando a ${z0} m`).toBe(0);
    }
  });
});

describe('de longe a animação não congela (Pedro 25/10: "de longe ficam bugados, perto anima normal")', () => {
  it('bichos e raiders: longe só tira a SOMBRA; o mixer não é mais pausado', async () => {
    const fs = await import('node:fs');
    for (const f of ['src/components/world/glb-creature.tsx', 'src/components/world/glb-hero-mixamo.tsx']) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src, f).not.toMatch(/mixer\.timeScale = near \? 1 : 0/);
      expect(src, f).toMatch(/m\.castShadow = near/);
    }
  });
});
