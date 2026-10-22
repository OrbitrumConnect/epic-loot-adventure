import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INPUT_ROOT = path.join(ROOT, 'public', 'models');
const OUTPUT_ROOT = path.join(ROOT, 'public', 'models-opt');
const DEFAULT_LIMIT = 1024;
const HERO_LIMIT = 2048;
const MODEL_EXTENSIONS = new Set(['.glb', '.gltf']);

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

const files = [];
async function collect(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collect(full);
    else if (MODEL_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) files.push(full);
  }
}

function fmtBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(2)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

function fmtVram(bytes) { return fmtBytes(Math.round(bytes)); }

async function imageInfo(texture) {
  const image = texture.getImage();
  if (!image) return null;
  const metadata = await sharp(Buffer.from(image)).metadata();
  if (!metadata.width || !metadata.height) return null;
  return {
    width: metadata.width,
    height: metadata.height,
    bytes: image.byteLength,
    hasAlpha: metadata.hasAlpha === true,
    mimeType: texture.getMimeType() || metadata.format || 'unknown',
  };
}

async function resizeAndCompress(texture, limit) {
  const before = await imageInfo(texture);
  if (!before) return { before: null, after: null };

  const needsResize = before.width > limit || before.height > limit;
  const scale = needsResize ? Math.min(limit / before.width, limit / before.height) : 1;
  const width = Math.max(1, Math.round(before.width * scale));
  const height = Math.max(1, Math.round(before.height * scale));
  const source = sharp(Buffer.from(texture.getImage()));
  const encoded = await source
    .resize(width, height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .webp({ quality: 84, alphaQuality: 90, effort: 5 })
    .toBuffer();

  // Keep original bytes when WebP is not smaller and no resize was needed.
  const shouldUseWebp = needsResize || encoded.byteLength < before.bytes;
  if (shouldUseWebp) {
    texture.setImage(encoded);
    texture.setMimeType('image/webp');
    const oldUri = texture.getURI();
    if (oldUri && !oldUri.startsWith('data:')) {
      texture.setURI(`${oldUri.replace(/\.[^.]+$/, '')}.webp`);
    }
  } else {
    // Still enforce max dimensions if metadata lied about encoded size.
    if (needsResize) {
      const resized = await sharp(Buffer.from(texture.getImage())).resize(width, height).toBuffer();
      texture.setImage(resized);
    }
  }

  const after = await imageInfo(texture);
  return { before, after };
}

async function processModel(input) {
  const relative = path.relative(INPUT_ROOT, input);
  const output = path.join(OUTPUT_ROOT, relative);
  const limit = relative.toLowerCase().startsWith(`red${path.sep}`) ? HERO_LIMIT : DEFAULT_LIMIT;
  const doc = await io.read(input);
  const textures = doc.getRoot().listTextures();
  const textureRows = [];
  for (const texture of textures) {
    const result = await resizeAndCompress(texture, limit);
    if (result.before) textureRows.push(result);
  }

  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await fs.mkdir(path.dirname(output), { recursive: true });
  await io.write(output, doc);

  const maxBeforeTexture = textureRows.reduce((best, row) => row.before.width * row.before.height > best.width * best.height ? row.before : best, textureRows[0]?.before ?? { width: 0, height: 0 });
  const maxAfterTexture = textureRows.reduce((best, row) => row.after.width * row.after.height > best.width * best.height ? row.after : best, textureRows[0]?.after ?? { width: 0, height: 0 });
  const beforeVram = textureRows.reduce((sum, row) => sum + row.before.width * row.before.height * 4 * 1.33, 0);
  const afterVram = textureRows.reduce((sum, row) => sum + row.after.width * row.after.height * 4 * 1.33, 0);
  return {
    file: relative.replaceAll('\\', '/'),
    beforeBytes: (await fs.stat(input)).size,
    afterBytes: (await fs.stat(output)).size,
    beforeMax: maxBeforeTexture.width ? `${maxBeforeTexture.width}x${maxBeforeTexture.height}` : '—',
    afterMax: maxAfterTexture.width ? `${maxAfterTexture.width}x${maxAfterTexture.height}` : '—',
    beforeVram,
    afterVram,
    textures: textureRows.length,
  };
}

await collect(INPUT_ROOT);
files.sort();
await MeshoptEncoder.ready;
await fs.rm(OUTPUT_ROOT, { recursive: true, force: true });
await fs.mkdir(OUTPUT_ROOT, { recursive: true });

const rows = [];
for (const file of files) {
  try {
    const row = await processModel(file);
    rows.push(row);
    console.log(`OK ${row.file} | tex ${row.textures} | ${row.beforeMax} -> ${row.afterMax}`);
  } catch (error) {
    console.error(`ERRO ${path.relative(INPUT_ROOT, file)}: ${error.message}`);
    process.exitCode = 1;
  }
}

const total = (key) => rows.reduce((sum, row) => sum + row[key], 0);
const beforeVram = total('beforeVram');
const afterVram = total('afterVram');
const saved = beforeVram - afterVram;
const pct = beforeVram ? (saved / beforeVram) * 100 : 0;
const table = [
  '| arquivo | maior textura antes | depois | bytes antes | bytes depois | VRAM est. antes | VRAM est. depois |',
  '|---|---:|---:|---:|---:|---:|---:|',
  ...rows.map((row) => `| ${row.file} | ${row.beforeMax} | ${row.afterMax} | ${fmtBytes(row.beforeBytes)} | ${fmtBytes(row.afterBytes)} | ${fmtVram(row.beforeVram)} | ${fmtVram(row.afterVram)} |`),
  `| **TOTAL** | — | — | **${fmtBytes(total('beforeBytes'))}** | **${fmtBytes(total('afterBytes'))}** | **${fmtVram(beforeVram)}** | **${fmtVram(afterVram)}** |`,
  '',
  `Economia VRAM estimada: **${fmtVram(saved)} (${pct.toFixed(1)}%)**.`,
];
console.log(`\n${table.join('\n')}`);
await fs.writeFile(path.join(OUTPUT_ROOT, 'texture-report.md'), `${table.join('\n')}\n`, 'utf8');
