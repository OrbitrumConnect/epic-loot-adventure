import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Pedro, 24/10: o mapa (IA) veio como BLOCO 3D — o jogável é só a "capa de cima". Removidos os triângulos
   do fundo/laterais enterradas que estão INTEIROS abaixo de −4,5 m, COBERTOS pelo chão e longe da borda
   externa (76 mil, −10%). Vértices intactos → o tamanho do bloco (que o jogo usa pra escalar/posicionar)
   não muda. Conferido: 20 mil raios verticais + 34 mil inclinados tipo câmera = zero diferença. */
describe('mapa sem o fundo invisível', () => {
  const b = fs.readFileSync('public/models/map/rio-wasteland-iconic.glb');
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  let tris = 0;
  for (const m of j.meshes) for (const p of m.primitives) tris += j.accessors[p.indices].count / 3;
  it('menos de 700 mil triângulos (era 759 mil)', () => expect(tris).toBeLessThan(700_000));
  it('cor 2048 JPEG + relevo KTX2 seguem no arquivo', () => {
    expect(j.images.map((i: { mimeType: string }) => i.mimeType)).toEqual(['image/jpeg', 'image/ktx2']);
  });
});
