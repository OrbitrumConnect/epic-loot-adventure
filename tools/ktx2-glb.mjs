import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import sharp from 'sharp';
import { execFileSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Onde guardar o .glb original antes de sobrescrever. Troque com KTX2_BACKUP_DIR=<pasta>.
const BACKUP_DIR = process.env['KTX2_BACKUP_DIR'] ?? path.join(os.tmpdir(), 'ktx2-glb-backup');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const files = process.argv.slice(2).filter((arg) => arg !== '--');

if (!files.length || files.includes('--help')) {
  console.error('Uso: node tools/ktx2-glb.mjs <arquivo.glb> [mais-arquivos.glb ...]');
  process.exit(files.includes('--help') ? 0 : 2);
}

const fmtBytes = (n) => `${(n / 1048576).toFixed(2)} MB`;
const stable = (value) => {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)]));
  return value;
};

function structuralSnapshot(document) {
  const root = document.getRoot();
  return JSON.stringify(stable({
    animations: root.listAnimations().map((a) => ({ name: a.getName(), channels: a.listChannels().length, samplers: a.listSamplers().length })),
    meshes: root.listMeshes().map((m) => ({ name: m.getName(), primitives: m.listPrimitives().map((p) => ({ mode: p.getMode(), attributes: p.listSemantics(), targets: p.listTargets().length })) })),
    nodes: root.listNodes().map((n) => ({ name: n.getName(), translation: n.getTranslation(), rotation: n.getRotation(), scale: n.getScale(), matrix: n.getMatrix(), mesh: n.getMesh()?.getName() ?? null, skin: n.getSkin()?.getName() ?? null })),
    scenes: root.listScenes().map((s) => ({ name: s.getName(), nodes: s.listChildren().map((n) => n.getName()) })),
    skins: root.listSkins().map((s) => ({ name: s.getName(), joints: s.listJoints().map((n) => n.getName()), skeleton: s.getSkeleton()?.getName() ?? null })),
  }));
}

function magicExtension(bytes, mime) {
  if (mime === 'image/png' || bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return '.png';
  if (mime === 'image/jpeg' || (bytes[0] === 0xff && bytes[1] === 0xd8)) return '.jpg';
  if (mime === 'image/webp' || bytes.subarray(0, 4).toString('ascii') === 'RIFF') return '.webp';
  return '.bin';
}

function slotsForTexture(document, texture) {
  const slots = [];
  for (const material of document.getRoot().listMaterials()) {
    for (const [slot, getter] of [
      ['baseColorTexture', 'getBaseColorTexture'],
      ['emissiveTexture', 'getEmissiveTexture'],
      ['normalTexture', 'getNormalTexture'],
      ['metallicRoughnessTexture', 'getMetallicRoughnessTexture'],
      ['occlusionTexture', 'getOcclusionTexture'],
    ]) {
      if (material[getter]() === texture) slots.push(slot);
    }
  }
  return slots;
}

function resolveToktx() {
  if (process.env.TOKTX) return process.env.TOKTX;
  if (process.platform === 'win32') {
    return 'C:/Users/cleao/scoop/shims/toktx.exe';
  }
  return 'toktx';
}

function runToktx(mode, input, output) {
  const args = mode === 'etc1s'
    ? ['--t2', '--encode', 'etc1s', '--clevel', '5', '--qlevel', '192', '--genmipmap', output, input]
    : ['--t2', '--encode', 'uastc', '--uastc_quality', '3', '--zcmp', '3', '--genmipmap', output, input];
  const executable = resolveToktx();
  execFileSync(executable, args, { stdio: 'pipe' });
  return `${executable} ${args.map((arg) => JSON.stringify(arg)).join(' ')}`;
}

async function convert(file) {
  const absolute = path.resolve(file);
  const original = await fs.readFile(absolute);
  const beforeBytes = original.byteLength;
  const document = await io.read(absolute);
  const beforeStructure = structuralSnapshot(document);
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ktx2-glb-'));
  const tempGlb = path.join(tempDir, path.basename(absolute));
  const backup = path.join(BACKUP_DIR, path.basename(absolute));
  const converted = [];
  const commands = [];

  try {
    await fs.mkdir(BACKUP_DIR, { recursive: true });
    await fs.copyFile(absolute, backup);
    const basisu = document.createExtension(KHRTextureBasisu).setRequired(true);

    for (const [index, texture] of document.getRoot().listTextures().entries()) {
      const bytes = Buffer.from(texture.getImage() ?? []);
      if (!bytes.length) throw new Error(`${file}: textura ${index} sem bytes`);
      const slots = slotsForTexture(document, texture);
      const mode = slots.some((slot) => ['normalTexture', 'metallicRoughnessTexture', 'occlusionTexture'].includes(slot)) ? 'uastc' : 'etc1s';
      const metadata = await sharp(bytes).metadata();
      const source = path.join(tempDir, `texture-${index}${magicExtension(bytes, texture.getMimeType())}`);
      const input = magicExtension(bytes, texture.getMimeType()) === '.bin' ? `${source}.png` : source;
      await fs.writeFile(source, bytes);
      if (input !== source) await sharp(bytes).png().toFile(input);
      const output = path.join(tempDir, `texture-${index}.ktx2`);
      commands.push(runToktx(mode, input, output));
      texture.setMimeType('image/ktx2').setImage(await fs.readFile(output));
      converted.push({ index, mode, slots, width: metadata.width ?? 0, height: metadata.height ?? 0, bytes: (await fs.stat(output)).size });
    }

    await io.write(tempGlb, document);
    const validated = await io.read(tempGlb);
    if (structuralSnapshot(validated) !== beforeStructure) console.warn(`${file}: aviso=writer_normalizou_campos_semanticos; imagens_only_preservadas_por_snapshot_de_modelo`);
    const extensions = validated.getRoot().listExtensionsUsed().map((extension) => extension.extensionName);
    if (!extensions.includes('KHR_texture_basisu')) throw new Error(`${file}: KHR_texture_basisu ausente no resultado`);
    await fs.rename(tempGlb, absolute);

    const afterBytes = (await fs.stat(absolute)).size;
    console.log(`${file} | bytes=${beforeBytes}->${afterBytes} (${fmtBytes(beforeBytes)}->${fmtBytes(afterBytes)}) | texturasConvertidas=${converted.length} | dimensoes=${converted.map((item) => `${item.width}x${item.height}`).join(',')} | extensoes=${extensions.join(',')}`);
    for (const item of converted) console.log(`  textura=${item.index} slots=${item.slots.join('+') || 'sem-slot'} modo=${item.mode} ktx2=${item.bytes}B`);
    for (const command of commands) console.log(`  comando=${command}`);
    return { file, beforeBytes, afterBytes, converted, extensions, commands };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

const results = [];
for (const file of files) results.push(await convert(file));
console.log(JSON.stringify({ results }, null, 2));
