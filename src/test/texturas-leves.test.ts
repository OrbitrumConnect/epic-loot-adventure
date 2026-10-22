import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/* VRAM (22/10): textura 4096 = ~85 MB na placa de vídeo, cada uma. As texturas foram reduzidas
   SÓ na imagem (malha/ossos/animação idênticos, provado byte a byte). Este guarda impede que um
   modelo novo/antigo volte com textura gigante sem ninguém perceber. */
const LIMIT_DEFAULT = 1024;
const LIMIT: Record<string, number> = {
  'red/hero-preview.glb': 2048, // herói: visto de perto o tempo todo
  'map/rio-wasteland-iconic.glb': 2048, // chão do mapa inteiro
  'red/red.glb': 2048, // não carregado pelo jogo (referência antiga)
  'props/container.glb': 4096, // desligado (COUNT=0) — não carrega
};

/** Largura/altura lendo só o cabeçalho (PNG / JPEG / WebP). */
function imageSize(b: Buffer): [number, number] | null {
  if (b.readUInt32BE(0) === 0x89504e47) return [b.readUInt32BE(16), b.readUInt32BE(20)];
  if (b[0] === 0xff && b[1] === 0xd8) {
    let o = 2;
    while (o < b.length) {
      if (b[o] !== 0xff) { o++; continue; }
      const m = b[o + 1]!;
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.readUInt16BE(o + 7), b.readUInt16BE(o + 5)];
      o += 2 + b.readUInt16BE(o + 2);
    }
    return null;
  }
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = b.toString('ascii', 12, 16);
    if (chunk === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
    if (chunk === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
    if (chunk === 'VP8L') { const v = b.readUInt32LE(21); return [1 + (v & 0x3fff), 1 + ((v >> 14) & 0x3fff)]; }
  }
  return null;
}

const files: string[] = [];
(function walk(d: string) {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (f.endsWith('.glb')) files.push(p);
  }
})('public/models');

describe('texturas dos modelos dentro do limite de VRAM', () => {
  for (const file of files) {
    const rel = file.split(path.sep).join('/').replace('public/models/', '');
    it(rel, () => {
      const b = fs.readFileSync(file);
      const json = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      const bin = b.subarray(20 + b.readUInt32LE(12) + 8);
      const limit = LIMIT[rel] ?? LIMIT_DEFAULT;
      for (const img of json.images ?? []) {
        if (img.bufferView === undefined) continue;
        const bv = json.bufferViews[img.bufferView];
        const size = imageSize(bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength));
        if (!size) continue;
        // O que pesa na VRAM é a ÁREA (ex.: tira 128x2048 do kaiju ≈ 1 MB): até limite².
        expect(size[0] * size[1], `${rel}: textura ${size.join('x')}`).toBeLessThanOrEqual(limit * limit);
      }
    });
  }
});
