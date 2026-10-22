import { describe, expect, it } from 'vitest';
import { selectWalkableSurfaceY } from '@/components/world/terrain-collision';

describe('ponte: seleção de superfície caminhável', () => {
  it('escolhe o tabuleiro quando grade e tabuleiro ocupam o mesmo ponto', () => {
    const tabuleiroY = 0.72;
    const gradeY = 4.8;

    expect(selectWalkableSurfaceY([tabuleiroY, gradeY], 0)).toBe(tabuleiroY);
  });

  it('mantém uma rampa legítima acima do piso esperado', () => {
    expect(selectWalkableSurfaceY([1.1], 0)).toBe(1.1);
  });
});
