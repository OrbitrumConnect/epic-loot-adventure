import { describe, expect, it } from 'vitest';
import { connectLocalPersistence } from '@/game/state/local-persistence';
import { useGameStore } from '@/game/state/game-store';
import { SAVE_KEY } from '@/game/systems/persistenceSystem';

describe('save — nunca perder progresso por save rejeitado', () => {
  it('save local que não valida vira CÓPIA de segurança (não some)', () => {
    const mem = new Map<string, string>([[SAVE_KEY, '{"v":1,"quebrado":true}']]);
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => { mem.set(k, v); },
      removeItem: (k: string) => { mem.delete(k); },
    };
    const p = connectLocalPersistence(useGameStore as never, storage);
    p.stop();
    expect(mem.get(`${SAVE_KEY}.rejeitado`)).toBe('{"v":1,"quebrado":true}');
  });
});
