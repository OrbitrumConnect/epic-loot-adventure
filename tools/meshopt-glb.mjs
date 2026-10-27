import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { quantize, reorder } from '@gltf-transform/functions';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

const BACKUP_DIR = process.env['MESHOPT_BACKUP_DIR'] ?? path.join(os.tmpdir(), 'meshopt-glb-backup');
const DEFAULT_ROOT = path.resolve('public/models');
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const KTX2_FILES = new Set(['red/hero-preview.glb', 'raiders/pirate.glb', 'crystal/crystal.glb']);

const fmtBytes = (n) => `${(n / 1048576).toFixed(2)} MB`;
const round = (n) => Number(n.toFixed(6));
const extensionNames = (document) => document.getRoot().listExtensionsUsed().map((extension) => extension.extensionName);
const hash = (bytes) => crypto.createHash('sha256').update(bytes ?? new Uint8Array()).digest('hex');

async function findGlbs(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await findGlbs(absolute));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.glb')) files.push(absolute);
  }
  return files.sort();
}

function geometrySnapshot(document) {
  let vertices = 0;
  let triangles = 0;
  for (const mesh of document.getRoot().listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (!position) continue;
      const count = primitive.getIndices()?.getCount() ?? position.getCount();
      vertices += position.getCount();
      switch (primitive.getMode()) {
        case 4: triangles += Math.floor(count / 3); break; // TRIANGLES
        case 5: triangles += Math.max(0, count - 2); break; // TRIANGLE_STRIP
        case 6: triangles += Math.max(0, count - 2); break; // TRIANGLE_FAN
        default: break;
      }
    }
  }
  return { vertices, triangles };
}

function boundsSnapshot(document) {
  const bounds = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
  const scenes = document.getRoot().listScenes();
  const nodes = scenes.length ? scenes.map((scene) => getBounds(scene)) : document.getRoot().listNodes().map((node) => getBounds(node));
  for (const current of nodes) {
    for (let axis = 0; axis < 3; axis++) {
      bounds.min[axis] = Math.min(bounds.min[axis], current.min[axis]);
      bounds.max[axis] = Math.max(bounds.max[axis], current.max[axis]);
    }
  }
  return { min: bounds.min.map(round), max: bounds.max.map(round) };
}

function textureSnapshot(document) {
  return document.getRoot().listTextures().map((texture) => ({ mimeType: texture.getMimeType(), hash: hash(texture.getImage()) }));
}

function compareBounds(before, after) {
  const changes = [];
  for (let axis = 0; axis < 3; axis++) {
    const size = before.max[axis] - before.min[axis];
    const tolerance = size * 0.005;
    const minDelta = Math.abs(after.min[axis] - before.min[axis]);
    const maxDelta = Math.abs(after.max[axis] - before.max[axis]);
    const exceeded = size === 0 ? minDelta > 1e-8 || maxDelta > 1e-8 : minDelta > tolerance || maxDelta > tolerance;
    changes.push({ axis: 'xyz'[axis], size: round(size), minDelta: round(minDelta), maxDelta: round(maxDelta), limit: round(tolerance), exceeded });
  }
  return { passed: changes.every((change) => !change.exceeded), changes };
}

function fidelity(before, after) {
  const bbox = compareBounds(before.bounds, after.bounds);
  const checks = {
    bbox: bbox.passed,
    vertices: before.geometry.vertices === after.geometry.vertices,
    triangles: before.geometry.triangles === after.geometry.triangles,
    animations: before.animations === after.animations,
    skins: before.skins === after.skins,
    nodes: before.nodes === after.nodes,
    textures: JSON.stringify(before.textures) === JSON.stringify(after.textures),
  };
  return { passed: Object.values(checks).every(Boolean), checks, bbox };
}

async function convert(file) {
  const absolute = path.resolve(file);
  const relative = path.relative(process.cwd(), absolute).replaceAll('\\', '/');
  const original = await fs.readFile(absolute);
  const beforeBytes = original.byteLength;
  const document = await io.read(absolute);
  const before = {
    bounds: boundsSnapshot(document),
    geometry: geometrySnapshot(document),
    animations: document.getRoot().listAnimations().length,
    skins: document.getRoot().listSkins().length,
    nodes: document.getRoot().listNodes().length,
    textures: textureSnapshot(document),
    extensions: extensionNames(document),
  };
  if (before.extensions.includes('EXT_meshopt_compression')) {
    return { file: relative, status: 'skipped-existing', beforeBytes, afterBytes: beforeBytes, before, after: before };
  }

  const backup = path.join(BACKUP_DIR, path.basename(absolute));
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'meshopt-glb-'));
  const tempGlb = path.join(tempDir, path.basename(absolute));
  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.copyFile(absolute, backup);
    // POSITION fica em float para preservar os consumidores do projeto; os demais atributos
    // seguem quantizados. A extensão continua comprimindo todos os bufferViews no writer.
    await document.transform(
      reorder({ encoder: MeshoptEncoder, target: 'size' }),
      quantize({
        encoder: MeshoptEncoder,
        pattern: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR)(_\d+)?$/,
        patternTargets: /^(TEXCOORD|JOINTS|WEIGHTS|COLOR|NORMAL|TANGENT)(_\d+)?$/,
        quantizeNormal: 8,
      }),
    );
    document
      .createExtension(EXTMeshoptCompression)
      .setRequired(true)
      .setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
    await io.write(tempGlb, document);
    const validated = await io.read(tempGlb);
    const after = {
      bounds: boundsSnapshot(validated),
      geometry: geometrySnapshot(validated),
      animations: validated.getRoot().listAnimations().length,
      skins: validated.getRoot().listSkins().length,
      nodes: validated.getRoot().listNodes().length,
      textures: textureSnapshot(validated),
      extensions: extensionNames(validated),
    };
    const report = fidelity(before, after);
    const isKtx2 = KTX2_FILES.has(relative.replace(/^.*?public\/models\//, ''));
    if (isKtx2 && before.extensions.includes('KHR_texture_basisu') && !after.extensions.includes('KHR_texture_basisu')) {
      report.passed = false;
      report.checks.ktx2Extension = false;
      report.reason = 'KHR_texture_basisu ausente no resultado';
    } else if (isKtx2) {
      report.checks.ktx2Extension = true;
    }
    if (!after.extensions.includes('EXT_meshopt_compression')) {
      report.passed = false;
      report.checks.meshoptExtension = false;
      report.reason = 'EXT_meshopt_compression ausente no resultado';
    } else {
      report.checks.meshoptExtension = true;
    }
    if (!report.passed) {
      await fs.copyFile(backup, absolute);
      return { file: relative, status: 'rejected', beforeBytes, afterBytes: beforeBytes, before, after, fidelity: report, backup };
    }
    await fs.rename(tempGlb, absolute);
    const afterBytes = (await fs.stat(absolute)).size;
    return { file: relative, status: 'converted', beforeBytes, afterBytes, before, after, fidelity: report, backup };
  } catch (error) {
    await fs.copyFile(backup, absolute).catch(() => {});
    return { file: relative, status: 'rejected', beforeBytes, afterBytes: beforeBytes, before, error: String(error?.stack ?? error), backup };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const args = process.argv.slice(2).filter((arg) => arg !== '--');
const files = args.length ? args : await findGlbs(DEFAULT_ROOT);
if (!files.length || args.includes('--help')) {
  console.error('Uso: node tools/meshopt-glb.mjs [arquivo.glb ...]');
  process.exit(args.includes('--help') ? 0 : 2);
}
const results = [];
for (const file of files) {
  const result = await convert(file);
  results.push(result);
  const f = result.fidelity;
  console.log(`${result.file} | ${result.status} | bytes=${result.beforeBytes}->${result.afterBytes} (${fmtBytes(result.beforeBytes)}->${fmtBytes(result.afterBytes)}) | bbox=${f ? (f.checks.bbox ? 'ok' : 'REJECT') : 'n/a'} | vertices=${result.before.geometry.vertices}->${result.after?.geometry.vertices ?? 'n/a'} | triangles=${result.before.geometry.triangles}->${result.after?.geometry.triangles ?? 'n/a'} | animations=${result.before.animations}->${result.after?.animations ?? 'n/a'} | skins=${result.before.skins}->${result.after?.skins ?? 'n/a'} | nodes=${result.before.nodes}->${result.after?.nodes ?? 'n/a'}`);
  if (f?.reason || result.error) console.log(`  motivo=${f?.reason ?? result.error}`);
}
console.log(JSON.stringify({ backupDir: BACKUP_DIR, results }, null, 2));
