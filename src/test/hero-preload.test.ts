import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('preload do heroi Mixamo', () => {
  it('mantem no maximo dois preloads', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/world/glb-hero-mixamo.tsx'), 'utf8');
    const preloadCalls = source.match(/useGLTF\.preload\s*\(/g) ?? [];

    expect(preloadCalls.length).toBeLessThanOrEqual(2);
  });
});
