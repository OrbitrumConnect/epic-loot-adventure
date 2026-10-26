import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { noteShotAt, recentShotPoint } from '@/game/systems/shotFacing';

/* Pedro, 25/10: "tô mirando pra frente, mas tem bala indo pra trás ou pro lado e o boneco não vira".
   Causas: (1) o herói virava pro bicho MAIS PERTO a cada ataque, não pro que levou o tiro; (2) piloto ligado + você
   mirando: o piloto seguia atirando no alvo DELE (do lado/atrás) com o herói travado olhando pra câmera. */
describe('herói vira pro alvo do tiro; piloto não atira enquanto você mira', () => {
  it('ponto do último tiro vale por 0,4 s', () => {
    noteShotAt(3, 4, 1000);
    expect(recentShotPoint(1300)).toMatchObject({ x: 3, z: 4 });
    expect(recentShotPoint(1500)).toBeNull();
  });
  it('store anota o alvo real (golpe e tiro no vazio); o herói vira pra ele', () => {
    const store = fs.readFileSync('src/game/state/game-store.ts', 'utf8');
    expect(store).toMatch(/noteShotAt\(creature\.position\.x, creature\.position\.z\);/);
    expect(store).toMatch(/noteShotAt\(toward\.x, toward\.z\);/);
    const gw = fs.readFileSync('src/components/game-world.tsx', 'utf8');
    expect(gw).toMatch(/const shot = recentShotPoint\(\);[\s\S]{0,200}targetRotY\.current = Math\.atan2\(shot\.x - b\.position\.x, shot\.z - b\.position\.z\);/);
  });
  it('piloto: mirando (botão direito) não ataca nem usa especial; andar/recuar seguem', () => {
    const ap = fs.readFileSync('src/components/world/auto-pilot.tsx', 'utf8');
    expect(ap).toMatch(/const playerAiming = useAim\.getState\(\)\.active && \(decision\.action === 'attack' \|\| decision\.action === 'special'\);/);
  });
});
