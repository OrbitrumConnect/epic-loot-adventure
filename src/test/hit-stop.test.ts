import fs from 'node:fs';
import { beforeEach, describe, expect, it } from 'vitest';
import { HIT_STOP_GAP_MS, HIT_STOP_MS, hitStopActive, hitStopScale, resetHitStop, triggerHitStop } from '@/components/world/hit-stop';

/* Pedro, 25/10 (checklist do dia, item 2): congelada curta da animação no crítico/abate — peso no combate. */
beforeEach(() => resetHitStop());

describe('hit stop', () => {
  it('congela ~55 ms e volta', () => {
    expect(triggerHitStop(1000)).toBe(true);
    expect(hitStopActive(1000 + HIT_STOP_MS - 1)).toBe(true);
    expect(hitStopScale(1010)).toBeLessThan(0.1);
    expect(hitStopActive(1000 + HIT_STOP_MS + 1)).toBe(false);
    expect(hitStopScale(1100)).toBe(1);
  });
  it('no máximo 1 a cada 250 ms (piloto batendo sem parar não vira tremedeira)', () => {
    triggerHitStop(1000);
    expect(triggerHitStop(1000 + HIT_STOP_GAP_MS - 1)).toBe(false);
    expect(triggerHitStop(1000 + HIT_STOP_GAP_MS)).toBe(true);
  });
  it('dispara no crítico e no abate (nunca no golpe que eu tomo); mixers de bicho e herói obedecem', () => {
    const fb = fs.readFileSync('src/components/world/combat-feedback.tsx', 'utf8');
    expect(fb).toMatch(/if \(ev\.kind === 'death' \|\| \(ev\.kind === 'damage' && ev\.critical && !ev\.onPlayer\)\) triggerHitStop\(\);/);
    for (const f of ['glb-creature', 'glb-hero-mixamo']) expect(fs.readFileSync(`src/components/world/${f}.tsx`, 'utf8')).toMatch(/if \(mixer\) mixer\.timeScale = hitStopScale\(\);/);
  });
});
