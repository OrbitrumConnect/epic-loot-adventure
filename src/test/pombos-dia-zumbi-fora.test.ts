import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createNightPigeons, DAY_FLOCK_FAR, DAY_FLOCK_PREFIX, DAY_PIGEONS, dayFlockAction, mergeResumedWorld, NIGHT_FLOCK_OFF, NIGHT_FLOCK_ON,
  NIGHT_PREFIXES,
} from '@/game/systems/wildlifeSystem';
import { useGameStore } from '@/game/state/game-store';

/* Pedro 03/11: "o zumbi verde estranho que aparece à noite pode remover do jogo" · "pombo vejo mais de noite; poderia
   ter de dia — sinto falta de alguns deles pelo mapa vindo atrás de mim, rondando" · "o trigger objetivos no side card
   (o que o idle tá indo farmar, cancelar…) não vejo mais". */
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('pombos de dia rondando perto de quem joga', () => {
  it('de dia chega o bando do dia (10); ao escurecer vai embora (a noite traz o dela); longe 140 m = voa pra perto', () => {
    expect(DAY_PIGEONS).toBe(10); expect(DAY_FLOCK_FAR).toBe(140);
    expect(dayFlockAction(0, false, false)).toBe('spawn');
    expect(dayFlockAction(NIGHT_FLOCK_OFF, false, false)).toBe('spawn');
    expect(dayFlockAction(0.4, false, false)).toBeNull();          // entardecer: nem chega nem vai (sem piscar)
    expect(dayFlockAction(NIGHT_FLOCK_ON, true, false)).toBe('leave');
    expect(dayFlockAction(0, true, true)).toBe('move');
    expect(dayFlockAction(0, true, false)).toBeNull();
  });
  it('nascem a 20–60 m de quem joga, com o id do dia; a retomada de sala não confunde com espécie que saiu', () => {
    let seed = 3;
    const rng = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    const c = { x: 0, z: 0 };
    const f = createNightPigeons(c, rng, DAY_PIGEONS, DAY_FLOCK_PREFIX);
    expect(f.length).toBeGreaterThan(5);
    for (const p of f) {
      expect(p.id.startsWith(DAY_FLOCK_PREFIX)).toBe(true);
      expect(p.speciesId).toBe('pigeon');
      const d = Math.hypot(p.position.x - c.x, p.position.z - c.z);
      expect(d).toBeGreaterThanOrEqual(19); expect(d).toBeLessThanOrEqual(61);
    }
    expect(NIGHT_PREFIXES).toContain(DAY_FLOCK_PREFIX);
    expect(mergeResumedWorld([{ id: `${DAY_FLOCK_PREFIX}0`, speciesId: 'pigeon' } as never], [])).toHaveLength(1);
  });
  it('no relógio da noite: tira zumbi que sobrar, bando do dia chega/vai/muda de lugar', () => {
    const st = useGameStore.getState();
    useGameStore.setState({ creatures: [{ ...(st.creatures[0] ?? {}), id: 'wild_zombie_night_0', speciesId: 'zombie', behavior: 'patrol', position: { x: 0, z: 0 } } as never], player: { ...st.player, position: { x: 0, z: 0 } } });
    useGameStore.getState().tickNightFlock(0); // dia
    const after = useGameStore.getState().creatures;
    expect(after.some((c) => c.id.startsWith('wild_zombie_night_'))).toBe(false);
    expect(after.filter((c) => c.id.startsWith(DAY_FLOCK_PREFIX)).length).toBeGreaterThan(0);
    useGameStore.getState().tickNightFlock(1); // noite fechada: o do dia vai embora
    expect(useGameStore.getState().creatures.some((c) => c.id.startsWith(DAY_FLOCK_PREFIX))).toBe(false);
  });
});

describe('"Objetivos" de volta no menu da Zona Sul', () => {
  it('a fila do piloto aparece no menu (antes escondida na Zona Sul); o botão volta "ao mapa"', () => {
    const idx = read('src/routes/index.tsx');
    expect(idx).toMatch(/const ZS_HIDE_NAV = new Set<string>\(\);/);
    expect(idx).toMatch(/\{ id: 'objectives', name: 'Objetivos', icon: ListChecks \}/);
    expect(idx).toMatch(/\{zs \? 'Voltar ao mapa' : 'Voltar ao vale'\}/);
  });
});
