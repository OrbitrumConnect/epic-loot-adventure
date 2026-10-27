import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createWorldDecoder, createWorldEncoder, KEYFRAME_MS } from '@/net/world-delta';
import { createWildCreatures } from '@/game/systems/wildlifeSystem';
import type { CreatureState } from '@/game/types/creature';

/* 27/10 — egress do Supabase em 4,13 de 5 GB: a lista inteira de bichos (~35 KB) ia 2×/s pra cada convidado.
   Agora vai só o que mudou; o convidado remonta a lista e tem que ficar IGUAL à do anfitrião. */
const cm = (v: number) => Math.round(v * 100) / 100;
const asGuestSees = (list: CreatureState[]) =>
  list.map(cr => ({ ...cr, position: { x: cm(cr.position.x), z: cm(cr.position.z) } }));

describe('mundo da sala em diferenças', () => {
  it('convidado termina com a MESMA lista do anfitrião (anda, apanha, morre, nasce, sai, vira Enfurecido)', () => {
    const enc = createWorldEncoder();
    const dec = createWorldDecoder();
    let world = createWildCreatures();
    let t = 0;
    const send = () => { const p = enc.encode(world, t); return p ? dec.apply(p) : null; };
    expect(send()).toEqual(asGuestSees(world)); // 1º envio = foto completa
    const rng = (() => { let s = 7; return () => ((s = (s * 16807) % 2147483647) / 2147483647); })();
    let got: CreatureState[] | null = null;
    for (let step = 0; step < 60; step++) {
      t += 450;
      world = world.map((cr, i) => {
        const r = rng();
        if (r < 0.3) return { ...cr, position: { x: cr.position.x + rng() * 0.73123, z: cr.position.z - 0.41777 } };
        if (r < 0.33) return { ...cr, hp: Math.max(0, cr.hp - 3), behavior: 'chase' as const };
        if (r < 0.34 && i % 5 === 0) return { ...cr, elite: true };
        if (r < 0.345 && cr.elite) { const { elite: _e, ...rest } = cr; return rest; }
        return cr; // mesmo objeto = parado
      });
      if (step % 9 === 4) world = world.filter((_, i) => i !== step);           // morreu de vez / saiu
      if (step % 11 === 3) world = [...world, { ...world[0]!, id: 'novo_' + step }]; // nasceu
      const r = send();
      if (r) got = r;
      expect(got).toEqual(asGuestSees(world));
    }
  });
  it('bicho parado não reenvia; nada mudou e sem hora de foto = não manda nada', () => {
    const enc = createWorldEncoder();
    const world = createWildCreatures();
    expect(enc.encode(world, 0)).toHaveProperty('creatures');
    expect(enc.encode(world, 450)).toBeNull();
    const moved = world.map((cr, i) => (i === 3 ? { ...cr, position: { x: cr.position.x + 1.234567, z: cr.position.z } } : cr));
    const p = enc.encode(moved, 900)!;
    expect(p.creatures).toBeUndefined();
    expect(p.c).toBeUndefined();
    expect(p.p).toEqual([3, cm(world[3]!.position.x + 1.234567), world[3]!.position.z]); // nº do bicho, x, z
    expect(JSON.stringify(p).length).toBeLessThan(60); // era ~35 mil bytes
    expect(enc.encode(moved, KEYFRAME_MS + 1)).toHaveProperty('creatures'); // foto de segurança a cada 30 s
  });
  it('quem entra no meio espera a foto completa; foto pedida (alguém entrou/voltou) sai no próximo envio', () => {
    const enc = createWorldEncoder();
    const world = createWildCreatures();
    enc.encode(world, 0);
    const late = createWorldDecoder();
    const moved = world.map((cr, i) => (i === 0 ? { ...cr, hp: 1 } : cr));
    expect(late.apply(enc.encode(moved, 450)!)).toBeNull(); // sem foto ainda: ignora a diferença
    enc.keyframe();
    expect(late.apply(enc.encode(moved, 900)!)).toEqual(asGuestSees(moved));
  });
  it('pacote perdido (com bicho nascendo) nunca troca um bicho por outro; foto de outra rodada é ignorada', () => {
    const enc = createWorldEncoder();
    const dec = createWorldDecoder();
    let world = createWildCreatures();
    dec.apply(enc.encode(world, 0)!);
    world = [...world, { ...world[0]!, id: 'novo_a' }];
    enc.encode(world, 450); // ESTE pacote se perdeu na rede (nasceu o novo_a)
    world = [...world, { ...world[1]!, id: 'novo_b' }].map(cr =>
      (cr.id === 'novo_b' || cr.id === world[2]!.id ? { ...cr, position: { x: 1.5, z: 2.5 } } : cr));
    const got = dec.apply(enc.encode(world, 900)!)!;
    expect(got.find(cr => cr.id === 'novo_b')!.position).toEqual({ x: 1.5, z: 2.5 });
    expect(got.find(cr => cr.id === world[2]!.id)!.position).toEqual({ x: 1.5, z: 2.5 });
    expect(got.find(cr => cr.id === 'novo_a')).toBeUndefined(); // falta só ele, até a próxima foto
    for (const cr of got) expect(cr).toEqual(asGuestSees(world).find(w => w.id === cr.id)); // ninguém trocado
    const other = createWorldEncoder(); other.encode(world, 0);
    const moved = world.map((cr, i) => (i === 0 ? { ...cr, position: { x: 9, z: 9 } } : cr));
    expect(dec.apply(other.encode(moved, 450)!)).toBeNull(); // diferença de outra foto (outro host): ignora
    expect(dec.apply(enc.encode(world, KEYFRAME_MS + 1)!)).toEqual(asGuestSees(world)); // a foto corrige tudo
  });
  it('bicho que não mudou continua o MESMO objeto no convidado (a lista estável não redesenha)', () => {
    const enc = createWorldEncoder();
    const dec = createWorldDecoder();
    const world = createWildCreatures();
    const a = dec.apply(enc.encode(world, 0)!)!;
    const b = dec.apply(enc.encode(world.map((cr, i) => (i === 1 ? { ...cr, hp: 2 } : cr)), 450)!)!;
    expect(b[0]).toBe(a[0]);
    expect(b[1]).not.toBe(a[1]);
  });
  it('aba de versão velha ainda recebe: a foto completa usa o campo antigo `creatures`', () => {
    const p = createWorldEncoder().encode(createWildCreatures(), 0)!;
    expect(Array.isArray(p.creatures)).toBe(true);
  });
  it('ligado: host não manda sem convidado presente; quem entra/volta pede foto', () => {
    const mp = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(mp).toMatch(/if \(presentGuests\.size === 0\) return;/);
    expect(mp).toMatch(/if \(\[\.\.\.guests\]\.some\(id => !presentGuests\.has\(id\)\)\) worldEncoder\.keyframe\(\);/);
    expect(mp).toMatch(/const world = worldDecoder\.apply\(p\);/);
  });
});
