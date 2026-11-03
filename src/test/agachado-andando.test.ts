import { NodeIO } from '@gltf-transform/core';
import { describe, expect, it } from 'vitest';
import { CROUCH_WALK_CLIP_SPEED, HERO_EXTRA_CLIPS } from '@/components/world/hero-moves';

/* Pedro 02/11: "ele abaixa ok, mas ao andar fica bugando". O clip antigo ("crouching" do Sword&Shield) era a transição
   agachado → EM PÉ: em loop o quadril ia de 0,50 a 0,96 m a cada meio segundo (medido no jogo). O novo é o nosso walk
   agachado (tools/crouch-walk-bake.mjs). */
const hipsTrack = async (f: string) => {
  const doc = await new NodeIO().read('public' + f), an = doc.getRoot().listAnimations()[0]!;
  const ch = an.listChannels().find((c) => /hips$/i.test((c.getTargetNode()?.getName() ?? '').replace(/[^a-z]/gi, '')) && c.getTargetPath() === 'translation')!;
  const t = ch.getSampler()!.getInput()!.getArray() as ArrayLike<number>, v = ch.getSampler()!.getOutput()!.getArray() as ArrayLike<number>;
  return { t: Array.from(t), y: Array.from({ length: t.length }, (_, i) => v[i * 3 + 1]!), z: Array.from({ length: t.length }, (_, i) => v[i * 3 + 2]!) };
};

describe('andar agachado', () => {
  it('é andar de verdade: o quadril fica BAIXO o ciclo todo (não levanta), ciclo de 1 s', async () => {
    const cw = await hipsTrack(HERO_EXTRA_CLIPS.crouchWalk), walk = await hipsTrack('/models/red/walk.glb');
    const standY = walk.y.reduce((a, b) => a + b, 0) / walk.y.length;
    expect(Math.max(...cw.y)).toBeLessThan(standY * 0.7);              // sempre agachado (o antigo chegava em pé)
    expect(Math.max(...cw.y) - Math.min(...cw.y)).toBeLessThan(0.12);   // sobe/desce só o balanço do passo
    expect(cw.t[cw.t.length - 1]! - cw.t[0]!).toBeCloseTo(1, 3);
  });
  it('a velocidade do clip no código = o quanto ele anda (o pé não patina)', async () => {
    const cw = await hipsTrack(HERO_EXTRA_CLIPS.crouchWalk);
    const dur = cw.t[cw.t.length - 1]! - cw.t[0]!, travel = cw.z[cw.z.length - 1]! - cw.z[0]!;
    expect(travel / dur).toBeCloseTo(CROUCH_WALK_CLIP_SPEED, 2);
  });
});
