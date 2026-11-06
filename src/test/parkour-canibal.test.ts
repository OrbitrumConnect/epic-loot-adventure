import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { CAVE_ROOMS, CAVE_TUNNELS, caveField, caveFloorAt, caveMove, caveStandAt, RAMP_PIT_D, setCaveTerrain, spiralY } from '@/components/zona-sul/zs-cave';
import { CHASM, FALL, caveCheckpoints, chasmReturn, chasmZone, checkpointAt, edgeDrop, fallDamage, fallDamagePct, fellIntoChasm } from '@/components/zona-sul/zs-chasm';
import { ZS_RUN, ZS_WALK } from '@/components/zona-sul/zs-move';

/* Pedro, 05/11: "caminho até ele mais longe com parkour (pula; caiu no precipício volta pro checkpoint)" · "o caminho para o
   boss mais curto vai continuar curto daquele jeito fácil?" · "o ideal seria não ali na descida — a boa seria no TÚNEL, no
   caminho" · "o parkour só vai dar bom se tiver dano de queda — correto por vida e altura". Antes: a garganta (fundo do
   abismo → balcão do covil) tinha 53 m e sem dano de queda se pulava do balcão direto na arena (93 m). Agora: a garganta
   passa pela FENDA (o precipício com colunas), a rampa do covil é inteira (girada pro balcão novo) e cair dói.
   05/11 noite: "parkour na rampa do boss, alguns" · "passar no canto [da fenda]" · "o check é só antes do parkour do boss e 1
   nos 2 lados do outro túnel" · "o checkpoint da queda é só no abismo preto do parkour — local que anda, não". */
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
// rampa do covil
const D = Math.PI / 180, csp = covil.spiral!;
const rampAt = (deg: number, e: number) => { const th = csp.a0 + csp.dir * deg * D; return { x: covil.x + e * covil.rx * Math.cos(th), z: covil.z + e * covil.rz * Math.sin(th) }; };
const rampH = (deg: number) => csp.yTop - ((deg * D) / csp.sweep) * (csp.yTop - covil.y);
const degOf = (x: number, z: number) => ((((Math.atan2((z - covil.z) / covil.rz, (x - covil.x) / covil.rx) - csp.a0) * csp.dir) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) / D;
/** Desce a rampa de `from`° até `to`° (no meio do anel); `jumps` = pula quando o chão some logo à frente. */
function runRamp(from: number, to: number, speed: number, jumps: boolean) {
  const s0 = rampAt(from, 0.93);
  const h: Hero = { ...s0, y: caveFloorAt(s0.x, s0.z, rampH(from) + 1)!, vy: 0, grounded: true, fallFrom: 0 };
  h.fallFrom = h.y;
  const dt = 1 / 60, cps: string[] = [];
  let jumped = 0;
  for (let k = 0; k < 60 * 400; k++) {
    const deg = degOf(h.x, h.z);
    if (deg >= to) return { ok: true, fell: false, deg, h, cps, jumped };
    const tg = rampAt(deg + 2.5, 0.93), l = Math.hypot(tg.x - h.x, tg.z - h.z), ux = (tg.x - h.x) / l, uz = (tg.z - h.z) / l;
    const ahead = caveFloorAt(h.x + ux * 1.0, h.z + uz * 1.0, h.y);
    const jump = jumps && h.grounded && (ahead === null || ahead < h.y - 2);
    if (jump) jumped++;
    if (step(h, ux * speed * dt, uz * speed * dt, jump, dt) === 'fell') return { ok: false, fell: true, deg, h, cps, jumped };
    if (h.grounded) { const c = checkpointAt(h.x, h.y, h.z); if (c && cps[cps.length - 1] !== c.id) cps.push(c.id); }
  }
  return { ok: false, fell: false, deg: degOf(h.x, h.z), h, cps, jumped };
}
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
      if (v * ch.ledge!.side > fenda.rz * Math.sqrt(Math.max(0, 1 - (u / fenda.rx) ** 2)) - ch.ledge!.w - 0.6) continue; // a beirada do canto
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

  it('BEIRADA no canto (Pedro: "passar no canto"): colada na parede, quebrada em 2 vãos — pulando atravessa, sem pular cai', () => {
    const L = ch.ledge!, vOf = (u: number) => (fenda.rz * Math.sqrt(1 - (u / fenda.rx) ** 2) - L.w / 2) * L.side;
    const path = [-14, -10, -2, 3, 11, 16, 22].map((u) => F(u, vOf(u)));
    for (const u of [-14, 0, 14]) { const q = F(u, vOf(u)); expect(caveStandAt(q.x, q.z, Y + 1), `beirada em u ${u}`).toBeCloseTo(Y, 1); }
    for (const g of L.gaps) { const q = F(g.u, vOf(g.u)); expect(caveFloorAt(q.x, q.z, Y + 1)!, `vão da beirada em u ${g.u}`).toBeLessThan(Y - 20); }
    const r = run(F(-21, vOf(-21)), path, ZS_RUN, true);
    expect(r.fell, `caiu indo pro ponto ${r.at}`).toBe(false); expect(r.ok).toBe(true);
    expect(r.jumped).toBeGreaterThanOrEqual(2);
    expect(run(F(-21, vOf(-21)), path, ZS_RUN, false).fell).toBe(true);
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

  it('RAMPA DO COVIL com parkour (Pedro: "alguns"): 4 vãos + desabamento com 3 colunas; longe deles a rampa é a de sempre', () => {
    const sp = covil.spiral!, pk = sp.parkour!;
    expect(pk.gaps.map((g) => g.w)).toEqual([3.2, 3.5, 27, 3.8, 4]);
    for (const g of pk.gaps) {
      const q = rampAt(g.at + (pk.stones.some((st) => Math.abs(st.at - g.at) < 1) ? 3.8 : 0), 0.92);
      // o vão é um POÇO de RAMP_PIT_D m (o "abismo preto"): quem cai é pego aos 9 m, antes do fundo
      const deg = g.at + (pk.stones.some((st) => Math.abs(st.at - g.at) < 1) ? 3.8 : 0);
      expect(caveFloorAt(q.x, q.z, rampH(g.at) + 1), `vão ${g.at}°`).toBeCloseTo(rampH(deg) - RAMP_PIT_D, 1);
      expect(RAMP_PIT_D).toBeGreaterThan(CHASM.FALL_M);
    }
    for (const st of pk.stones) { const q = rampAt(st.at, st.e); expect(caveStandAt(q.x, q.z, rampH(st.at) + 1), `coluna ${st.at}°`).toBeCloseTo(rampH(st.at), 1); }
    // longe das peças: a conta de sempre (o lado oeste — perto da superfície na malha — não muda)
    for (const deg of [5, 15, 90, 110, 130, 300, 330]) {
      const th = sp.a0 + deg * D, u = 0.92 * covil.rx * Math.cos(th), v = 0.92 * covil.rz * Math.sin(th);
      expect(spiralY(covil, u, v), `${deg}°`).toBeCloseTo(rampH(deg), 6);
    }
  });

  it('RAMPA: do balcão (o checkpoint) até o pé correndo e pulando, sem cair; CADA salto pede pulo', () => {
    const r = runRamp(12, 330, ZS_RUN, true);
    expect(r.fell, `caiu em ${r.deg.toFixed(1)}°`).toBe(false); expect(r.ok).toBe(true);
    expect(r.jumped).toBeGreaterThanOrEqual(8);                      // 4 vãos + 4 saltos no desabamento
    expect(r.cps).toEqual(['covil_topo']);                           // o único checkpoint: ANTES do parkour
    const pk = covil.spiral!.parkour!, big = pk.gaps.find((g) => g.w > 10)!;
    const hops: [string, number, number][] = [
      ...pk.gaps.filter((g) => g !== big).map((g): [string, number, number] => [`vão ${g.at}°`, g.at - (g.w / 2 + 5) / 58.9 / D, g.at + (g.w / 2 + 2) / 58.9 / D]),
      ['beira → 1ª coluna', big.at - (big.w / 2 + 4) / 58.9 / D, pk.stones[0]!.at + 1],
      ...pk.stones.map((st, i): [string, number, number] => [`coluna ${i + 1}`, st.at, (pk.stones[i + 1]?.at ?? big.at + big.w / 2 / 58.9 / D + 2) + 1]),
    ];
    for (const [nome, from, to] of hops) {
      expect(runRamp(from, to, ZS_RUN, false).fell, `${nome}: sem pular passou`).toBe(true);
      expect(runRamp(from, to, ZS_RUN, true).fell, `${nome}: pulando caiu`).toBe(false);
    }
  }, 120_000);

  it('TELEPORTE SÓ NO VÃO do parkour: vão da rampa e vão da fenda sim; cair da rampa pro chão da arena, o abismo da entrada, a beirada e a coluna, não', () => {
    const pk = covil.spiral!.parkour!, g = pk.gaps[0]!, q = rampAt(g.at, 0.92);
    expect(chasmZone(q.x, q.z)).toBe('covil');                       // no vão da rampa
    expect(chasmZone(F(-16, 0).x, F(-16, 0).z)).toBe('fenda');       // no vão da fenda
    expect(chasmZone(covil.x + 10, covil.z)).toBeNull();             // o chão da arena (lá se anda)
    const inner = rampAt(g.at + 20, 0.8); expect(chasmZone(inner.x, inner.z)).toBeNull(); // da beira pra arena
    expect(chasmZone(abismo.x, abismo.z)).toBeNull();                // o abismo do Pico: chão normal (dano de queda)
    expect(chasmZone(stones[0]!.x, stones[0]!.z)).toBeNull();        // em cima da coluna
    const ledge = F(0, (fenda.rz - ch.ledge!.w / 2) * ch.ledge!.side); expect(chasmZone(ledge.x, ledge.z)).toBeNull(); // na beirada
    expect(fellIntoChasm(true, 99, 99 - CHASM.FALL_M - 0.1, abismo.x, abismo.z)).toBe(false);
    expect(fellIntoChasm(true, 20, 20 - CHASM.FALL_M - 0.1, q.x, q.z)).toBe(true);
    expect(fellIntoChasm(true, 20, 20 - CHASM.FALL_M + 0.5, q.x, q.z)).toBe(false); // pulinho não conta
    expect(fellIntoChasm(false, 99, 50, q.x, q.z)).toBe(false);                      // fora da caverna, não
  });

  // 06/11 (Pedro: "dano de queda tá muito forte"): era 6 m nada · 15 m metade · 24 m mata (linha reta)
  it('DANO DE QUEDA por altura e pela vida (06/11, mais leve): até 8 m nada; curva: 15 m ~9%, 24 m ~1/3, 30 m ~55%; 40 m mata', () => {
    expect(FALL).toEqual({ SAFE_M: 8, LETHAL_M: 40, CURVE: 1.6 });
    expect(fallDamagePct(1.3)).toBe(0); expect(fallDamagePct(8)).toBe(0);            // o pulo (1,3 m) e ~3 andares: nada
    expect(fallDamagePct(12)).toBeLessThan(0.05);                                   // da beira do covil pra arena (12 m): arranhão
    expect(fallDamagePct(15)).toBeCloseTo(0.088, 2); expect(fallDamagePct(24)).toBeCloseTo(0.33, 2); expect(fallDamagePct(30)).toBeCloseTo(0.55, 2);
    expect(fallDamagePct(40)).toBe(1); expect(fallDamagePct(57)).toBe(1); expect(fallDamagePct(90)).toBe(1); // abismo do Pico (57 m) mata
    for (let h = 8.5; h < 40; h += 0.5) expect(fallDamagePct(h)).toBeGreaterThan(fallDamagePct(h - 0.5));    // sempre sobe
    expect(fallDamage(24, 30000)).toBe(Math.round(30000 * fallDamagePct(24)));    // % da vida máxima
    expect(fallDamage(8.05, 200)).toBe(1);                                          // passou do seguro: pelo menos 1
    expect(fallDamage(40, 200)).toBe(200);                                          // mortal
    expect(fallDamage(7, 999999)).toBe(0);
  });

  it('checkpoints: SÓ 3 (Pedro: "antes do parkour do boss e 1 nos 2 lados do outro túnel"), no chão, cada um pega só perto', () => {
    const all = caveCheckpoints();
    expect(all.map((c) => c.id)).toEqual(['fenda_inicio', 'fenda_fim', 'covil_topo']);
    for (const c of all) {
      expect(caveStandAt(c.x, c.z, c.y + 1), c.name).toBeCloseTo(c.y, 1);
      expect(checkpointAt(c.x + 2, c.y, c.z)?.id).toBe(c.id);
      expect(checkpointAt(c.x, c.y + 8, c.z)).toBeNull();
      expect(Math.hypot(c.mark.x - c.x, c.mark.z - c.z), c.name).toBeGreaterThan(2); expect(Math.abs(c.mark.y - c.y), c.name).toBeLessThan(1.5);
    }
    // o do covil fica ANTES do 1º vão da rampa
    const top = all.find((c) => c.id === 'covil_topo')!, sp = covil.spiral!;
    const a = (((Math.atan2((top.z - covil.z) / covil.rz, (top.x - covil.x) / covil.rx) - sp.a0) * sp.dir) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) / D;
    expect(a).toBeLessThan(sp.parkour!.gaps[0]!.at - 5);
  });

  it('o piloto/clique não se joga na beira; ligado no mundo: dano de queda, precipício com dano, checkpoint, tela escura', () => {
    expect(edgeDrop(20, 19)).toBe(false); expect(edgeDrop(20, -55)).toBe(true);
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain('if (cm && autoRun && grounded.current && edgeDrop(p.y, cm.ground)) {');
    expect(w).toContain('if (wasAir && !st.swimming) { const h = airTop.current - p.y, dmg = fallDamage(h, gs.player.maxHp); if (dmg > 0) hurtPlayerByFall(dmg, h, { x: p.x, z: p.z }); }');
    expect(w).toContain('if (nowMs - airSeen.current > 150) airTop.current = p.y;'); // voltou a pé (carro/asa/skate): conta dali
    expect(w).toContain('else if (fellIntoChasm(zsCave.inCave, fallFrom.current, p.y, p.x, p.z)) {');
    expect(w).toContain('hurtPlayerByFall(Math.max(1, Math.round(gs.player.maxHp * CHASM.PIT_PCT)), h, { x: c.x, z: c.z }, c.name);');
    expect(w).toContain('resetChasm(); } // checkpoints valem a vida');
    expect(w).not.toContain('<ZsChasmMarks'); // sem marco desenhado (Pedro: "meio feio")
    expect(fs.readFileSync('src/routes/index.tsx', 'utf8')).toContain('{zs && <ZsChasmFade />}');
  });
});
