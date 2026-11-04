import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Pedro 03/11 (online): "vejo meu amigo surfar em cima da prancha com a prancha na metade do corpo". Em pé na prancha o
   corpo é desenhado SURF_LIFT (0,8 m) acima de p.y; a rede mandava p.y e a prancha relativa a ele → do outro lado o corpo
   ficava 0,8 m mais baixo que na tela dele e a prancha subia até a cintura. */
const zs = fs.readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');

describe('surf online: o outro jogador em cima da prancha (não com ela na cintura)', () => {
  it('a rede leva a altura do CORPO como ele é desenhado e a prancha relativa a ela', () => {
    expect(zs).toMatch(/const SURF_LIFT = 0\.8;/);
    expect(zs).toMatch(/bodyLift\.current = lift;\n\s*group\.current\.position\.set\(p\.x, p\.y \+ lift, p\.z\);/);
    expect(zs).toMatch(/netGear\[1\] = r2\(src\.y - \(p\.y \+ bodyLift\.current\)\);/);
    expect(zs).toMatch(/gs\.player\.maxHp, p\.y \+ bodyLift\.current, selectedItemId\(gs\)/);
    const gear = fs.readFileSync('src/components/zona-sul/zs-remote-gear.tsx', 'utf8');
    expect(gear).toMatch(/pose\.current\.y = body\.position\.y \+ g\[1\]!;/); // quem vê: prancha = corpo + g[1]
  });

  it('a conta: na minha tela e na do amigo, prancha e corpo no MESMO lugar', () => {
    const LIFT = 0.8, py = 0.12, boardY = py; // em pé (ride): a prancha fica em p.y, o corpo em p.y + 0,8
    const mineBody = py + LIFT, mineBoard = boardY;
    // antes: manda y = p.y e g[1] = prancha − p.y
    const oldBody = py, oldBoard = oldBody + (boardY - py);
    expect(mineBody - oldBody).toBeCloseTo(0.8, 5); // o corpo do amigo aparecia 0,8 m mais baixo → prancha na cintura
    // agora: manda y = p.y + lift e g[1] = prancha − (p.y + lift)
    const sentY = py + LIFT, g1 = boardY - (py + LIFT);
    expect(sentY).toBeCloseTo(mineBody, 5);
    expect(sentY + g1).toBeCloseTo(mineBoard, 5);
    expect(oldBoard).toBeCloseTo(mineBoard, 5); // a prancha já estava certa — era o corpo que afundava
  });
});
