import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type AssetUse = {
  locations: string[];
  diskPath: string;
};

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sourceExtensions = new Set(['.js', '.jsx', '.ts', '.tsx']);
const assetPattern = /(['"])([^'"\r\n]*\.(?:glb|gltf|obj|png|webp|jpg))(?:\?[^'"\r\n]*)?\1/gi;
const modelUrlPattern = /modelUrl\(\s*(['"])([^'"]+)\1\s*\)/g;

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test') return [];
      return sourceFiles(absolutePath);
    }

    return sourceExtensions.has(path.extname(entry.name)) ? [absolutePath] : [];
  });
}

function stripComments(source: string): string {
  let result = '';
  let state: 'code' | 'single' | 'double' | 'line' | 'block' = 'code';

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (state === 'line') {
      if (character === '\n') {
        state = 'code';
        result += character;
      } else {
        result += ' ';
      }
      continue;
    }

    if (state === 'block') {
      if (character === '*' && next === '/') {
        state = 'code';
        result += '  ';
        index += 1;
      } else {
        result += character === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (state === 'single' || state === 'double') {
      result += character;
      if (character === '\\') {
        result += next ?? '';
        index += 1;
      } else if ((state === 'single' && character === "'") || (state === 'double' && character === '"')) {
        state = 'code';
      }
      continue;
    }

    if (character === "'") {
      state = 'single';
      result += character;
    } else if (character === '"') {
      state = 'double';
      result += character;
    } else if (character === '/' && next === '/') {
      state = 'line';
      result += '  ';
      index += 1;
    } else if (character === '/' && next === '*') {
      state = 'block';
      result += '  ';
      index += 1;
    } else {
      result += character;
    }
  }

  return result;
}

function resolveAssetPath(assetPath: string, sourceFile: string, fromModelUrl: boolean): string | undefined {
  const normalized = assetPath.split('?')[0]?.replace(/^\/+/, '');
  if (!normalized || /^https?:\/\//i.test(assetPath)) return undefined;

  if (fromModelUrl || assetPath.startsWith('/models/')) {
    return path.join(projectRoot, 'public', 'models', normalized.replace(/^models[\\/]/, ''));
  }

  if (assetPath.startsWith('/assets/')) {
    return path.join(projectRoot, 'public', 'assets', normalized.replace(/^assets[\\/]/, ''));
  }

  if (assetPath.startsWith('./') || assetPath.startsWith('../')) {
    return path.resolve(path.dirname(sourceFile), normalized);
  }

  return path.join(projectRoot, 'public', 'models', normalized);
}

function collectAssetUses(): Map<string, AssetUse> {
  const uses = new Map<string, AssetUse>();

  for (const sourceFile of sourceFiles(path.join(projectRoot, 'src'))) {
    const source = stripComments(fs.readFileSync(sourceFile, 'utf8'));
    const relativeSource = path.relative(projectRoot, sourceFile).replaceAll(path.sep, '/');
    const add = (assetPath: string, line: number, fromModelUrl: boolean) => {
      const diskPath = resolveAssetPath(assetPath, sourceFile, fromModelUrl);
      if (!diskPath) return;

      const key = path.normalize(diskPath);
      const existing = uses.get(key);
      const location = `${relativeSource}:${line}`;
      if (existing) {
        if (!existing.locations.includes(location)) existing.locations.push(location);
      } else {
        uses.set(key, { diskPath, locations: [location] });
      }
    };

    const lineNumberAt = (index: number) => source.slice(0, index).split('\n').length;
    for (const match of source.matchAll(modelUrlPattern)) {
      add(match[2]!, lineNumberAt(match.index ?? 0), true);
    }
    for (const match of source.matchAll(assetPattern)) {
      add(match[2]!, lineNumberAt(match.index ?? 0), false);
    }
  }

  return uses;
}

test('todo asset pedido pelo codigo de producao existe em disco', () => {
  const uses = collectAssetUses();
  const missing = [...uses.values()].filter((use) => !fs.existsSync(use.diskPath));

  expect(
    uses.size,
    'A extracao encontrou poucos caminhos; verifique os padroes de modelUrl e loaders.',
  ).toBeGreaterThanOrEqual(15);

  const details = missing
    .map((use) => `${path.relative(projectRoot, use.diskPath).replaceAll(path.sep, '/')} (pedido em ${use.locations.join(', ')})`)
    .join('\n');

  expect(missing, `Assets ausentes; cada entrada deve indicar arquivo e linha:\n${details}`).toHaveLength(0);
});
