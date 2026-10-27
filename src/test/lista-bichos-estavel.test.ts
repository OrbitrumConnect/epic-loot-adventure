import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@react-three/drei', () => ({ useGLTF: Object.assign(vi.fn(), { preload: vi.fn() }), useAnimations: vi.fn(), Html: () => null }));
vi.mock('@react-three/fiber', () => ({ useFrame: vi.fn(), useThree: vi.fn(), createPortal: vi.fn() }));

/* 27/10 — auditoria do Caio (o jogo "não roda" no PC/celular dele), conferida no código: cada bicho que nascia
   refazia a lista com `start` novo pra TODOS (~224) → todos re-renderizavam (~300 ms travado, ~3×/s na horda). */
describe('lista de bichos estável', () => {
  const mk = (id: string, x = 0, name = 'Pirata') => ({ id, speciesId: 'raider_scout', name, position: { x, z: 0 } });
  it('bicho que não mudou devolve o MESMO objeto (não re-renderiza); só o novo ganha objeto novo', async () => {
    const { nextEnemyList } = await import('@/components/world/world-entities');
    const a = nextEnemyList(new Map(), [mk('a'), mk('b')]);
    const b = nextEnemyList(a.cache, [mk('a', 5), mk('b', 9), mk('c')]); // a/b andaram; c nasceu
    expect(b.list[0]).toBe(a.list[0]);       // mesmo objeto → memo pula
    expect(b.list[1]).toBe(a.list[1]);
    expect(b.list[0]!.start).toEqual({ x: 0, z: 0 }); // "start" é só onde nasceu (a IA move o corpo)
    expect(b.list[2]!.id).toBe('c');
    const c = nextEnemyList(b.cache, [mk('a', 5, 'Pirata Enfurecido'), mk('c')]); // b saiu; a virou Enfurecido
    expect(c.list[0]).not.toBe(b.list[0]);   // mudou de nome: só ele desenha de novo
    expect(c.list[1]).toBe(b.list[2]);
    expect(c.cache.has('b')).toBe(false);
  }, 20_000);
  it('componentes dos bichos com memo; roster inclui o nome', () => {
    const src = fs.readFileSync('src/components/world/world-entities.tsx', 'utf8').replace(/\r\n/g, '\n'); // Windows (CRLF)
    expect(src).toMatch(/const RaiderM = memo\(Raider\);/);
    expect(src).toMatch(/<RaiderM\n/);
    expect(src).toMatch(/<BeastM\n/);
    expect(src).toMatch(/<WolfM key=/);
  });
});

/* 27/10 — efeito visual (cel-shade) varria a cena inteira (~24,5 mil objetos) 4×/s; agora só quando entra objeto. */
describe('conversão toon só quando a cena muda', () => {
  it('objeto entrando na cena marca; a conversão consome; sem novidade a passada de segurança é a cada 3 s', async () => {
    const THREE = await import('three');
    const cel = await import('@/components/world/cel-shade');
    cel.takeSceneDirty();
    expect(cel.peekSceneDirty()).toBe(false);
    new THREE.Group().add(new THREE.Object3D());
    expect(cel.peekSceneDirty()).toBe(true);
    expect(cel.takeSceneDirty()).toBe(true);
    expect(cel.peekSceneDirty()).toBe(false);
    expect(cel.CONVERT_DIRTY_S).toBe(0.25); // mesmo ritmo de antes quando há novidade
    expect(cel.CONVERT_IDLE_S).toBe(3);
  }, 20_000);
});

/* 27/10 — sombra: interruptor GERAL junto com o do sol (15×/s); céu: cálculo reaproveitado por 0,1 s. */
describe('sombra e céu mais leves', () => {
  it('renderizador não checa sombra todo quadro (só o sol projeta sombra; mesma cadência de 15×/s)', () => {
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8').replace(/\r\n/g, '\n'); // Windows (CRLF)
    expect(gw).toMatch(/gl\.shadowMap\.autoUpdate = false;/);
    expect(gw).toMatch(/dir\.current\.shadow\.needsUpdate = true;\n\s*gl\.shadowMap\.needsUpdate = true;/);
  });
  it('dia/noite: mesma resposta dentro de 0,1 s (sem lixo de memória); passou disso, recalcula', async () => {
    const { dayNight, DAYNIGHT_REUSE_MS } = await import('@/game/systems/dayNightSystem');
    const t = Date.now();
    const a = dayNight(t);
    expect(dayNight(t + 50)).toBe(a);
    expect(dayNight(t + DAYNIGHT_REUSE_MS + 1)).not.toBe(a);
  });
});
