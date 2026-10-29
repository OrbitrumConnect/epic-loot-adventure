import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { matHl, matHpBg, matHpFill, matRing, ringGeometry } from '../components/world/enemy-label';

const arquivo = resolve(process.cwd(), 'src/components/world/enemy-label.tsx');

describe('materiais e geometrias compartilhados da plaquinha', () => {
  it('reutiliza objetos por cor e por raio', () => {
    expect(matHl('#c9a227')).toBe(matHl('#c9a227'));
    expect(matHl('#c9a227')).not.toBe(matHl('#ffffff'));
    expect(matHpBg('#101d19')).toBe(matHpBg('#101d19'));
    expect(matHpBg('#101d19')).not.toBe(matHpBg('#ffffff'));
    expect(matHpFill()).toBe(matHpFill('#c8412f'));
    expect(matHpFill()).not.toBe(matHpFill('#ffffff'));
    expect(matRing('#c9a227')).toBe(matRing('#c9a227'));
    expect(matRing('#c9a227')).not.toBe(matRing('#ffffff'));
    expect(ringGeometry(0.6)).toBe(ringGeometry(0.6004));
    expect(ringGeometry(0.6)).not.toBe(ringGeometry(0.7));
  });

  it('liga meshes a caches e preserva nome inline', () => {
    const fonte = readFileSync(arquivo, 'utf8').replace(/\r\n/g, '\n');

    // Sobra exatamente um de cada: mesh do nome, inline para R3F descartar no desmonte.
    expect((fonte.match(/<meshBasicMaterial/g) ?? []).length).toBe(1);
    expect((fonte.match(/<planeGeometry/g) ?? []).length).toBe(1);
    expect((fonte.match(/material=\{/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((fonte.match(/geometry=\{/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((fonte.match(/<ringGeometry/g) ?? []).length).toBe(0);
  });
});
