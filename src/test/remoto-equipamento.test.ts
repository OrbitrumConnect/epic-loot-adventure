import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ZS_GEAR, ZS_HERO_ACTIONS, ZS_HERO_CLIPS } from '@/components/zona-sul/zs-hero-clips';
import { ZS_REMOTE_KIT } from '@/components/zona-sul/zs-remote-gear';

/* Pedro 02/11 (online, aliado e inimigo): "amigo nadando vejo ele em pé na água; não vejo o skate no pé dele; na
   prancha em pé, não deitado nem surfando". O boneco dos outros só aceitava 9 ações (o resto virava "parado") e não
   tinha os clips da Zona Sul; prancha/skate/asa não iam pela rede. */
describe('o outro jogador nadando / na prancha / skate / asa', () => {
  it('o kit da Zona Sul: os MESMOS clips do meu herói e as ações dele aceitas pela rede', () => {
    for (const a of ['swim', 'tread', 'paddle', 'popup', 'surf', 'glide', 'drive']) expect(ZS_HERO_ACTIONS, a).toContain(a);
    expect(ZS_REMOTE_KIT.clips).toBe(ZS_HERO_CLIPS);
    const rp = fs.readFileSync('src/components/world/remote-players.tsx', 'utf8');
    expect(rp).toContain("action.current = (allowed.has(p.action) ? p.action : 'idle') as HeroAction;");
    expect(rp).toContain('speedRef={speed} customClips={zs.clips} customClipCut={zs.cut}');
    expect(rp).toContain('{zs && <zs.Gear id={id} bodyRef={group} />}');
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('<RemotePlayers zs={ZS_REMOTE_KIT} />');
    expect(zs).toContain('customClips={HERO_CLIPS}'); // o meu herói igual
  });
  it('o equipamento vai de carona na pose (asa > skate > prancha) e quem recebe desenha no lugar do boneco', () => {
    expect(ZS_GEAR).toEqual({ board: 1, skate: 2, glider: 3 });
    const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(zs).toContain('const src = gp.visible ? gp : sp.visible ? sp : bp.visible ? bp : null;');
    expect(zs).toContain('selectedItemId(gs), netVehicles, gearOn ? netGear : null);');
    const net = fs.readFileSync('src/net/multiplayer.ts', 'utf8');
    expect(net).toContain('...(gear ? { g: gear.slice() } : {}),');
    const gear = fs.readFileSync('src/components/zona-sul/zs-remote-gear.tsx', 'utf8');
    expect(gear).toContain('pose.current.y = body.position.y + g[1]!');
  });
});
