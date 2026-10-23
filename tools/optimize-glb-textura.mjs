import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve('public/models');
const MAX_TEX = Number.parseInt(process.env.MAX_TEX ?? '1024', 10);
const EXCLUDE = (process.env.EXCLUDE ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.decoder': MeshoptDecoder,
});

if (!Number.isInteger(MAX_TEX) || MAX_TEX < 1) {
  throw new Error(`MAX_TEX inválido: ${process.env.MAX_TEX}`);
}
await MeshoptDecoder.ready;

const fmtBytes = (n) => `${(n / 1048576).toFixed(2)} MB`;

async function filesUnder(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...await filesUnder(full));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) out.push(full);
  }
  return out.sort();
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
  }
  return value;
}

function rounded(value) {
  if (Array.isArray(value)) return value.map(rounded);
  if (typeof value === 'number') return Number(value.toFixed(6));
  return value;
}

async function structuralSnapshot(document, file) {
  const { json } = await io.readAsJSON(file);
  const accessors = (json.accessors ?? []).map((accessor) => {
    return {
      componentType: accessor.componentType,
      type: accessor.type,
      count: accessor.count,
      normalized: accessor.normalized,
    };
  });
  const nodes = (json.nodes ?? []).map((node) => {
    const copy = { ...node };
    delete copy.matrix;
    delete copy.translation;
    delete copy.rotation;
    delete copy.scale;
    return copy;
  });
  const textures = document.getRoot().listTextures();
  const materialValue = (material) => ({
    name: material.getName(),
    doubleSided: material.getDoubleSided(),
    alpha: material.getAlpha(),
    alphaMode: material.getAlphaMode(),
    alphaCutoff: material.getAlphaCutoff(),
    baseColorFactor: material.getBaseColorFactor(),
    baseColorTexture: textures.indexOf(material.getBaseColorTexture()),
    emissiveFactor: material.getEmissiveFactor(),
    emissiveTexture: textures.indexOf(material.getEmissiveTexture()),
    normalScale: material.getNormalScale(),
    normalTexture: textures.indexOf(material.getNormalTexture()),
    occlusionStrength: material.getOcclusionStrength(),
    occlusionTexture: textures.indexOf(material.getOcclusionTexture()),
    roughnessFactor: material.getRoughnessFactor(),
    metallicFactor: material.getMetallicFactor(),
    metallicRoughnessTexture: textures.indexOf(material.getMetallicRoughnessTexture()),
  });
  return JSON.stringify({
    accessors: stable(accessors).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    materials: stable(document.getRoot().listMaterials().map(materialValue)),
    nodes: stable(nodes),
    nodeTransforms: document.getRoot().listNodes().map((node) => ({
      translation: rounded(node.getTranslation()),
      rotation: rounded(node.getRotation()),
      scale: rounded(node.getScale()),
      matrix: rounded(node.getMatrix()),
    })),
  });
}

function assertFloatPositions(document, file) {
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (position && position.getComponentType() !== 5126) {
        throw new Error(`${file}: POSITION.componentType=${position.getComponentType()}, esperado 5126`);
      }
    }
  }
}

async function resizeTexture(texture) {
  const image = texture.getImage();
  const mime = texture.getMimeType();
  if (!image || !mime || !['image/png', 'image/webp', 'image/jpeg'].includes(mime)) return null;

  const input = Buffer.from(image);
  const metadata = await sharp(input).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;
  if (width <= MAX_TEX && height <= MAX_TEX) return null;

  const scale = Math.min(MAX_TEX / width, MAX_TEX / height);
  const afterWidth = Math.max(1, Math.round(width * scale));
  const afterHeight = Math.max(1, Math.round(height * scale));
  let pipeline = sharp(input).resize({ width: afterWidth, height: afterHeight, fit: 'fill' });
  if (mime === 'image/png') pipeline = pipeline.png();
  else if (mime === 'image/webp') pipeline = pipeline.webp();
  else pipeline = pipeline.jpeg();
  texture.setImage(await pipeline.toBuffer());
  return { mime, before: `${width}x${height}`, after: `${afterWidth}x${afterHeight}` };
}

const allFiles = await filesUnder(ROOT);
let failed = 0;
let processed = 0;
const workDir = await fs.mkdtemp(path.join(process.cwd(), '.fase1b-tmp-'));

try {
  for (const file of allFiles) {
    const rel = path.relative(process.cwd(), file).replaceAll('\\', '/');
    if (EXCLUDE.some((part) => rel.includes(part))) {
      console.log(`${rel} | pulado=sim | motivo=EXCLUDE`);
      continue;
    }

    const original = await fs.readFile(file);
    const beforeBytes = original.byteLength;
    const temp = path.join(workDir, path.basename(file));

    try {
      const document = await io.read(file);
      const beforeStructure = await structuralSnapshot(document, file);
      const reductions = [];
      for (const texture of document.getRoot().listTextures()) {
        const reduction = await resizeTexture(texture);
        if (reduction) reductions.push(reduction);
      }

      if (reductions.length === 0) {
        processed += 1;
        console.log(`${rel} | bytes=${beforeBytes}->${beforeBytes} (${fmtBytes(beforeBytes)}->${fmtBytes(beforeBytes)}) | texturasReduzidas=0 | intocado=sim`);
        continue;
      }

      await io.write(temp, document);
      const validated = await io.read(temp);
      if (await structuralSnapshot(validated, temp) !== beforeStructure) {
        throw new Error(`${rel}: snapshot de accessor/material/node alterado`);
      }

      const afterBytes = (await fs.stat(temp)).size;
      await fs.rename(temp, file);
      processed += 1;
      const textures = reductions.map((r) => `${r.mime} ${r.before}->${r.after}`).join(', ');
      console.log(`${rel} | bytes=${beforeBytes}->${afterBytes} (${fmtBytes(beforeBytes)}->${fmtBytes(afterBytes)}) | texturasReduzidas=${reductions.length} | ${textures} | validou-reabrir=sim`);
    } catch (error) {
      failed += 1;
      await fs.rm(temp, { force: true });
      console.error(`${rel} | falhou=sim | original-preservado=sim | motivo=${error instanceof Error ? error.message : String(error)}`);
    }
  }
} finally {
  await fs.rm(workDir, { recursive: true, force: true });
}

console.log(`RESUMO | processados=${processed} | falhos=${failed} | encontrados=${allFiles.length} | MAX_TEX=${MAX_TEX}`);
if (failed) process.exitCode = 1;
