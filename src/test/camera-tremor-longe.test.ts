import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { IMPACT_NEAR, impactNear } from '@/components/world/combat-feedback';

/* Pedro 02/11: "quando a onda está rolando na minha base mas eu estou longe, a câmera fica tremendo como se eu estivesse
   lá lutando e vendo o dano". Todo golpe/abate em QUALQUER lugar dava o soco de câmera e o hit stop. */
describe('tremor de câmera só no que é comigo / perto', () => {
  it('golpe em mim = treme; golpe/abate perto (≤ 40 m) = treme; a briga da horda na base longe = não', () => {
    expect(impactNear({ onPlayer: true, position: { x: 900, z: 900 } }, 0, 0)).toBe(true);
    expect(impactNear({ position: { x: 25, z: 20 } }, 0, 0)).toBe(true);
    expect(impactNear({ position: { x: 300, z: -120 } }, 0, 0)).toBe(false);
    expect(IMPACT_NEAR).toBe(40);
  });
  it('ligado: o soco (markImpact) e o hit stop passam pelo filtro; números/partículas continuam pra todos', () => {
    const src = fs.readFileSync('src/components/world/combat-feedback.tsx', 'utf8');
    expect(src).toContain('const mine = impactNear(ev, pp.x, pp.z);');
    expect(src).toContain("if (mine && (ev.kind === 'death' || (ev.kind === 'damage' && ev.critical && !ev.onPlayer))) triggerHitStop();");
    expect(src).toContain("else if (ev.kind === 'damage' && mine) markImpact(");
    expect(src).toContain("if (ev.kind === 'damage' || ev.kind === 'death') spawnBurst(ev);");
  });
});
