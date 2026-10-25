import fs from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: vi.fn() }));
import { buildSepGrid, creatureAnchors, separationPush, CHASE_STOP } from '@/components/world/hostile-ai';

/* Pedro, 25/10: "os inimigos têm colisão pra não ficarem juntos batendo no mesmo lugar? deixa pro elite".
   Antes: raio fixo 1,1 m pra todos (grandões se sobrepunham), todos paravam a 60% do alcance (amontoados) e cada
   um comparava com TODOS (~40 mil contas/quadro). Agora: soma dos raios do corpo, grade de vizinhança, cerco. */
let frame = 0;
afterEach(() => creatureAnchors.clear());
const put = (id: string, x: number, z: number, r: number) => creatureAnchors.set(id, { x, y: 0, z, top: 1, alive: true, r });

describe('separação entre inimigos', () => {
  it('dois grandões (Couraça r≈0,73) a 1,2 m se empurram; dois pequenos (0,26) a 1,2 m não', () => {
    put('a', 0, 0, 0.73); put('b', 1.2, 0, 0.73);
    buildSepGrid(++frame);
    expect(separationPush('a', 0, 0, 0.73).x).toBeLessThan(0); // empurra pra longe de b
    creatureAnchors.clear();
    put('a', 0, 0, 0.26); put('b', 1.2, 0, 0.26);
    buildSepGrid(++frame);
    expect(separationPush('a', 0, 0, 0.26)).toEqual({ x: 0, z: 0 });
  });

  it('grade: só os vizinhos contam (quem está a 20 m não entra) e funciona na divisa das células', () => {
    put('a', 2.9, 0, 0.6); put('vizinho', 3.1, 0, 0.6); put('longe', 22, 0, 0.6);
    buildSepGrid(++frame);
    const p = separationPush('a', 2.9, 0, 0.6);
    expect(p.x).toBeLessThan(0);
  });

  it('desempenho: 200 criaturas espalhadas — a grade olha bem menos que todas × todas', () => {
    for (let i = 0; i < 200; i++) put(`c${i}`, (i % 20) * 9 - 90, Math.floor(i / 20) * 18 - 90, 0.6);
    buildSepGrid(++frame);
    const t0 = performance.now();
    for (const [id, a] of creatureAnchors) separationPush(id, a.x, a.z, 0.6);
    expect(performance.now() - t0).toBeLessThan(15); // 200 consultas (todas × todas seriam 40 mil comparações)
  });

  it('perseguidor para na BORDA do alcance (cerco) e cada tipo passa o raio do corpo', () => {
    expect(CHASE_STOP).toBeGreaterThanOrEqual(0.8);
    const ai = fs.readFileSync('src/components/world/hostile-ai.ts', 'utf8');
    expect(ai).toMatch(/if \(distToPlayer > tuning\.attackRange \* CHASE_STOP\)/);
    expect(fs.readFileSync('src/components/world/beast.tsx', 'utf8')).toMatch(/bodyRadius: spec\.ringRadius \* 0\.75/);
    expect(fs.readFileSync('src/components/world/raider.tsx', 'utf8')).toMatch(/bodyRadius,/);
  });
});
