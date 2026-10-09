import { describe, expect, it } from 'vitest';

import {
  CD_REF_LEVEL, MAX_LEVEL, XP_LINEAR_STEP, XP_SOFT_CAP, specialCooldown, xpForLevel,
} from '@/game/systems/progressionSystem';
import { ATTRIBUTE_CAPS, ATTR_REF_LEVEL, levelAttributes } from '@/game/systems/attributesSystem';

describe('escala até o nível 250 (zero regressão no começo)', () => {
  it('o teto é 250', () => {
    expect(MAX_LEVEL).toBe(250);
  });

  it('XP dos níveis 1–30 é IDÊNTICO ao da curva geométrica antiga (×1.2)', () => {
    for (let lv = 1; lv <= XP_SOFT_CAP; lv++) {
      expect(xpForLevel(lv)).toBe(Math.round(110 * Math.pow(1.2, lv - 1)));
    }
  });

  it('acima do soft cap a curva vira linear (+step por nível)', () => {
    expect(xpForLevel(XP_SOFT_CAP + 1)).toBe(xpForLevel(XP_SOFT_CAP) + XP_LINEAR_STEP);
    expect(xpForLevel(XP_SOFT_CAP + 2)).toBe(xpForLevel(XP_SOFT_CAP) + 2 * XP_LINEAR_STEP);
  });

  it('XP sobe sempre, sem explodir (nível 250 continua um número são)', () => {
    for (let lv = 1; lv < MAX_LEVEL; lv++) expect(xpForLevel(lv + 1)).toBeGreaterThan(xpForLevel(lv));
    expect(xpForLevel(MAX_LEVEL)).toBeLessThan(1_000_000);
  });

  it('atributos de nível amadurecem no nível 30 e ficam no teto acima dele', () => {
    expect(levelAttributes(ATTR_REF_LEVEL)).toEqual(ATTRIBUTE_CAPS);
    expect(levelAttributes(100)).toEqual(ATTRIBUTE_CAPS);
    expect(levelAttributes(MAX_LEVEL)).toEqual(ATTRIBUTE_CAPS);
  });

  it('cooldown do especial chega ao mínimo no nível 30 e segue no mínimo', () => {
    expect(specialCooldown(CD_REF_LEVEL)).toBe(2);
    expect(specialCooldown(100)).toBe(2);
    expect(specialCooldown(MAX_LEVEL)).toBe(2);
  });
});
