import { describe, expect, it } from 'vitest';
import { farmZsZone, zsRadiusToPct, zsWorldToPct, ZS_MAP_BOUNDS } from '@/components/hud/zs-map';
import { useGameStore } from '@/game/state/game-store';
import { HUNT_AREA_RADIUS } from '@/game/systems/objectiveSystem';
import type { ZsZone } from '@/game/data/zs-zones';

const zone = (over: Partial<ZsZone> = {}): ZsZone => ({
  id: 'lagoon',
  biome: 'lagoon',
  name: 'Beira da Lagoa',
  description: 'teste',
  speciesIds: ['boar'],
  center: { x: 12, z: -8 },
  radius: 40,
  levelMin: 1,
  levelMax: 3,
  creatureCount: 5,
  ...over,
});

describe('mapeamento mundo → fundo (Zona Sul)', () => {
  it('canto noroeste = 0%, canto sudeste = 100%, centro = 50%', () => {
    expect(zsWorldToPct(ZS_MAP_BOUNDS.minX, ZS_MAP_BOUNDS.minZ)).toEqual({ left: 0, top: 0 });
    expect(zsWorldToPct(ZS_MAP_BOUNDS.maxX, ZS_MAP_BOUNDS.maxZ)).toEqual({ left: 100, top: 100 });
    // 02/11 (Gávea + Cagarras): o mapa cresceu pra oeste/sul — o (0, 0) do jogo não é mais o meio da imagem
    const mid = zsWorldToPct((ZS_MAP_BOUNDS.minX + ZS_MAP_BOUNDS.maxX) / 2, (ZS_MAP_BOUNDS.minZ + ZS_MAP_BOUNDS.maxZ) / 2);
    expect(mid.left).toBeCloseTo(50, 1);
    expect(mid.top).toBeCloseTo(50, 1);
    const o = zsWorldToPct(0, 0);
    expect(o.left).toBeGreaterThan(50); expect(o.top).toBeLessThan(50); // a área de antes fica a leste/norte da nova
  });

  it('prende fora dos limites em 0..100', () => {
    expect(zsWorldToPct(-99999, -99999)).toEqual({ left: 0, top: 0 });
    expect(zsWorldToPct(99999, 99999)).toEqual({ left: 100, top: 100 });
  });

  it('raio vira elipse em % (X mais largo que Z)', () => {
    const { rx, ry } = zsRadiusToPct(100);
    expect(rx).toBeGreaterThan(0);
    expect(ry).toBeGreaterThan(rx); // Z é mais curto, então mesma distância ocupa mais %
  });
});

describe('farmar zona manda o piloto pro centro com o raio da zona', () => {
  it('cria hunt_area no centro, com o raio da zona, e liga o modo idle', () => {
    farmZsZone(zone({ center: { x: 12, z: -8 }, radius: 40 }));
    const st = useGameStore.getState();
    expect(st.objectives.mode).toBe('idle');
    const area = st.objectives.items.find(o => o.kind === 'hunt_area');
    expect(area).toBeTruthy();
    expect(area!.position).toEqual({ x: 12, z: -8 });
    expect(area!.radius).toBe(Math.max(HUNT_AREA_RADIUS, 40 + 8));
  });

  it('zona pequena ainda garante ao menos HUNT_AREA_RADIUS', () => {
    farmZsZone(zone({ id: 'field', biome: 'field', center: { x: 30, z: 30 }, radius: 1 }));
    const area = useGameStore.getState().objectives.items.find(o => o.targetId === 'area_30_30');
    expect(area).toBeTruthy();
    expect(area!.radius).toBeGreaterThanOrEqual(HUNT_AREA_RADIUS);
  });
});

/* 05/11 (Pedro: "ok go" — usar no mapa do K o mesmo do mapa do renascer): o terrain.png é DADO (cru fica verde-neon) e a caixa
   estava em 400×264 (de antes da expansão de 02/11, o terreno é 560×523) → pinos/zonas esticados de lado. */
describe('mapa do K: desenhado e na proporção do terreno', () => {
  it('usa o mapa desenhado (nunca o PNG de dado cru) e a caixa na proporção do terreno, sem esticar', async () => {
    const fs = await import('node:fs');
    const v = fs.readFileSync('src/components/hud/zs-map.tsx', 'utf8');
    expect(v).toContain('zsMapArtUrl().then((u) => { if (on) setArt(u); })');
    expect(v).not.toContain('src={ZS_TERRAIN.url}');
    expect(v).toContain("style={{ ['--ar' as string]: String(ZS_TERRAIN.w / ZS_TERRAIN.h) }}");
    const css = fs.readFileSync('src/styles.css', 'utf8');
    expect(css).not.toContain('aspect-ratio: 400 / 264');
    expect(css).toContain('.zs-map-box { flex: 1 1 auto; align-self: stretch; min-height: 0; container-type: size;');
    expect(css).toContain('width: min(100cqw, calc(100cqh * var(--ar, 1.07))); height: auto; aspect-ratio: var(--ar, 1.07);');
    // na proporção certa, a zona de fauna é CÍRCULO na tela: rx% da largura = ry% da altura em pixels
    const { rx, ry } = zsRadiusToPct(100), W = 560, H = 523;
    expect((rx / 100) * W).toBeCloseTo((ry / 100) * H, 2); // (o vão entre o 1º e o último pixel: 559 × 522 — 0,01%)
  });
});
