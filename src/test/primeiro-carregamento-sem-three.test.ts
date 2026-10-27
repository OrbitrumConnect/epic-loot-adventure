import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const srcRoot = path.resolve('src');
const entry = path.join(srcRoot, 'routes/index.tsx');
const forbidden = /^(?:three|three\/|@react-three\/)/;

function resolveImport(from: string, specifier: string): string | null {
  if (specifier.startsWith('@/')) {
    return resolveFile(path.join(srcRoot, specifier.slice(2)));
  }
  if (specifier.startsWith('.')) {
    return resolveFile(path.resolve(path.dirname(from), specifier));
  }
  return null;
}

function resolveFile(candidate: string): string | null {
  for (const file of [candidate, `${candidate}.ts`, `${candidate}.tsx`, path.join(candidate, 'index.ts'), path.join(candidate, 'index.tsx')]) {
    if (fs.existsSync(file) && fs.statSync(file).isFile()) return file;
  }
  return null;
}

function staticValueImports(source: string): string[] {
  const imports: string[] = [];
  const normalized = source.replace(/\r\n/g, '\n');
  const pattern = /\bimport\s+(?!\()([\s\S]*?)(?:\s+from\s+)?['"]([^'"]+)['"]/g;
  for (const match of normalized.matchAll(pattern)) {
    const clause = match[1]!.trim();
    if (clause.startsWith('type ')) continue;
    if (clause.startsWith('{')) {
      const names = clause.slice(1, clause.lastIndexOf('}')).split(',').map(name => name.trim()).filter(Boolean);
      if (names.length > 0 && names.every(name => name.startsWith('type '))) continue;
    }
    imports.push(match[2]!);
  }
  return imports;
}

function findForbiddenPath(): string[] | null {
  const queue = [entry];
  const predecessor = new Map<string, string | null>([[entry, null]]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    const source = fs.readFileSync(current, 'utf8');
    for (const specifier of staticValueImports(source)) {
      if (forbidden.test(specifier)) {
        const chain = [specifier];
        let node: string | null = current;
        while (node) {
          chain.unshift(path.relative('.', node).replaceAll(path.sep, '/'));
          node = predecessor.get(node) ?? null;
        }
        return chain;
      }
      const resolved = resolveImport(current, specifier);
      if (resolved && !predecessor.has(resolved)) {
        predecessor.set(resolved, current);
        queue.push(resolved);
      }
    }
  }
  return null;
}

describe('primeiro carregamento', () => {
  it('não alcança three por imports estáticos de index', () => {
    const forbiddenPath = findForbiddenPath();
    expect(forbiddenPath, forbiddenPath ? `Import proibido alcançado: ${forbiddenPath.join(' -> ')}` : '').toBeNull();
  });
});
