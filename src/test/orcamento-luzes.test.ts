import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { lightAllowed, MOBILE_LIGHTS } from '@/components/world/light-budget';

/* 26/10 (A17 do Caio): cada luz pontual acesa pesa no desenho de tudo. PC igual; celular só as 4 mais perto. */
describe('orçamento de luzes', () => {
  it('PC (sem limite): todas que querem acendem, igual antes', () => {
    for (let i = 0; i < 10; i++) expect(lightAllowed(1000 + i, true, i * 10, 0, Infinity)).toBe(true);
    for (let i = 0; i < 10; i++) lightAllowed(1000 + i, false, 0, 0, Infinity);
  });
  it('celular: só as 4 mais perto; a 5ª (mais longe) apaga; quem não quer acender não ocupa vaga', () => {
    const t = 10_000;
    const ds = [400, 100, 900, 25, 225]; // a de 900 é a mais longe
    ds.forEach((d, i) => lightAllowed(2000 + i, true, d, t, MOBILE_LIGHTS));
    const on = ds.map((d, i) => lightAllowed(2000 + i, true, d, t, MOBILE_LIGHTS));
    expect(on).toEqual([true, true, false, true, true]);
    expect(lightAllowed(2001, false, 100, t, MOBILE_LIGHTS)).toBe(false); // de dia/longe: sai da conta
    expect(lightAllowed(2002, true, 900, t, MOBILE_LIGHTS)).toBe(true);   // e a vaga vai pra próxima
    ds.forEach((_, i) => lightAllowed(2000 + i, false, 0, t, MOBILE_LIGHTS));
  });
  it('luz que sumiu (desmontou) há > 0,5 s sai da conta sozinha', () => {
    for (let i = 0; i < 4; i++) lightAllowed(3000 + i, true, i, 0, MOBILE_LIGHTS);
    expect(lightAllowed(3010, true, 999, 100, MOBILE_LIGHTS)).toBe(false);
    expect(lightAllowed(3010, true, 999, 1000, MOBILE_LIGHTS)).toBe(true); // as 4 não se anunciaram mais
    lightAllowed(3010, false, 0, 1000, MOBILE_LIGHTS);
  });
  it('ligado nas 6 luzes: fogueiras, postes, casa, refletores das torres e fogueira (fogo + brasa) do acampamento', () => {
    const n = (f: string) => (fs.readFileSync(f, 'utf8').match(/lightAllowed\(/g) ?? []).length;
    expect(n('src/components/game-world.tsx')).toBe(2);
    expect(n('src/components/world/base-house.tsx')).toBe(1);
    expect(n('src/components/world/base-night-lights.tsx')).toBe(1);
    expect(n('src/components/world/camp.tsx')).toBe(2);
  });
});
