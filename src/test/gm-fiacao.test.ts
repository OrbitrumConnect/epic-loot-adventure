import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('fiação dos comandos de GM', () => {
  it('chat chama runGmCommand', () => {
    const s = readFileSync('src/routes/index.tsx', 'utf8');
    expect(s).toContain('runGmCommand(v)');
    expect(s).toContain('name="chatmsg"');
  });
  it('Zona Sul consome gmTeleport', () => {
    const s = readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(s).toContain('const gmTp = useGameStore.getState().gmTeleport');
    expect(s).toContain('clearGmTeleport()');
  });
  it('Vale consome gmTeleport', () => {
    const s = readFileSync('src/components/game-world.tsx', 'utf8');
    expect(s).toContain('const gmTp = useGameStore.getState().gmTeleport');
    expect(s).toContain('clearGmTeleport()');
  });
});
