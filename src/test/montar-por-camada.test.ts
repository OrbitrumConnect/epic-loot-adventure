import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }), useAnimations: vi.fn() }));
import { MOUNT_MAX_DY, mountByHeight, planCreatureMounts } from '@/components/world/world-entities';

/* Pedro 03/11: "verificar o que pode travar/lagar". Medido na caverna (passagem da Gávea, embaixo do maciço da Tijuca):
   90 bichos com esqueleto montados (5.446 ossos por quadro) — os do MORRO lá em cima contavam como "perto" no plano. */
describe('corpo do bicho: outra camada e longe na altura não monta', () => {
  it('mesma camada: sempre pela distância de antes (bicho no morro visto lá de baixo continua)', () => {
    expect(mountByHeight(0, 250, 0, 5)).toBe(true);
    expect(mountByHeight(1, -30, 1, 10)).toBe(true);
  });
  it('herói na caverna, bicho no morro 150 m acima: não monta; na boca (mesma altura): monta, dos dois lados', () => {
    expect(mountByHeight(0, 140, 1, -8)).toBe(false);
    expect(mountByHeight(1, -16, 0, 40)).toBe(false);   // em cima da caverna, o inimigo lá embaixo na rocha
    expect(mountByHeight(1, 7, 0, 10)).toBe(true);      // olhando pra dentro da boca
    expect(mountByHeight(0, 11, 1, 6)).toBe(true);      // de dentro, olhando pra fora da boca
    expect(MOUNT_MAX_DY).toBeGreaterThanOrEqual(10);
    expect(mountByHeight(0, 12, 1, -8.5)).toBe(false);  // cervo no morro baixo logo acima da passagem da Gávea (medido)
  });
  it('a fila respeita: o de fora da vista não entra, e o montado que saiu da vista desmonta', () => {
    const cs = [{ id: 'a', position: { x: 5, z: 0 } }, { id: 'b', position: { x: 10, z: 0 } }, { id: 'c', position: { x: 20, z: 0 } }];
    const sight = (cr: { id: string }) => cr.id !== 'b';
    const r = planCreatureMounts(cs, { x: 0, z: 0 }, 135, new Set(['b', 'c']), 'third', sight);
    expect([...r.keep]).toEqual(['c']);
    expect(r.queue).toEqual(['a']);
    // sem o filtro (Vale / sem caverna): igual a antes
    const r0 = planCreatureMounts(cs, { x: 0, z: 0 }, 135, new Set(['b', 'c']), 'third');
    expect([...r0.keep].sort()).toEqual(['b', 'c']);
    expect(r0.queue).toEqual(['a']);
  });
});
