// Comprime GLBs de mapa (Meshy) p/ web/mobile SEM perder cor:
// - resize de textura 4K -> 1024 (corta ~90% do peso)
// - de-shine (metalness=0, roughness=1, remove mapa metallicRoughness) = tira brilho
// - quantize geometria
// Registra ALL_EXTENSIONS no I/O (senão o write zera os dados). Escreve em outDir.
// Uso: node tools/compress-map.mjs <inDir> <outDir>
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, quantize, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';
import { readdirSync, statSync, mkdirSync } from 'fs';
import { join } from 'path';

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) { console.error('uso: <inDir> <outDir>'); process.exit(1); }
mkdirSync(outDir, { recursive: true });
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const fmt = (b) => (b / 1048576).toFixed(1) + ' MB';
const files = readdirSync(inDir).filter((f) => f.toLowerCase().endsWith('.glb'));

for (const f of files) {
  const src = join(inDir, f), dst = join(outDir, f);
  const before = statSync(src).size;
  try {
    const doc = await io.read(src);
    for (const mat of doc.getRoot().listMaterials()) {
      mat.setMetallicFactor(0);
      mat.setRoughnessFactor(1);
      mat.setMetallicRoughnessTexture(null);
    }
    await doc.transform(
      dedup(),
      textureCompress({ encoder: sharp, targetFormat: 'jpeg', resize: [1024, 1024] }),
      prune(),
      quantize(),
    );
    await io.write(dst, doc);
    console.log(`${f}: ${fmt(before)} -> ${fmt(statSync(dst).size)}`);
  } catch (e) {
    console.error(`${f}: ERRO ${e.message}`);
  }
}
