import fs from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SurfScheduler } from '@/components/zona-sul/surf/surf-scheduler';
import { SORRISO, SORRISO_SERIES } from '@/components/zona-sul/surf/sorriso';
import { noteHostClock, noteHostEpoch, resetRoomClock, roomActive, roomEpoch, roomNow, setRoomActive } from '@/net/room-clock';

/* Pedro 02/11 (online, 2 jogadores): "contei uns 7 s de diferença entre uma onda que quebrou pra um player e pro outro —
   mais ou menos a mesma onda, com leve delay". Cada um tinha o relógio das ondas começando do zero ao abrir a página. */
const snap = (s: SurfScheduler) => ({ births: [...s.births], vars: s.vars.map((v) => ({ ...v })), states: s.states.map((o) => ({ ...o })), n: s.seriesCount });

describe('ondas iguais pra todos (relógio da sala)', () => {
  afterEach(() => { setRoomActive(false); resetRoomClock(); });

  it('mesma semente + mesmo instante = MESMAS ondas, qualquer que seja o FPS (quadros quebrados × pulo direto)', () => {
    let seed = 99;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (const [pf, rule, sd] of [[undefined, undefined, 20261028], [SORRISO, SORRISO_SERIES, 20261030]] as const) {
      const a = new SurfScheduler(sd, pf, rule), b = new SurfScheduler(sd, pf, rule);
      let t = 0;
      for (const check of [37.3, 300, 911.7, 1800]) {
        // A: quadros de 8–60 ms com engasgos de 0,4 s (celular); B: só chega no instante (entrou agora)
        while (t < check) { t = Math.min(check, t + (rnd() < 0.02 ? 0.4 : 0.008 + rnd() * 0.052)); a.syncTo(t); }
        b.syncTo(check);
        expect(snap(a)).toEqual(snap(b));
      }
      expect(a.seriesCount).toBeGreaterThan(10);
    }
  });

  it('entrou na sala de quem abriu o jogo DEPOIS (relógio volta): recomeça e fica igual a quem nunca saiu', () => {
    const late = new SurfScheduler(20261028);
    late.syncTo(2000);                 // eu: aberto há 33 min
    late.syncTo(420.5);                // anfitrião: aberto há 7 min → volta
    const host = new SurfScheduler(20261028);
    for (let t = 0; t < 420.5; t += 0.05) host.syncTo(t);
    host.syncTo(420.5);
    expect(snap(late)).toEqual(snap(host));
  });

  it('relógio do aparelho 7 s atrasado + rede de 40–120 ms: o convidado fica a ~40 ms do anfitrião', () => {
    const E = 1_700_000_000_000, H = E + 500_000; // anfitrião abriu há 500 s
    const skew = -7000;                           // o meu relógio está 7 s atrás do dele
    for (const lat of [120, 40, 90]) noteHostClock(H - lat, H + skew); // carimbo dele (enviado `lat` ms antes) × minha hora ao receber
    noteHostEpoch(E);
    const myNow = H + skew;
    expect(roomNow(myNow) - H).toBeCloseTo(-40, 6);       // erro = o menor atraso da rede
    expect(roomEpoch()).toBe(E);
    const surfMe = (roomNow(myNow) - roomEpoch()!) / 1000, surfHost = (H - E) / 1000;
    expect(Math.abs(surfMe - surfHost)).toBeLessThan(0.05); // antes: até ~7 s (cada um com o seu relógio)
    resetRoomClock();
    expect(roomNow(123)).toBe(123);                       // fora da sala / virei anfitrião: o meu relógio
    expect(roomEpoch()).toBeNull();
  });

  it('ligado: o pacote do mundo leva a hora do anfitrião; a onda usa o relógio da sala; J (série na hora) só sozinho', () => {
    const mp = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(mp).toContain('epoch: worldEpoch(), wt: Date.now() }');
    expect(mp).toContain("if (typeof p.wt === 'number') { noteHostClock(p.wt); if (typeof p.epoch === 'number') noteHostEpoch(p.epoch); }");
    expect(mp).toContain('if (host) { worldEncoder = createWorldEncoder(); resetRoomClock(); }'); // virou anfitrião: o relógio é o dele
    const sb = fs.readFileSync('src/components/zona-sul/surf/surf-break.tsx', 'utf8');
    expect(sb).toContain('scheduler.syncTo(surfWorldSeconds());');
    expect(sb).not.toContain('scheduler.advance(dt)');
    expect(sb).toContain("e.code === 'KeyJ' && !e.repeat && !roomActive()");
    setRoomActive(true); expect(roomActive()).toBe(true);
    setRoomActive(false); expect(roomActive()).toBe(false);
  });
});
