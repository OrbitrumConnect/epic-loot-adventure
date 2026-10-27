import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* PR #11 (Caio, 23/10) reduziu a cor do MAPA e do HERÓI de 2048 pra 1024 — chão e herói borrados
   ("quebrou gráfico"). Os testes de textura só checavam o MÁXIMO; este segura o MÍNIMO do que mais
   aparece na tela. (O relevo do chão em KTX2 do PR ficou — não entra aqui.) */
function glb(f: string) {
  const b = fs.readFileSync(f);
  const jl = b.readUInt32LE(12);
  return { json: JSON.parse(b.subarray(20, 20 + jl).toString()), bin: b.subarray(20 + jl + 8) };
}
/** Largura × altura de um JPEG/PNG pelos bytes do cabeçalho. */
function dims(buf: Buffer, mime?: string): [number, number] {
  // KTX2 keeps the source dimensions in its 68-byte header; compressed data has no PNG/JPEG SOF.
  if (mime === 'image/ktx2') return [buf.readUInt32LE(20), buf.readUInt32LE(24)];
  if (buf[0] === 0x89 && buf[1] === 0x50) return [buf.readUInt32BE(16), buf.readUInt32BE(20)]; // PNG
  let i = 2; // JPEG: procura o SOF
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1]!;
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return [buf.readUInt16BE(i + 7), buf.readUInt16BE(i + 5)];
    }
    i += 2 + len;
  }
  return [0, 0];
}
function baseColorDims(file: string): [number, number] {
  const { json, bin } = glb(file);
  const tex = json.textures[json.materials[0].pbrMetallicRoughness.baseColorTexture.index];
  const source = tex.source ?? tex.extensions?.KHR_texture_basisu?.source;
  const image = json.images[source];
  const bv = json.bufferViews[image.bufferView];
  return dims(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength), image.mimeType);
}

describe('nitidez mínima do que mais aparece', () => {
  for (const [f, min] of [['map/rio-wasteland-iconic', 2048], ['red/hero-preview', 2048]] as const) {
    it(`${f}: cor (baseColor) em pelo menos ${min}px`, () => {
      const [w, h] = baseColorDims(`public/models/${f}.glb`);
      expect(Math.min(w, h)).toBeGreaterThanOrEqual(min);
    });
  }
});
