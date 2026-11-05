import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_ROOMS, CAVE_TUNNELS, caveField, caveFloorAt, caveMove, caveStandAt, setCaveTerrain, spiralY } from '@/components/zona-sul/zs-cave';
import { CHASM, FALL, caveCheckpoints, caveEntrySpot, chasmReturn, chasmZone, checkpointAt, edgeDrop, fallDamage, fallDamagePct, fellIntoChasm } from '@/components/zona-sul/zs-chasm';
import { ZS_RUN, ZS_WALK } from '@/components/zona-sul/zs-move';

/* Pedro, 05/11: "caminho até ele mais longe com parkour (pula; caiu no precipício volta pro checkpoint)" · "o caminho para o
   boss mais curto vai continuar curto daquele jeito fácil?" · "o ideal seria não ali na descida — a boa seria no TÚNEL, no
   caminho" · "o parkour só vai dar bom se tiver dano de queda — correto por vida e altura". Antes: a garganta (fundo do
   abismo → balcão do covil) tinha 53 m e sem dano de queda se pulava do balcão direto na arena (93 m). Agora: a garganta
   passa pela FENDA (o precipício com colunas), a rampa do covil é inteira (girada pro balcão novo) e cair dói. */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
  setCaveTerrain(t);
});
const room = (id: string) => CAVE_ROOMS.find((r) => r.id === id)!;
const fenda = room('fenda'), covil = room('covil'), abismo = room('abismo'), ch = fenda.chasm!;
const F = (u: number, v: number) => ({ x: fenda.x + u * Math.cos(fenda.yaw) - v * Math.sin(fenda.yaw), z: fenda.z + u * Math.sin(fenda.yaw) + v * Math.cos(fenda.yaw) });
const Y = fenda.y; // o chão das beiradas

/** O MESMO corpo do herói na caverna (zona-sul-world): passo do caveMove, cai se o chão some, pulo 6,2 m/s, gravidade 15. */
type Hero = { x: number; z: number; y: number; vy: number; grounded: boolean; fallFrom: number };
function step(h: Hero, dx: number, dz: number, jump: boolean, dt: number): 'fell' | null {
  const cm = caveMove(t, h.x, h.z, h.y, dx, dz);
  const st = cm ?? { x: h.x + dx, z: h.z + dz, ground: zsHeightAt(t, h.x + dx, h.z + dz) };
  h.x = st.x; h.z = st.z;
  if (h.grounded && st.ground < h.y - 0.8) { h.grounded = false; h.vy = 0; }
  if (!h.grounded && h.vy > 0 && caveField(h.x, h.y + 1.85, h.z) > -0.05) h.vy = 0;
  if (jump && h.grounded) { h.vy = 6.2; h.grounded = false; }
  if (!h.grounded) { h.vy -= 15 * dt; h.y += h.vy * dt; if (h.y <= st.ground) { h.y = st.ground; h.grounded = true; h.vy = 0; } }
  else h.y += (st.ground - h.y) * Math.min(1, dt * 30);
  if (h.grounded) h.fallFrom = h.y;
  else if (fellIntoChasm(true, h.fallFrom, h.y, h.x, h.z)) return 'fell';
  return null;
}
/** Corre (na `speed`) passando pelos pontos `way`; `jumps` = pula quando o chão some logo à frente (o jogador vê o vão). */
function run(start: { x: number; z: number }, way: { x: number; z: number }[], speed: number, jumps: boolean) {
  const h: Hero = { ...start, y: caveFloorAt(start.x, start.z, Y + 1)!, vy: 0, grounded: true, fallFrom: 0 };
  h.fallFrom = h.y;
  const dt = 1 / 60, cps: string[] = [];
  let jumped = 0, k = 0, i = 0;
  for (; k < 60 * 120 && i < way.length; k++) {
    const tg = way[i]!, l = Math.hypot(tg.x - h.x, tg.z - h.z);
    if (l < 0.7 && h.grounded) { i++; continue; }
    const ux = (tg.x - h.x) / l, uz = (tg.z - h.z) / l;
    const ahead = caveFloorAt(h.x + ux * 1.0, h.z + uz * 1.0, h.y);
    const jump = jumps && h.grounded && (ahead === null || ahead < h.y - 2);
    if (jump) jumped++;
    if (step(h, ux * speed * dt, uz * speed * dt, jump, dt) === 'fell') return { ok: false, fell: true, h, cps, jumped, at: i };
    if (h.grounded) { const c = checkpointAt(h.x, h.y, h.z); if (c && cps[cps.length - 1] !== c.id) cps.push(c.id); }
  }
  return { ok: i >= way.length, fell: false, h, cps, jumped, at: i };
}
const stones = ch.stones.map((s) => F(s.u, s.v));
const westLedge = F(-24, 0), eastLedge = F(24, 0);

describe('o caminho até o Canibal passa pela FENDA (parkour no túnel)', () => {
  it('a garganta não vai mais direto (53 m): sai da galeria grande e sobe até a fenda; do outro lado um túnel até o balcão novo', () => {
    const g = CAVE_TUNNELS.find((q) => q.id === 'garganta')!, fc = CAVE_TUNNELS.find((q) => q.id === 'fenda-covil')!;
    const len = (pts: { x: number; z: number }[]) => pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i]!.x, p.z - pts[i]!.z), 0);
    // fundo do abismo → galeria grande (~63 m) → garganta (~30 m) → fenda (60 m) → túnel (~68 m): ~220 m (antes 53 m direto)
    const gal = CAVE_TUNNELS.find((q) => q.id === 'galeria-alto')!;
    expect(Math.hypot(g.pts[0]!.x - gal.pts[0]!.x, g.pts[0]!.z - gal.pts[0]!.z) + len(g.pts) + 2 * fenda.rx + len(fc.pts)).toBeGreaterThan(200);
    // a garganta começa EM CIMA do eixo da galeria grande, no chão dela
    const a2 = gal.pts[1]!, a3 = gal.pts[2]!, k = (g.pts[0]!.x - a2.x) / (a3.x - a2.x);
    expect(Math.abs(g.pts[0]!.z - (a2.z + (a3.z - a2.z) * k))).toBeLessThan(0.5); expect(Math.abs(g.pts[0]!.y - (a2.y + (a3.y - a2.y) * k))).toBeLessThan(0.2);
    expect(Math.hypot(g.pts[g.pts.length - 1]!.x - F(-32, 0).x, g.pts[g.pts.length - 1]!.z - F(-32, 0).z)).toBeLessThan(1);
    expect(Math.hypot(fc.pts[0]!.x - F(32, 0).x, fc.pts[0]!.z - F(32, 0).z)).toBeLessThan(1);
    // o túnel chega no COMEÇO da rampa do covil (o balcão, 38 m)
    const end = fc.pts[fc.pts.length - 1]!, sp = covil.spiral!;
    const a = Math.atan2((end.z - covil.z) / covil.rz, (end.x - covil.x) / covil.rx);
    expect(Math.abs(a - sp.a0)).toBeLessThan(0.05); expect(end.y).toBe(sp.yTop);
    // peças novas no FIM das listas (as de antes ficam iguais)
    expect(CAVE_ROOMS[CAVE_ROOMS.length - 1]!.id).toBe('fenda');
    expect(CAVE_TUNNELS[CAVE_TUNNELS.length - 1]!.id).toBe('fenda-covil');
  });

  it('a fenda: beiradas a 40 m, PRECIPÍCIO de 36 m × 28 m de fundo no meio, 5 colunas — e nenhum chão invisível no vão', () => {
    expect(ch.u1 - ch.u0).toBe(36); expect(ch.depth).toBe(28); expect(ch.stones).toHaveLength(5);
    expect(caveStandAt(westLedge.x, westLedge.z, Y + 1)).toBeCloseTo(Y, 1);
    expect(caveStandAt(eastLedge.x, eastLedge.z, Y + 1)).toBeCloseTo(Y, 1);
    ch.stones.forEach((s, i) => expect(caveStandAt(stones[i]!.x, stones[i]!.z, Y + 1), `coluna ${i + 1}`).toBeCloseTo(Y + s.dy, 1));
    // no vão (fora das colunas) o chão é o FUNDO — nada no meio (a "aura" de chão do covil não pode chegar aqui)
    let n = 0;
    for (let u = ch.u0 + 0.5; u < ch.u1; u += 0.5) for (let v = -fenda.rz; v <= fenda.rz; v += 0.5) {
      if (ch.stones.some((s) => Math.hypot(u - s.u, v - s.v) < s.r + 0.4)) continue;
      const p = F(u, v), fl = caveFloorAt(p.x, p.z, Y + 1);
      if (fl === null || caveField(p.x, Y - 0.5, p.z) > 0) continue; // parede/fora
      n++;
      expect(fl, `chão no vão em u ${u} v ${v}`).toBeLessThan(Y - 20);
    }
    expect(n).toBeGreaterThan(400);
  });

  it('a malha corta a beirada e a coluna EXATAMENTE onde o pé cai (o campo é distância — sem a escada do voxel)', () => {
    for (const v of [-4, 0, 4]) {
      let edge = NaN;
      for (let u = ch.u0 - 2; u < ch.u0 + 2; u += 0.02) { const p = F(u, v); if ((caveFloorAt(p.x, p.z, Y + 1) ?? -99) < Y - 3) { edge = u; break; } }
      expect(edge).not.toBeNaN();
      const pIn = F(edge - 0.3, v), pOut = F(edge + 0.3, v);
      expect(caveField(pIn.x, Y - 0.5, pIn.z), 'beirada: rocha embaixo do pé').toBeGreaterThan(0);
      expect(caveField(pOut.x, Y - 0.5, pOut.z), 'vão: ar').toBeLessThan(0);
      expect(Math.abs(caveField(pIn.x, Y - 3, pIn.z))).toBeLessThan(0.75);
    }
    const s = ch.stones[2]!, top = Y + s.dy, side = F(s.u + s.r + 0.4, s.v), on = F(s.u + s.r - 0.4, s.v);
    expect(caveField(on.x, top - 0.5, on.z)).toBeGreaterThan(0);
    expect(caveField(side.x, top - 0.5, side.z)).toBeLessThan(0);
  });

  it('CORRENDO e pulando: da beira de cá até a de lá de coluna em coluna, sem cair, pegando os 2 checkpoints', () => {
    const r = run(F(-27, 0), [...stones, eastLedge, F(27, 0)], ZS_RUN, true);
    expect(r.fell, `caiu indo pro ponto ${r.at}`).toBe(false);
    expect(r.ok).toBe(true);
    expect(r.jumped).toBeGreaterThanOrEqual(6);                        // 6 saltos (beira → 5 colunas → beira)
    expect(r.cps).toEqual(['fenda_inicio', 'fenda_fim']);
  }, 60_000);

  it('CADA salto pede pulo: correndo sem pular a queda não alcança o outro lado; andando nem pulando passa', () => {
    const plats = [westLedge, ...stones, eastLedge];
    for (let i = 0; i + 1 < plats.length; i++) {
      const from = i === 0 ? F(-21, 0) : plats[i]!, to = plats[i + 1]!;
      const semPulo = run(from, [to], ZS_RUN, false);
      expect(semPulo.fell, `salto ${i + 1}: correndo sem pular passou`).toBe(true);
      const pulando = run(from, [to], ZS_RUN, true);
      expect(pulando.fell, `salto ${i + 1}: pulando caiu`).toBe(false);
    }
    expect(run(F(-21, 0), [stones[0]!], ZS_WALK, true).fell).toBe(true);
  }, 60_000);

  it('caiu na fenda: pego no ar (antes do fundo), volta pra beira de cá — e custa 25% da vida', () => {
    const h: Hero = { ...F(-16, 0), y: Y, vy: 0, grounded: false, fallFrom: Y };
    let fell = false;
    for (let k = 0; k < 300 && !fell; k++) fell = step(h, 0, 0, false, 1 / 60) === 'fell';
    expect(fell).toBe(true); expect(h.y).toBeGreaterThan(Y - ch.depth);
    expect(chasmZone(h.x, h.z)).toBe('fenda');
    expect(chasmReturn('fenda_inicio', h.x, Y, h.z).id).toBe('fenda_inicio');
    expect(chasmReturn(null, h.x, Y, h.z).id).toBe('fenda_inicio');      // sem nenhum pego: o mais perto
    expect(CHASM.PIT_PCT).toBe(0.25);
  });

  it('a rampa do covil é INTEIRA de novo (sem vão): o atalho de pular do balcão na arena = volta pro checkpoint', () => {
    // a conta da rampa é a de sempre: qualquer ponto do anel tem a altura da volta
    const sp = covil.spiral!;
    for (const deg of [20, 90, 161, 200, 280, 300]) {
      const th = sp.a0 + (deg * Math.PI) / 180, u = 0.92 * covil.rx * Math.cos(th), v = 0.92 * covil.rz * Math.sin(th);
      expect(spiralY(covil, u, v)).toBeCloseTo(sp.yTop - ((deg * Math.PI) / 180 / sp.sweep) * (sp.yTop - covil.y), 6);
    }
    const top = caveCheckpoints().find((c) => c.id === 'covil_topo')!;
    expect(fellIntoChasm(true, top.y, top.y - CHASM.FALL_M - 0.1, covil.x, covil.z)).toBe(true);
    expect(fellIntoChasm(true, 99, 99 - CHASM.FALL_M - 0.1, abismo.x, abismo.z)).toBe(true);
    expect(fellIntoChasm(true, 99, 99 - CHASM.FALL_M + 0.5, abismo.x, abismo.z)).toBe(false); // pulinho/degrau não conta
    expect(fellIntoChasm(false, 99, 50, abismo.x, abismo.z)).toBe(false);                      // fora da caverna, não
    expect(fellIntoChasm(true, 99, 50, -452, -165)).toBe(false);                               // longe dos precipícios, não
  });

  it('DANO DE QUEDA por altura e pela vida: até 6 m nada; 15 m = metade; 24 m mata — a mesma % pro nível 1 e pro 80', () => {
    expect(FALL).toEqual({ SAFE_M: 6, LETHAL_M: 24 });
    expect(fallDamagePct(1.3)).toBe(0); expect(fallDamagePct(6)).toBe(0);            // o pulo (1,3 m) e ~2 andares: nada
    expect(fallDamagePct(15)).toBeCloseTo(0.5, 5); expect(fallDamagePct(24)).toBe(1); expect(fallDamagePct(90)).toBe(1);
    expect(fallDamage(15, 200)).toBe(100); expect(fallDamage(15, 30000)).toBe(15000); // % da vida máxima
    expect(fallDamage(6.05, 200)).toBe(1);                                          // passou do seguro: pelo menos 1
    expect(fallDamage(30, 200)).toBe(200);                                          // mortal
    expect(fallDamage(5, 999999)).toBe(0);
  });

  it('checkpoints: 7 no caminho (abismo 2, fenda 2, covil 3), no chão, cada um pega só perto; o marco fica do lado', () => {
    const all = caveCheckpoints();
    expect(all.map((c) => c.id)).toEqual(['abismo_topo', 'abismo_fundo', 'fenda_inicio', 'fenda_fim', 'covil_topo', 'covil_meio', 'covil_pe']);
    for (const c of all) {
      expect(caveStandAt(c.x, c.z, c.y + 1), c.name).toBeCloseTo(c.y, 1);
      expect(checkpointAt(c.x + 2, c.y, c.z)?.id).toBe(c.id);
      expect(checkpointAt(c.x, c.y + 8, c.z)).toBeNull();
      expect(Math.hypot(c.mark.x - c.x, c.mark.z - c.z), c.name).toBeGreaterThan(2); expect(Math.abs(c.mark.y - c.y), c.name).toBeLessThan(1.5);
    }
    // o pé da rampa fica abaixo da queda que conta: dali pra arena se desce pulando (com um pouco de dano)
    expect(all.find((c) => c.id === 'covil_pe')!.y - covil.y).toBeLessThan(CHASM.FALL_M);
  });

  it('renascer na ENTRADA DA CAVERNA: do lado de fora da boca do Pico, no chão do mapa (não no buraco), olhando pra dentro', () => {
    const e = caveEntrySpot(), g = zsHeightAt(t, e.x, e.z);
    expect(Math.abs(g - 108.6)).toBeLessThan(6);                      // na encosta, perto da boca (108,6 m)
    expect(caveField(e.x, g + 0.5, e.z)).toBeGreaterThan(0);          // fora da caverna (não cai no buraco)
    const m = CAVE_TUNNELS.find((q) => q.id === 'pico-tijuca')!.pts;
    expect(Math.hypot(e.x - m[0]!.x, e.z - m[0]!.z)).toBeCloseTo(6, 1);
    expect(Math.cos(e.yaw - Math.atan2(m[1]!.x - m[0]!.x, m[1]!.z - m[0]!.z))).toBeGreaterThan(0.99); // virado pra boca
  });

  it('o piloto/clique não se joga na beira; ligado no mundo: dano de queda, precipício com dano, checkpoint, tela escura', () => {
    expect(edgeDrop(20, 19)).toBe(false); expect(edgeDrop(20, -55)).toBe(true);
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain('if (cm && autoRun && grounded.current && edgeDrop(p.y, cm.ground)) {');
    expect(w).toContain('if (wasAir && !st.swimming) { const h = airTop.current - p.y, dmg = fallDamage(h, gs.player.maxHp); if (dmg > 0) hurtPlayerByFall(dmg, h, { x: p.x, z: p.z }); }');
    expect(w).toContain('if (nowMs - airSeen.current > 150) airTop.current = p.y;'); // voltou a pé (carro/asa/skate): conta dali
    expect(w).toContain('else if (fellIntoChasm(zsCave.inCave, fallFrom.current, p.y, p.x, p.z)) {');
    expect(w).toContain('hurtPlayerByFall(Math.max(1, Math.round(gs.player.maxHp * CHASM.PIT_PCT)), h, { x: c.x, z: c.z }, c.name);');
    expect(w).toContain('zsRespawnMem.cave = zsChasm.last ? caveEntrySpot() : null; resetChasm(); }'); // checkpoints valem a vida
    expect(w).toContain('<ZsChasmMarks heroRef={heroRef} />');
    expect(fs.readFileSync('src/routes/index.tsx', 'utf8')).toContain('{zs && <ZsChasmFade />}');
  });
});
