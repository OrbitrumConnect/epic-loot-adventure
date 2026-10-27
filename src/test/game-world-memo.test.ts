import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('GameWorld memo wiring', () => {
  it('exports a memo component', async () => {
    const mod = await import('@/components/game-world');

    expect((mod.default as any).$$typeof).toBe(Symbol.for('react.memo'));
  }, 30_000);

  it('keeps Index wired through the default export', () => {
    const indexSource = readFileSync(resolve(process.cwd(), 'src/routes/index.tsx'), 'utf8');

    expect(indexSource).toContain("lazy(() => import('@/components/game-world'))");
    expect(indexSource).toContain('<GameWorld');
  });
});
