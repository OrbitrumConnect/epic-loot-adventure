import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CANIBAL, CANIBAL_AT, CANIBAL_BODY_ID, CANIBAL_CRIA_PREFIX, canibalMove, canibalPhaseStep, canibalRootId, clampArena, criaCount, leapPos, nearestInArena,
  newCanibal, pushAway, rootBase, rootLean, rootStep, rootTarget, ROOT_SLAM_TOTAL, slamHits,
} from '@/components/zona-sul/zs-canibal-boss';
import { bossCapHit, bossDamageK, bossPower, CANIBAL_GUN_K, CANIBAL_GUN_MAX } from '@/game/systems/bossResist';
import { CAVE_LAIR } from '@/components/zona-sul/zs-cave';
import { activeGrab, grabTicksDue, isGrabbed, resetGrabs, startHold, tryStartGrab } from '@/game/systems/grabSystem';
import { calculateDamage } from '@/game/systems/combatSystem';

/* Pedro, 04/11: "o boss dentro da cave profunda … o corpo dele vem do meio e ele tem raízes similares ao tentáculo, pode dar
   empurrão, ver se pega o herói, bate no chão … o canibal gigante meio que do tamanho do Kraken dentro da terra" · "o boss
   também é da cintura pra cima, sai do buraco fundo" · "só mata com bazuca — dá praticamente todo o dano, o resto é fraco". */
describe('Canibal gigante do covil', () => {
  it('no meio da arena do covil; 05/11 (Pedro: "uns 40% menor, em pé" → 66 m; 2ª: "diminuir uns 40% ainda, tá grande") → 40 m; 3ª: "uns 30% menor" → 28 m, inteiro fora do buraco; 6 raízes', () => {
    expect(CANIBAL_AT).toEqual({ x: CAVE_LAIR.x, z: CAVE_LAIR.z, floor: CAVE_LAIR.floor });
    expect(CANIBAL.BODY_H).toBe(19.6);                                        // 05/11 noite: 28 → 19,6 ("uns 30% ainda")
    expect(CANIBAL.BODY_R).toBeCloseTo(7 * 0.6 * 0.7 * 0.7, 0);
    expect(CANIBAL.ROOT_LEN).toBeCloseTo(46 * 0.7 * 0.7, 0); expect(CANIBAL.ROOT_REACH).toBe(19.6); // raízes junto
    expect(CANIBAL.SUBMERGED_K).toBe(0);
    expect(CANIBAL.ROOTS).toBe(6);
    for (let i = 0; i < 6; i++) { const b = rootBase(i); expect(Math.hypot(b.x - CANIBAL_AT.x, b.z - CANIBAL_AT.z)).toBeCloseTo(CANIBAL.ROOT_RING, 5); }
    expect(CANIBAL_BODY_ID).toBe('zs_canibal_boss'); expect(canibalRootId(2)).toBe('zs_canibal_r2');
  });
  it('acorda com alguém LÁ EMBAIXO na arena (quem está no balcão/rampa alta não acorda); sem ninguém volta inteiro', () => {
    const c = newCanibal();
    canibalPhaseStep(c, 0, 0.1, nearestInArena([{ x: CANIBAL_AT.x + 30, y: 38, z: CANIBAL_AT.z }])); // no balcão
    expect(c.phase).toBe('sleep');
    canibalPhaseStep(c, 0, 0.1, nearestInArena([{ x: CANIBAL_AT.x + 30, y: -54, z: CANIBAL_AT.z }])); // na arena
    expect(c.phase).toBe('rise');
    for (let k = 0; k < 60; k++) canibalPhaseStep(c, 100 * k, 0.1, 30);
    expect(c.phase).toBe('fight');
    canibalPhaseStep(c, 6000 + CANIBAL.SLEEP_MS + 1, 0.1, Infinity);
    expect(c.phase).toBe('sleep');
  });
  it('raiz: chicoteia o mais perto até 40 m; bate 1× no chão (dano+empurrão no raio de 7 m); levanta antes, deita, volta', () => {
    const b = rootBase(0), near = { id: 'a', x: b.x + 10, z: b.z }, far = { id: 'b', x: b.x + 80, z: b.z };
    expect(rootTarget(0, [far, near])).toBe(near);
    expect(rootTarget(0, [far])).toBeNull();
    const r = { i: 0, alive: true, diedAt: 0, slam: { tx: near.x, tz: near.z, age: 0, hit: false }, nextAt: 0 };
    let hits = 0; for (let k = 0; k < 60; k++) if (rootStep(r, 0.1)) hits++;
    expect(hits).toBe(1);
    expect(r.slam).toBeNull(); // terminou (ROOT_SLAM_TOTAL)
    expect(ROOT_SLAM_TOTAL).toBeLessThan(CANIBAL.SLAM_EVERY_S);
    expect(rootLean(0.5)).toBeLessThan(0); expect(rootLean(CANIBAL.WIND_S + CANIBAL.STRIKE_S + 0.1)).toBe(1);
    expect(slamHits({ tx: 0, tz: 0 }, 6, 0)).toBe(true); expect(slamHits({ tx: 0, tz: 0 }, 8, 0)).toBe(false);
    const pv = pushAway(0, 0, 3, 4, 10); expect(Math.hypot(pv.x, pv.z)).toBeCloseTo(10, 5);
  });
  it('AGARRÃO genérico (as raízes): prende, 3 pancadas, solta sozinho — o do jacaré segue igual', () => {
    resetGrabs();
    expect(startHold('zs_canibal_r1', CANIBAL.GRAB_MS, CANIBAL.GRAB_TICKS, 100, 1000)).toBe(true);
    expect(isGrabbed(1500)).toBe(true);
    expect(startHold('zs_canibal_r2', 1000, 3, 1, 1600)).toBe(false); // um por vez
    expect(grabTicksDue('zs_canibal_r1', 1000 + CANIBAL.GRAB_MS)).toBe(CANIBAL.GRAB_TICKS);
    expect(activeGrab(1000 + CANIBAL.GRAB_MS + 1)).toBeNull();
    resetGrabs();
    expect(tryStartGrab('wild_boar_1', 'boar', 20, 0, () => 0)).toBe(true); // jacaré: o de sempre (1,2 s, 3 pancadas)
    expect(grabTicksDue('wild_boar_1', 1200)).toBe(3);
    resetGrabs();
  });
  it('05/11 "o fuzil pode dar dano nele também" + 04/11 "a bazuca dá praticamente todo o dano": sem armadura; o resto entra com 10%, o míssil inteiro', () => {
    expect(CANIBAL.ARMOR).toBe(0);
    expect(CANIBAL_GUN_K).toBe(0.1);
    expect(bossDamageK(CANIBAL_BODY_ID)).toBe(0.1);
    expect(bossDamageK(canibalRootId(3))).toBe(0.1);
    expect(bossDamageK(CANIBAL_BODY_ID, true)).toBe(1);                         // míssil da bazuca
    expect(bossDamageK('zs_cave_cria_1')).toBe(1);                              // as crias: normal
    expect(bossDamageK('wild_boar_1')).toBe(1);                                 // qualquer outro bicho: nada muda
    // 05/11 (2ª, Pedro: "bem mais fraco pra dificultar — ele tem proteção, pode tirar uns 5 por aí"): no máximo 5 por golpe
    expect(CANIBAL_GUN_MAX).toBe(5);
    expect(bossPower(CANIBAL_BODY_ID, 300)).toBe(5);                            // nv 80 (antes 30 → bala 25–48)
    expect(bossPower(canibalRootId(1), 5000)).toBe(5);                          // poder grande: o mesmo teto
    expect(bossPower(CANIBAL_BODY_ID, 30)).toBe(3);                             // fraco: os 10% (abaixo do teto)
    expect(bossPower(CANIBAL_BODY_ID, 3)).toBe(1);                              // nunca zera
    expect(bossPower(CANIBAL_BODY_ID, 3000, true)).toBe(3000);                  // o míssil passa inteiro
    expect(bossPower('wild_boar_1', 300)).toBe(300);
    // fuzil segurado (10 balas/s × ~5) contra a bazuca (~3.000 a cada 2,5 s): ~4%
    const rifle = 10 * CANIBAL_GUN_MAX, bazooka = 3000 / 2.5;
    expect(rifle / bazooka).toBeLessThan(0.05);
    expect(calculateDamage(CANIBAL_GUN_MAX, 0, () => 0.5)).toBe(5);             // o sorteio do combate em cima: ~4–6
    expect(calculateDamage(3000, 0, () => 0.5)).toBe(3000);
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain('const res0 = resolveAttack(bossPower(c.id, power, pierce), c.hp, c.maxHp, pierce ? 0 : c.armor, c.name, critStats);');
    expect(g).toContain('const result = resolveAttack(bossPower(targetId, finalPower), creature.hp, creature.maxHp, creature.armor, creature.name, playerCritStats(state.player));');
    expect(g.split('resolveAttack(bossPower(').length - 1).toBe(5); // alvo, cleave, especial, explosão, poderes
    expect(g).toContain("get().explosiveHit(at, BAZOOKA.SPLASH_R, power, 'Bazuca', true);");
    expect(g).toContain('if (getDistance(at, c.position) - bigCreatureRadius(c.id) > radius) return c;');
    // o convidado: o anfitrião aplica a mesma fração (o míssil passa inteiro) e conta o raio do corpo no limite
    const we = fs.readFileSync('src/components/world/world-entities.tsx', 'utf8');
    expect(we).toContain('const damage = bossCapHit(creature.id, !!hit.pierce, creature.maxHp, Math.max(1, bossPower(creature.id, Math.round(hit.damage), hit.pierce) - (hit.pierce ? 0 : creature.armor)));');
    expect(we).toContain('const lim = 24 + bigCreatureRadius(creature.id);');
  });
  it('ligado: montado ao lado da caverna, camada da caverna, barra/tema com dono, online (canibal), não renasce sozinho', () => {
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain('<ZsCanibalBoss heroRef={heroRef} />');
    const v = fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');
    expect(v).toContain('setCreatureLayer(CANIBAL_BODY_ID, 1);');
    expect(v).toContain("audioManager.setBossMusic(awake && near, 'canibal');");
    expect(v).toContain('setBossBarFor(CANIBAL.NAME, null);');
    expect(v).toContain('broadcastCanibal({');
    const a = fs.readFileSync('src/game/audio/audio-manager.ts', 'utf8');
    expect(a).toContain("setBossMusic(on: boolean, key = 'kraken') {");
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain("|| c.id.startsWith('zs_canibal_')");
    const o = fs.readFileSync('src/game/systems/objectiveSystem.ts', 'utf8');
    expect(o).toContain("if (creature.id?.startsWith('zs_canibal_')) return false;");
  });
});

/* Pedro, 05/11: "deve vir hordas iguais às crias do Kraken — cada tentáculo vem, aumentando a horda cada vez mais que mata". */
describe('crias do Canibal', () => {
  it('cada raiz cortada solta mais (2, 3, 4, 5, 6, 6), sem passar de 12 vivas', () => {
    expect([1, 2, 3, 4, 5, 6].map((k) => criaCount(k, 0))).toEqual([2, 3, 4, 5, 6, 6]);
    expect(criaCount(6, 10)).toBe(2);
    expect(criaCount(3, 12)).toBe(0);
  });
  it('nascem no chão da caverna (prefixo zs_cave_), andam com a IA de lá e não renascem; somem quando ele volta a dormir', () => {
    expect(CANIBAL_CRIA_PREFIX).toBe('zs_cave_cria_');
    const cave = fs.readFileSync('src/components/zona-sul/zs-cave.ts', 'utf8');
    expect(cave).toContain("homeY: (id, x, z) => (id.startsWith('zs_cave_') || id.startsWith('wild_cave_') ? caveFloorAt(x, z) : null),");
    const g = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(g).toContain("|| c.id.startsWith('zs_cave_cria_')");
    const v = fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');
    expect(v).toContain("const n = criaCount(cut, alive), def = CREATURES['raider_cannibal'];");
    expect(v).toContain("!c.id.startsWith('zs_canibal_') && !c.id.startsWith(CANIBAL_CRIA_PREFIX)");
  });
});

/* Pedro, 05/11: "ele em pé andando, correndo, pulando e atacando — o herói cai no chão; tem animação Mixamo pra tudo isso" ·
   "o boss parou de atacar o amigo" · "olhos vermelhos, aspecto verde-neon como o Kraken" · "machado na mão dele" ·
   "ficou meio verde demais" · "o machado com o verde ficou meio troll, tirou a tonalidade normal dele". */
describe('Canibal v2: em pé, anda, corre, pula', () => {
  it('anda até 25 m, corre além; para no alcance da pancada; não sai da arena', () => {
    const c = newCanibal();
    expect([c.x, c.z]).toEqual([CAVE_LAIR.x, CAVE_LAIR.z]);
    canibalMove(c, CAVE_LAIR.x + 20, CAVE_LAIR.z, 1);
    expect(c.act).toBe('walk'); expect(c.x - CAVE_LAIR.x).toBeCloseTo(CANIBAL.WALK_SPEED, 5);
    const d = newCanibal(); canibalMove(d, CAVE_LAIR.x + 45, CAVE_LAIR.z, 1);
    expect(d.act).toBe('run'); expect(d.x - CAVE_LAIR.x).toBeCloseTo(CANIBAL.RUN_SPEED, 5);
    const e = newCanibal(); expect(canibalMove(e, CAVE_LAIR.x + 3, CAVE_LAIR.z, 1)).toBe(3); expect(e.act).toBe('idle'); // dentro do alcance (19,6 m: 3,9)
    expect(e.yaw).toBeCloseTo(Math.PI / 2, 5); // vira pro alvo
    const f = newCanibal(); f.x = CAVE_LAIR.x + CANIBAL.ARENA_R - 1;
    for (let k = 0; k < 20; k++) canibalMove(f, CAVE_LAIR.x + 300, CAVE_LAIR.z, 1);
    expect(Math.hypot(f.x - CAVE_LAIR.x, f.z - CAVE_LAIR.z)).toBeLessThanOrEqual(CANIBAL.ARENA_R + 1e-9);
    expect(clampArena(CAVE_LAIR.x + 100, CAVE_LAIR.z)).toEqual({ x: CAVE_LAIR.x + CANIBAL.ARENA_R, z: CAVE_LAIR.z });
  });
  it('PULO: arco de 1,3 s (sobe ~14 m no meio) e cai em cima do alvo', () => {
    const l = { fx: 0, fz: 0, tx: 30, tz: 0, t: 0, hit: false };
    expect(leapPos(l)).toEqual({ x: 0, z: 0, h: 0 });
    l.t = CANIBAL.LEAP_S / 2; const mid = leapPos(l);
    expect(mid.x).toBeCloseTo(15, 5); expect(mid.h).toBeCloseTo(CANIBAL.BODY_H * 0.35, 5);
    l.t = CANIBAL.LEAP_S; const end = leapPos(l);
    expect(end.x).toBeCloseTo(30, 5); expect(end.h).toBeCloseTo(0, 5);
    expect(CANIBAL.LEAP_FROM).toBeGreaterThan(CANIBAL.ATK_REACH);
  });
  it('desenho: animação pelo que ele faz, machado na mão (escala de gigante), olhos na cabeça, verde só um toque', () => {
    const v = fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');
    expect(v).toContain("bodyAction.current = C.phase === 'dead' || C.act === 'death' ? 'death' : C.phase === 'rise' ? 'roar' : (C.act as HeroAction);");
    expect(v).toContain('<HeldItem c={palette()} itemId="axe" />'); // o machado do jogo (05/11 noite: virado e 30% menor — abaixo)
    // 05/11 noite (Pedro: "a parte que corta precisa virar pra ele; uns 30% menor"): meia volta no cabo + 30% menor
    expect(v).toContain('weapon={axe} gripScale={(CANIBAL.BODY_H / 1.8) * CANIBAL_AXE_K}');
    expect(v).toContain('const axe = useMemo(() => <group rotation={[0, 0, Math.PI]}><HeldItem c={palette()} itemId="axe" /></group>, []);');
    expect(v).toContain('export const CANIBAL_AXE_K = 0.7;');
    expect(v).toContain('BODY_TINT: 0.25, AXE_GLOW: 0.3 } as const;');
    // o machado fica na cor dele (sem o verde)
    expect(v).toContain("mat.emissive = src.map ? new THREE.Color('#ffffff') : src.color.clone(); mat.emissiveMap = src.map; mat.emissiveIntensity = CANIBAL_LOOK.AXE_GLOW;");
    // olhos pelos ossos Head → HeadTop (antes ficavam dentro do crânio)
    expect(v).toContain('if (!headTop.current && /headtop/i.test(o.name)) headTop.current = o;');
    // ele vem atrás de quem está na arena (o amigo também)
    expect(v).toContain('const d = canibalMove(C, tgt.x, tgt.z, dt);');
    const m = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(m).toMatch(/NetCanibal = \{[\s\S]*?x\?: number/);
  });
});

/* Pedro, 05/11 (2ª): "ainda tá grande … e precisa ser mais lento a movimentação". */
describe('Canibal 28 m: mais lento, passo pesado', () => {
  it('andar 2,5 m/s e correr 4,5 m/s (era 5 e 9); alcance da pancada e do pulo junto com o corpo (−40% e −30%)', () => {
    expect(CANIBAL.WALK_SPEED).toBe(2.5); expect(CANIBAL.RUN_SPEED).toBe(4.5);
    expect(CANIBAL.ATK_REACH).toBe(3.9); expect(CANIBAL.ATK_R).toBe(2.7); expect(CANIBAL.LEAP_R).toBe(3.9);
    expect(CANIBAL.LEAP_FROM).toBeGreaterThan(CANIBAL.RUN_FROM);
  });
  it('o clip de andar/correr roda pela velocidade dele (antes 1× = ritmo de homem, ele "pedalava")', () => {
    const v = fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');
    // o passo é proporcional à altura: passo × altura fixo (o de 40 m: 0,2 × 40) — menor, o clip roda mais rápido (sem patinar)
    expect(v).toContain('export const CANIBAL_STEP = { WALK: 8 / CANIBAL.BODY_H, RUN: 4.8 / CANIBAL.BODY_H } as const;');
    const STEP = { WALK: 8 / CANIBAL.BODY_H, RUN: 4.8 / CANIBAL.BODY_H };
    expect(CANIBAL.WALK_SPEED * STEP.WALK).toBeCloseTo(2.5 * 8 / 19.6, 5);
    expect(CANIBAL.RUN_SPEED * STEP.RUN).toBeGreaterThanOrEqual(0.4); // o piso do clamp (não trava)
    expect(v).toContain('actionRef={bodyAction} speedRef={bodySpeed} walkSync={CANIBAL_STEP.WALK} runSync={CANIBAL_STEP.RUN}');
    expect(v).toContain("bodySpeed.current = C.act === 'run' ? CANIBAL.RUN_SPEED : C.act === 'walk' ? CANIBAL.WALK_SPEED : 0;");
    const g = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(g).toContain("else if (a && speedRef) a.timeScale = THREE.MathUtils.clamp(spd * (current.current === 'run' ? runSync : walkSync), 0.4, 3.0);");
  });
});

/* Pedro, 05/11: "tô no carro do meu aliado, não consigo atirar com o fuzil". */
describe('de carona atira', () => {
  it('a pé ou de carona: clique ataca; a mira (botão direito) segue só a pé', () => {
    const w = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(w).toContain("const canFight = () => !zsPause.on && (drive.mode === 'foot' || drive.mode === 'riding') && !input.overview;");
    expect(w).toContain("if (e.button === 2) { if (canFight() && drive.mode === 'foot') { setAiming(true); el.requestPointerLock?.(); } return; }");
  });
});

/* Pedro, 05/11 noite: "o boss só aparece quando chega no chão lá embaixo mesmo" · "quando o boss nasce já nasce com 5 crias,
   fora as que vêm de tentáculo" · "cada tentáculo destrói com 3 bazukadas — de 1 já foi". */
describe('Canibal: acorda no chão, 5 crias ao nascer, raiz = 3 bazucadas', () => {
  it('acorda SÓ com alguém no CHÃO da arena (na rampa, mesmo lá embaixo, não)', () => {
    expect(CANIBAL.WAKE_BELOW).toBe(-51); expect(CANIBAL.WAKE_R).toBe(50);
    const A = CANIBAL_AT;
    expect(nearestInArena([{ x: A.x + 10, y: A.floor, z: A.z }])).toBeCloseTo(10, 5);           // no chão: acorda
    expect(nearestInArena([{ x: A.x + 56, y: A.floor + 6, z: A.z }])).toBe(Infinity);          // no pé da rampa: não
    expect(nearestInArena([{ x: A.x + 10, y: A.floor + 30, z: A.z }])).toBe(Infinity);         // lá em cima: não
    const c = newCanibal(); canibalPhaseStep(c, 1000, 0.1, 55); expect(c.phase).toBe('sleep'); // fora da arena (55 m): dorme
    canibalPhaseStep(c, 1000, 0.1, 40); expect(c.phase).toBe('rise');
  });
  it('nasce com 5 crias (além das da raiz cortada)', () => {
    expect(CANIBAL.CRIA_ON_RISE).toBe(5);
    const v = fs.readFileSync('src/components/zona-sul/zs-canibal-boss-view.tsx', 'utf8');
    expect(v).toContain("fresh.push(...makeCrias(CANIBAL.CRIA_ON_RISE, CANIBAL_AT, CANIBAL.PIT_R + 4, 'rise', now));");
    expect(v).toContain('const fresh = makeCrias(n, rootBase(r.i), 5, String(r.i), now);');
  });
  it('raiz: no máximo 1/3 da vida por míssil (3 bazucadas, qualquer nível); corpo e outros bichos iguais', () => {
    const hp = CANIBAL.ROOT_HP;
    expect(bossCapHit(canibalRootId(0), true, hp, 9999)).toBe(Math.ceil(hp / 3));
    let left = hp, n = 0; while (left > 0) { left -= bossCapHit(canibalRootId(1), true, hp, 9999); n++; }
    expect(n).toBe(3);
    expect(bossCapHit(canibalRootId(0), true, hp, 1500)).toBe(1500);          // míssil fraco: mais bazucadas
    expect(bossCapHit(canibalRootId(0), false, hp, 9999)).toBe(9999);         // não-míssil: a regra de sempre (bossPower)
    expect(bossCapHit(CANIBAL_BODY_ID, true, CANIBAL.BODY_HP, 9999)).toBe(9999); // o corpo: inteiro
    expect(bossCapHit('wild_cave_x', true, 500, 9999)).toBe(9999);
    expect(fs.readFileSync('src/components/world/world-entities.tsx', 'utf8')).toContain('const damage = bossCapHit(creature.id, !!hit.pierce, creature.maxHp,'); // o tiro do convidado também
  });
});
