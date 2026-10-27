import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { shouldMountCreature } from '@/components/world/creature-culling';
import { Beast } from '@/components/world/beast';
import { Raider } from '@/components/world/raider';
import { Wolf } from '@/components/world/wolf';

const worldEntities = readFileSync('src/components/world/world-entities.tsx', 'utf8');

describe('culling de criatura por distância', () => {
  it('entra no raio, mantém pela histerese e sai acima do raio + 15', () => {
    expect(shouldMountCreature(85 ** 2, 85, false, 'iso')).toBe(true);
    expect(shouldMountCreature(100 ** 2, 85, true, 'iso')).toBe(true);
    expect(shouldMountCreature(100.01 ** 2, 85, true, 'iso')).toBe(false);
    expect(shouldMountCreature(90 ** 2, 85, false, 'iso')).toBe(false);
  });

  it('nunca corta no modo de câmera livre', () => {
    expect(shouldMountCreature(999999 ** 2, 85, false, 'free')).toBe(true);
    expect(shouldMountCreature(999999 ** 2, 85, true, 'free')).toBe(true);
  });

  it('liga Enemies aos três raios e à função de decisão', () => {
    expect(worldEntities).toContain('shouldMountCreature');
    expect(worldEntities).toContain('ISO_CREATURE_RENDER_RADIUS');
    expect(worldEntities).toContain('THIRD_CREATURE_RENDER_RADIUS');
    expect(worldEntities).toContain('FREE_CREATURE_RENDER_RADIUS');
  });

  it('exporta Beast, Raider e Wolf como memo', () => {
    const memoType = Symbol.for('react.memo');
    expect((Beast as any).$$typeof).toBe(memoType);
    expect((Raider as any).$$typeof).toBe(memoType);
    expect((Wolf as any).$$typeof).toBe(memoType);
  });

  it('mantém todas criaturas montadas e passa renderBody', () => {
    expect(worldEntities).toContain('useGameStore.getState().creatures.map(cr => ({');
    expect(worldEntities).toContain('start: { x: cr.position.x, z: cr.position.z }');
    expect(worldEntities).not.toContain('filter(cr => mountedIds.current.has(cr.id))');
    expect(worldEntities.match(/renderBody=\{renderBodyIds\.current\.has\(cr\.id\)\}/g)?.length).toBe(3);
  });

  it('mantém group externo e omite corpo quando renderBody false', () => {
    for (const file of ['beast.tsx', 'raider.tsx', 'wolf.tsx']) {
      const source = readFileSync(`src/components/world/${file}`, 'utf8');
      expect(source).toContain('renderBody &&');
      expect(source).toContain('<group ref={ref}');
    }
  });
});
