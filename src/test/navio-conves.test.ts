import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { carryOnDeck, nearWarshipHull, newWarship, WARSHIP, warshipLocal, warshipWorld } from '@/components/zona-sul/zs-warship';
import { type ShipCollider, shipGround, SHIP_STEP } from '@/components/zona-sul/zs-ship';

/* CONVÉS ANDÁVEL do navio de guerra (Pedro 01/11: "o player nada dentro do navio — sem colisão, não consigo andar em cima
   dele"; "aperta E sobe no navio, na parte de trás acessa e dirige, E sai; amigos e inimigos sobem também — pirataria"). */
describe('navio de guerra — convés', () => {
  it('coordenadas do navio: boreste = +u, proa = +v; ida e volta batem', () => {
    const s = newWarship(10, 20, 0.7);
    const right = warshipWorld(s, 1, 0), bow = warshipWorld(s, 0, 1);
    expect(right.x - s.x).toBeCloseTo(Math.cos(s.yaw)); expect(right.z - s.z).toBeCloseTo(-Math.sin(s.yaw));
    expect(bow.x - s.x).toBeCloseTo(Math.sin(s.yaw)); expect(bow.z - s.z).toBeCloseTo(Math.cos(s.yaw)); // frente = (sin, cos)
    const l = warshipLocal(s, 13.2, 11.9), w = warshipWorld(s, l.u, l.v);
    expect(w.x).toBeCloseTo(13.2); expect(w.z).toBeCloseTo(11.9);
  });

  it('quem está no convés vai JUNTO: o navio anda e gira, a pessoa fica no mesmo lugar do navio', () => {
    const a = { x: 0, z: 0, yaw: 0 }, b = { x: 5, z: 12, yaw: 0.4 };
    const p = warshipWorld(a, 2, -8); // 2 m pra boreste, 8 m pra popa
    const q = carryOnDeck(a, b, p.x, p.z), l = warshipLocal(b, q.x, q.z);
    expect(l.u).toBeCloseTo(2); expect(l.v).toBeCloseTo(-8);
  });

  it('"perto do casco" vale ao longo do navio inteiro (não só do centro — ele tem 32 m)', () => {
    const s = newWarship(0, 0, 0);
    const proa = warshipWorld(s, 0, WARSHIP.LENGTH / 2 + 2);
    expect(Math.hypot(proa.x, proa.z)).toBeGreaterThan(WARSHIP.BOARD_DIST); // longe do centro…
    expect(nearWarshipHull(s, proa.x, proa.z, 4, WARSHIP.BOARD_MARGIN)).toBe(true); // …mas colado na proa
    const longe = warshipWorld(s, 4 + WARSHIP.BOARD_MARGIN + 1, 0);
    expect(nearWarshipHull(s, longe.x, longe.z, 4, WARSHIP.BOARD_MARGIN)).toBe(false);
  });

  it('colisor que se mexe: convés relativo à quilha + pose do quadro (subir/descer com a onda e adernar)', () => {
    // convés 4 m acima da quilha numa grade 6 × 10 (1 m), mastro no meio (mais alto que um degrau)
    const nu = 6, nv = 10, deck = new Float32Array(nu * nv).fill(4);
    deck[5 * nu + 3] = 9;
    const c: ShipCollider = { cx: 0, cz: 0, cos: 1, sin: 0, u0: -3, v0: -5, nu, nv, cell: 1, deck, plank: null, ladder: null, y0: -2, tiltU: 0, tiltV: 0 };
    expect(shipGround(c, 0.5, 2.5, 2)).toEqual({ y: 2 });            // em pé no convés: quilha (−2) + 4
    expect(shipGround(c, 0.5, 2.5, -0.5)).toEqual({ wall: true });   // nadando por baixo: o casco é PAREDE
    expect(shipGround(c, 0.5, 0.5, 2)).toEqual({ wall: true });      // mastro: mais alto que um degrau
    expect(shipGround(c, 9, 0, 2)).toBeNull();                       // fora do navio
    c.y0 = -1.7;                                                      // a onda levantou o navio 0,3 m
    expect((shipGround(c, 0.5, 2.5, 2) as { y: number }).y).toBeCloseTo(2.3);
    c.y0 = -2; c.tiltU = Math.sin(0.1);                               // adernou: boreste sobe
    expect((shipGround(c, 2.5, 2.5, 2.3) as { y: number }).y).toBeGreaterThan((shipGround(c, -2.5, 2.5, 2.3) as { y: number }).y);
    c.cx = 100; c.tiltU = 0;                                          // o navio andou 100 m: o convés foi junto
    expect(shipGround(c, 100.5, 2.5, 2)).toEqual({ y: 2 });
    expect(SHIP_STEP).toBe(0.75);
  });

  it('no jogo: E sobe a bordo (qualquer nível), no timão pilota (70), solta o timão no convés, longe dele desce', () => {
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    // (01/11, online: o navio de OUTRO jogador também — sobe e desce; pilotar só o seu)
    expect(zs).toMatch(/if \(ship && ship\.sinkT === null && nearWarshipHull\(ship, p\.x, p\.z, warshipHalfBeam\(\), WARSHIP\.BOARD_MARGIN\)\) return \{ act: 'subir', who: null \};/);
    expect(zs).toMatch(/act: Math\.hypot\(h\.x - p\.x, h\.z - p\.z\) < WARSHIP\.HELM_REACH \? 'pilotar' : 'descer', who: null/);
    expect(zs).toMatch(/const at = rd \? warshipBoardSpot\(rd\.pose, p\.x, p\.z, rd\.c\) : warshipBoardSpot\(selPose, p\.x, p\.z\);/);
    expect(zs).toMatch(/const c = carryOnDeck\(before, ship, p\.x, p\.z\)/);
    expect(zs).toMatch(/shipGround\(zsShip\.c, x, z, feetY\) \?\? shipGround\(zsWarshipDeck\.c, x, z, feetY\)/);
    expect(zs).toMatch(/for \(const d of remoteDecks\.values\(\)\) \{ const g = shipGround\(d\.c, x, z, feetY\); if \(g\) return g; \}/);
    const view = fs.readFileSync('src/components/zona-sul/zs-warship-view.tsx', 'utf8');
    expect(view).toMatch(/const ps = warshipPose\(s, t\);/); // o desenho e o colisor usam a MESMA pose
    expect(view).toMatch(/if \(!g\.boundsTree\) computeBoundsTree\.call\(g\);/); // escaneia com árvore de raio (sem travar a tela)
  });
});
