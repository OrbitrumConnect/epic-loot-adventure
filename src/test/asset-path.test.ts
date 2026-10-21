import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { modelUrl } from '../game/asset-path';

const SRC_DIR = join(process.cwd(), 'src');
const MODELS_LITERAL = /['"`]\/models\//;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe('modelUrl', () => {
  it('usa modelos sob /models/', () => {
    expect(modelUrl('props/maze.glb')).toBe('/models/props/maze.glb');
  });

  it('nao duplica barras', () => {
    expect(modelUrl('/props/maze.glb')).toBe('/models/props/maze.glb');
  });

  it('nao deixa literal de modelos originais fora de asset-path.ts', () => {
    const leftovers = sourceFiles(SRC_DIR).flatMap((file) => {
      const normalizedFile = file.replaceAll('\\', '/');
      if (normalizedFile.endsWith('asset-path.ts') || normalizedFile.includes('src/test/') || normalizedFile.includes('__tests__/')) return [];
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      return lines.flatMap((line, index) => {
        const trimmed = line.trimStart();
        if (trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed.startsWith('*/')) return [];
        return MODELS_LITERAL.test(line) ? [`${relative(process.cwd(), file)}:${index + 1}`] : [];
      });
    });
    expect(leftovers).toEqual([]);
  });
});
