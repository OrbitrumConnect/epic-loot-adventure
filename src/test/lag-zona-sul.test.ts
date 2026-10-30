import { readFileSync, statSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { AI_FAR_EVERY, aiLodStep } from '@/components/world/hostile-ai';
import { pickLights, type LightReq } from '@/components/world/light-pool';
import { MOUNTS_PER_FRAME, planCreatureMounts } from '@/components/world/world-entities';
import { sameButPosition } from '@/game/state/player-sans-position';
import { ZS_VEG_SHADOW_R, zsVegCastsShadow } from '@/components/zona-sul/zs-vegetation';
import { useGameStore } from '@/game/state/game-store';

/* Pedro 30/10: "o lag está aumentando — o que pode ajustar pra evitar lags". Medido no navegador (perfil de CPU dirigindo
   o carro 8 s): a página inteira re-renderizava ~7×/s pela posição + 1×/s pelo relógio (39% da CPU, 44 travadas de
   100–250 ms); 217 bichos pensando todo quadro; luzes ligando/desligando recompilavam todos os shaders; grupos de bichos
   montando de uma vez. Depois: 0 travadas longas no mesmo trajeto. */
describe('lag — página do jogo não redesenha pela posição', () => {
  it('jogador que só mudou de posição é "igual"; qualquer outra mudança não', () => {
    const p = useGameStore.getState().player;
    expect(sameButPosition(p, { ...p, position: { x: p.position.x + 5, z: 1 } })).toBe(true);
    expect(sameButPosition(p, { ...p, hp: p.hp - 1 })).toBe(false);
    expect(sameButPosition(p, { ...p, inventory: { ...p.inventory } })).toBe(false);
  });
  it('a página usa o jogador sem posição e o relógio só bate com contagem na tela (Zona Sul)', () => {
    const idx = readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toContain('const player = usePlayerSansPosition();');
    expect(idx).not.toContain('const player = useGameStore(s => s.player);');
    expect(idx).toContain('const need = !zsRef.current || countdownsActive();');
    expect(idx).toContain('<MapCoordinate day={clock.day} time={clock.time} />'); // Vale: coordenadas seguem vivas
  });
});

describe('lag — IA por distância', () => {
  it('perto: pensa todo quadro (igual antes); longe: a cada 4 com o tempo somado (mesma velocidade)', () => {
    const near = { frame: 0, acc: 0 };
    expect(aiLodStep(near, 1 / 60, false)).toBeCloseTo(1 / 60, 6);
    const far = { frame: 0, acc: 0 };
    let applied = 0, ran = 0;
    for (let i = 0; i < 120; i++) { const d = aiLodStep(far, 1 / 60, true); if (d > 0) { ran++; applied += d; } }
    expect(ran).toBe(120 / AI_FAR_EVERY);
    expect(applied).toBeCloseTo(2, 5); // 2 s de jogo = 2 s de IA (ninguém fica lento nem congela)
  });
});

describe('lag — bichos entram aos poucos (sem pico ao chegar num grupo)', () => {
  it('quem já está montado fica; os novos entram na fila do MAIS PERTO pro mais longe; 1 por quadro', () => {
    const cr = (id: string, x: number) => ({ id, position: { x, z: 0 } });
    const list = [cr('a', 100), cr('b', 20), cr('c', 60), cr('d', 400), cr('e', 140)];
    const r = planCreatureMounts(list, { x: 0, z: 0 }, 135, new Set(['e']), 'third');
    expect([...r.keep]).toEqual(['e']);       // já montado, dentro da histerese (135 + 15)
    expect(r.queue).toEqual(['b', 'c', 'a']); // fila por distância; 'd' fora do raio
    expect(MOUNTS_PER_FRAME).toBe(1);
  });
});

describe('lag — sombra só da mata perto; modelos pesados simplificados', () => {
  it('árvore grande até 64 m projeta sombra; mais longe ou arbusto/samambaia, não', () => {
    const it0 = (kind: 'canopy' | 'fern' | 'farm', x: number) => ({ kind, x, y: 0, z: 0, h: 10, yaw: 0 });
    expect(zsVegCastsShadow(it0('canopy', 40), 0, 0)).toBe(true);
    expect(zsVegCastsShadow(it0('farm', 63), 0, 0)).toBe(true);
    expect(zsVegCastsShadow(it0('canopy', 90), 0, 0)).toBe(false);
    expect(zsVegCastsShadow(it0('fern', 5), 0, 0)).toBe(false);
    expect(ZS_VEG_SHADOW_R).toBe(64);
  });
  it('pedra de mineração e acampamento com bem menos triângulos (eram 75,6 mil e 99 mil)', () => {
    // GLB: tamanho do arquivo acompanha a malha (texturas iguais) — eram 1,05 MB e 1,04 MB
    expect(statSync('public/models/rocks/mining-rock.glb').size).toBeLessThan(400_000);
    expect(statSync('public/models/props/raider-camp.glb').size).toBeLessThan(500_000);
  });
});

describe('lag — pool de luzes (Zona Sul)', () => {
  const req = (x: number): LightReq => ({ x, y: 0, z: 0, color: new THREE.Color(), intensity: 1, distance: 10, decay: 1 });
  it('dá as vagas aos pedidos mais perto do herói', () => {
    const list = [req(50), req(5), req(30), req(80), req(10)];
    expect(pickLights(list, list.length, 0, 0, 3).map((r) => r.x)).toEqual([5, 10, 30]);
    expect(pickLights(list, 2, 0, 0, 4).map((r) => r.x)).toEqual([5, 50]); // só os pedidos deste quadro
  });
  it('fogueira, tocha e postes pedem vaga; o skate pede a mesma luz de antes; o mundo monta o pool', () => {
    expect(readFileSync('src/components/world/camp.tsx', 'utf8')).toContain('requestLight(');
    expect(readFileSync('src/components/world/held-weapon.tsx', 'utf8')).toContain('requestLight(');
    const dn = readFileSync('src/components/zona-sul/zs-daynight.tsx', 'utf8');
    expect(dn).toContain('requestLight(');
    expect(dn).not.toContain('<pointLight');
    const gear = readFileSync('src/components/zona-sul/zs-gear-view.tsx', 'utf8');
    expect(gear).not.toContain('<pointLight');
    expect(gear).toContain('requestLight(p.x, p.y - 0.25, p.z, SKATE_GLOW, 0.8, 2.5, 2)'); // a MESMA luz azul de antes (Pedro 30/10)
    expect(gear).not.toContain('circleGeometry');
    expect(readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8')).toContain('<LightPool size={touchLayout.on ? 2 : 4} focus={heroRef} />');
  });
});
