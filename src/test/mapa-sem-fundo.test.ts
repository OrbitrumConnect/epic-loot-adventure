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

/* 26/10 (A17): o CENÁRIO de FORA da área jogável (> 95 m) foi simplificado — 682 823 → 378 793 triângulos (−45%).
   Intocados: tudo até 95 m, valas/ravinas/fundo (≤ −2,5 m) e os últimos 6 m da borda do bloco. Só a lista de
   triângulos mudou (pontos idênticos). Medido (tools/simplify-map-outside.mjs): dentro = diferença ZERO (8 281 pontos);
   faixa 90–110 m média 2 cm; 0 buracos; 2 405 olhares de câmera da beirada pra fora: média 1,6 cm, nenhum > 3 m. */
describe('mapa: cenário de fora simplificado', () => {
  const b = fs.readFileSync('public/models/map/rio-wasteland-iconic.glb');
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  const p = j.meshes[0].primitives[0];
  it('menos de 400 mil triângulos; os MESMOS 396 868 pontos e o mesmo tamanho do bloco', () => {
    expect(j.accessors[p.indices].count / 3).toBeLessThan(400_000);
    const pos = j.accessors[p.attributes.POSITION];
    expect(pos.count).toBe(396_868);
    expect(pos.min).toEqual([-32767, -4944, -30575]);
    expect(pos.max).toEqual([32767, 4944, 30575]);
  });
});
