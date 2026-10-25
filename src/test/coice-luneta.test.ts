import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { gunKick } from '@/components/world/aim';

/* Pedro, 25/10 — ideias dos mods "Project Viewpoint" (Recoil / ADS & Optics), feitas leves: coice só da
   câmera (o tiro já saiu no centro → precisão/PvP iguais) e luneta em HTML no fuzil com zoom alto. */
describe('coice e luneta', () => {
  it('coice: fuzil > pistola > 0 (arco/espada sem coice)', () => {
    expect(gunKick('pistol')).toBeCloseTo(0.03);
    expect(gunKick('rifle')).toBeCloseTo(0.045);
    expect(gunKick('bow')).toBe(0);
    expect(gunKick('iron_sword')).toBe(0);
    expect(gunKick(null)).toBe(0);
  });
  it('câmera de ombro aplica o coice e ele some sozinho (~0,15 s)', () => {
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/const kick = gunKick\(selectedItemId\(st0\)\);/);
    expect(gw).toMatch(/const rk = Math\.exp\(-Math\.min\(delta, 0\.1\) \* 14\);/);
    expect(gw).toMatch(/const pitch = cameraPitch\.current \+ recoil\.current\.x;/);
  });
  it('luneta: só fuzil, mirando, zoom ≥ 2,5', () => {
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toMatch(/const scoped = active && held === 'rifle' && zoom >= SCOPE_ZOOM;/);
    expect(idx).toMatch(/const SCOPE_ZOOM = 2\.5;/);
    expect(fs.readFileSync('src/styles.css', 'utf8')).toMatch(/\.aim-scope \{/);
  });
});
