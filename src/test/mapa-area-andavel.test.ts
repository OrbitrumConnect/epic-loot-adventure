import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { isWalkable, walkStep } from '@/components/world/map-walk';
import { MAP_WALK, MAP_WALK_ROWS } from '@/components/world/map-walk-area';

/* 28/10 — parede invisível liberada: fora do quadrado de ±90 m vale a ÁREA ANDÁVEL medida no GLB
   (tools/bake-walk-area.mjs). Dentro do quadrado: tudo liberado como antes. */
const src = (f: string) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

describe('área andável do mapa', () => {
  it('dentro de ±90 m continua TUDO liberado (zero regressão)', () => {
    for (let x = -90; x <= 90; x += 7.5) for (let z = -90; z <= 90; z += 7.5) expect(isWalkable(x, z)).toBe(true);
  });

  it('lá fora tem área nova de verdade (> 15 mil m²) e o vazio continua fechado', () => {
    let cells = 0;
    MAP_WALK_ROWS.forEach((runs, j) => {
      const z = MAP_WALK.z0 + (j + 0.5) * MAP_WALK.cell;
      for (let k = 0; k + 1 < runs.length; k += 2) for (let i = runs[k]!; i < runs[k + 1]!; i++) {
        const x = MAP_WALK.x0 + (i + 0.5) * MAP_WALK.cell;
        if (Math.abs(x) > 90 || Math.abs(z) > 90) cells++;
      }
    });
    expect(cells * MAP_WALK.cell ** 2).toBeGreaterThan(15_000);
    for (const [x, z] of [[0, 260], [0, -260], [260, 0], [-260, 0], [200, 200], [-200, -200]]) expect(isWalkable(x!, z!)).toBe(false);
  });

  it('ASSENTAMENTO: todo ponto andável lá fora tem chão do GLB acima da água, com 3 m de chão em volta', async () => {
    // @ts-expect-error — ferramenta .mjs (sem tipos): mede o MESMO chão GLB que o jogo pisa
    const { loadMapGround } = await import('../../tools/map-glb.mjs');
    const { heightAt } = loadMapGround() as { heightAt: (x: number, z: number) => number | null };
    let rnd = 7;
    const rand = () => ((rnd = (rnd * 16807) % 2147483647) / 2147483647);
    let checked = 0;
    for (let n = 0; n < 40_000 && checked < 1500; n++) {
      const x = -140 + rand() * 280, z = -150 + rand() * 345;
      if ((Math.abs(x) <= 90 && Math.abs(z) <= 90) || !isWalkable(x, z)) continue;
      checked++;
      for (let a = 0; a < 8; a++) {
        const r = a === 0 ? 0 : 2.8, ang = a * Math.PI / 4;
        const h = heightAt(x + Math.cos(ang) * r, z + Math.sin(ang) * r);
        expect(h).not.toBeNull();
        expect(h!).toBeGreaterThan(-2.35);
      }
    }
    expect(checked).toBeGreaterThan(1000);
  }, 60_000);

  it('passo: desliza rente à borda, nunca sai; quem já está fora só volta pro centro', () => {
    // anda reto pra fora a partir de dentro: para na borda, sem atravessar
    let x = 0, z = 100;
    for (let s = 0; s < 400; s++) [x, z] = walkStep(x, z, x, z + 0.5);
    expect(isWalkable(x, z)).toBe(true);
    expect(z).toBeLessThan(200);
    // fora da área: só aceita passo que aproxima do centro
    expect(walkStep(0, 300, 0, 301)).toEqual([0, 300]);
    expect(walkStep(0, 300, 0, 299)).toEqual([0, 299]);
  });

  it('ligado: herói, bichos e piloto usam a mesma regra; o quadrado fixo saiu do herói e dos bichos', () => {
    const gw = src('src/components/game-world.tsx');
    expect(gw).toMatch(/\[nx, nz\] = walkStep\(body\.current\.position\.x, body\.current\.position\.z, nx, nz\);/);
    expect(gw).not.toMatch(/clamp\(nx, -MAP_HALF, MAP_HALF\)/);
    const ai = src('src/components/world/hostile-ai.ts');
    expect(ai).toMatch(/\[targetX, targetZ\] = walkStep\(g\.position\.x, g\.position\.z, targetX, targetZ\);/);
    expect(ai).not.toMatch(/clamp\(targetX, -MAP_HALF, MAP_HALF\)/);
    expect(src('src/components/world/auto-pilot.tsx')).toMatch(/const free = isWalkable\(to\.x, to\.z\);/);
  });

  it('favela: casas sólidas (forçado mesmo com layout salvo), parede medida contra o CHÃO REAL; bichos também', () => {
    expect(src('src/components/editor/editor-world.tsx')).toMatch(/isBridge \? 'floor' : isFavela \? 'block' : 'none'/);
    expect(src('src/components/editor/baked-layout.ts').match(/favela-b\.glb',\n\s*source: 'editor', selectable: true, visible: true, collide: 'block'/g)).toHaveLength(2);
    expect(src('src/components/world/terrain-collision.ts')).toMatch(/return top !== -Infinity && top > glbSurfaceY\(x, z, fallbackGround\) \+ 0\.8;/);
    expect(src('src/components/game-world.tsx')).toMatch(/const inWall = \(wx: number, wz: number\) => blockedByWall\(wx, wz, terrainHeight\(wx, wz\)\);/);
    expect(src('src/components/world/hostile-ai.ts')).toMatch(/if \(blockedByWall\(targetX, targetZ, terrainHeight\(targetX, targetZ\)\)\)/);
  });
});
