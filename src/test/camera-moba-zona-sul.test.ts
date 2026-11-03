import fs from 'node:fs';
import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import { pinchDist, setZsCamMode, toggleZsCam, useZsCam, ZS_CAM_KEY, ZS_MOBA, ZS_SHOULDER_DIST } from '@/components/zona-sul/zs-camera';
import { seeCut, withSeeThrough, ZS_SEE, zsSeeThrough } from '@/components/zona-sul/zs-see-through';

/* Pedro, 03/11: "no mobile mudar câmera MOBA de cima saiu?! no mapa novo ver os tipos de câmera web e mobile, pra ficar
   pro, elite, pra jogar direito" + "cuidado pra não regredir". O botão Câmera estava escondido na Zona Sul desde 29/10 e o
   V levava pra vista do mapa (solta do herói). Agora: ombro (o de sempre, padrão) ↔ de cima (MOBA), botão + V. */
const read = (p: string) => fs.readFileSync(p, 'utf8');

describe('câmera de cima (MOBA) na Zona Sul', () => {
  beforeEach(() => { localStorage.removeItem(ZS_CAM_KEY); setZsCamMode('ombro'); });

  it('botão/V alterna ombro ↔ de cima e o aparelho lembra; padrão = ombro (nada muda pra quem não trocar)', () => {
    localStorage.removeItem(ZS_CAM_KEY);
    expect(useZsCam.getState().mode).toBe('ombro');
    expect(toggleZsCam()).toBe('cima');
    expect(useZsCam.getState().mode).toBe('cima');
    expect(localStorage.getItem(ZS_CAM_KEY)).toBe('cima');
    expect(toggleZsCam()).toBe('ombro');
    expect(localStorage.getItem(ZS_CAM_KEY)).toBe('ombro');
    // de cima: ângulo ~53°, lente fechada, distância dentro da faixa da roda/pinça
    expect(ZS_MOBA.PITCH).toBeGreaterThan(0.8); expect(ZS_MOBA.PITCH).toBeLessThan(1.05);
    expect(ZS_MOBA.FOV).toBeLessThan(55);
    expect(ZS_MOBA.DIST).toBeGreaterThanOrEqual(ZS_MOBA.MIN); expect(ZS_MOBA.DIST).toBeLessThanOrEqual(ZS_MOBA.MAX);
    expect(ZS_SHOULDER_DIST).toEqual({ MIN: 3, MAX: 40 }); // a roda do ombro de antes
  });

  it('pinça: abrir os dedos aproxima, fechar afasta, sempre dentro da faixa', () => {
    expect(pinchDist(22, 100, 200, 12, 50)).toBe(12);   // dobrou a abertura → metade (presa no mínimo)
    expect(pinchDist(22, 100, 120, 12, 50)).toBeCloseTo(18.33, 2);
    expect(pinchDist(22, 120, 100, 12, 50)).toBeCloseTo(26.4, 2);
    expect(pinchDist(22, 100, 10, 12, 50)).toBe(50);
    expect(pinchDist(22, 0, 100, 12, 50)).toBe(22);    // sem abertura anterior: não mexe
  });

  it('ver através: some só o que está ENTRE a câmera e o herói, perto da linha; atrás, ao lado e colado no herói fica', () => {
    const cam = { x: 0, y: 18, z: 14 }, hero = { x: 0, y: 1.1, z: 0 };
    const at = (t: number, side = 0) => ({ x: side, y: cam.y + (hero.y - cam.y) * t, z: cam.z + (hero.z - cam.z) * t });
    expect(seeCut(at(0.6), cam, hero)).toBe(1);          // copa na frente do herói, na linha
    expect(seeCut(at(0.85, 1.5), cam, hero)).toBe(1);     // 1,5 m ao lado da linha, perto do herói (raio 4,5 m)
    expect(seeCut(at(0.85, 6), cam, hero)).toBe(0);       // longe da linha
    expect(seeCut(at(0.2, 2), cam, hero)).toBe(0);        // perto da câmera o cone é fino (círculo fixo na tela)
    expect(seeCut({ x: 0, y: 1, z: -3 }, cam, hero)).toBe(0); // atrás do herói
    expect(seeCut(at(0.99), cam, hero)).toBe(0);          // colado no herói (< 1,2 m na frente): o tronco do lado fica
    expect(ZS_SEE.R).toBe(4.5);
  });

  it('shader: corte e conta no vértice só com a câmera de cima ligada; encadeia o remendo de antes; chave própria', () => {
    const fade = new THREE.MeshStandardMaterial();
    fade.onBeforeCompile = (s) => { s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\n// fade-antes'); };
    fade.customProgramCacheKey = () => 'instance-fade-v1';
    withSeeThrough(fade);
    const plain = withSeeThrough(new THREE.MeshStandardMaterial());
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: '#include <common>\nvoid main(){\n#include <project_vertex>\n}',
      fragmentShader: '#include <common>\nvoid main(){\n#include <clipping_planes_fragment>\n}',
    };
    fade.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, {} as THREE.WebGLRenderer);
    expect(shader.fragmentShader).toContain('// fade-antes');                       // o remendo de antes continua
    expect(shader.uniforms['uSeeOn']).toBe(zsSeeThrough.on);
    expect(shader.vertexShader).toMatch(/uniform float uSeeOn;[\s\S]*if \(uSeeOn > 0\.5\) \{[\s\S]*instanceMatrix \* seeW/);
    expect(shader.fragmentShader).toMatch(/if \(uSeeOn > 0\.5\) \{[\s\S]*discard;[\s\S]*\}/);
    expect(fade.customProgramCacheKey()).toBe('instance-fade-v1|zs-see-v1');
    expect(plain.customProgramCacheKey()).not.toBe(fade.customProgramCacheKey()); // nunca dividem programa
    expect(zsSeeThrough.on.value).toBe(0); // começa desligado
  });

  it('mundo da Zona Sul: V/botão trocam a câmera de jogo, K segue o mapa; caverna vira ombro; só a pé; arrasto de cima só gira', () => {
    const zw = read('src/components/zona-sul/zona-sul-world.tsx');
    expect(zw).toMatch(/else if \(input\.overview\) input\.overview = false;\s*else toggleZsCam\(\);/);
    expect(zw).toMatch(/if \(e\.code === 'KeyK' && !e\.repeat\) input\.overview = !input\.overview;/);
    expect(zw).toMatch(/const wantMoba = useZsCam\.getState\(\)\.mode === 'cima' && !zsCave\.inCave \? 1 : 0;/);
    expect(zw).toMatch(/const basePitch = input\.pitch \+ \(ZS_MOBA\.PITCH - input\.pitch\) \* mk \* \(1 - ak\);/); // mirando = ombro
    expect(zw).toMatch(/const mobaOn = \(\) => useZsCam\.getState\(\)\.mode === 'cima' && drive\.mode === 'foot' && !zsCave\.inCave/);
    expect(zw).toMatch(/else if \(!mobaOn\(\)\) input\.pitch = /);
    expect(zw).toMatch(/zsSeeThrough\.on\.value = 0; housePlayerInside\.current = false;/); // todo quadro começa desligado
    expect(zw).toMatch(/<HarvestNodes c=\{cFarm\} seeThrough=\{withSeeThrough\} \/>/);
    expect(zw).toMatch(/<HarvestNodes c=\{cFarm\} layer=\{1\} \/>/); // minério da caverna: sem corte
    const veg = read('src/components/zona-sul/zs-vegetation.tsx');
    expect(veg).toMatch(/if \(k !== 'far'\) withSeeThrough\(mat\);/);
  });

  it('casa do jogo: botão Câmera volta na Zona Sul (PC e celular); Vale igual; ATACAR de cima pega o mais perto', () => {
    const idx = read('src/routes/index.tsx');
    expect(idx).toMatch(/onClick=\{toggleZsCam\}><Camera \/><\/Button>/);
    expect(idx).toMatch(/: <Button variant="ghost" className="world-action" aria-label="Câmera" title=\{`Câmera: \$\{cameraMode === 'iso' \? 'Isométrica' : '3ª Pessoa'\} · V`\} onClick=\{toggleCamera\}><Camera \/><\/Button>\}/);
    expect(idx).toMatch(/canAim=\{zs \? zsCam === 'ombro' : cameraMode === 'third'\} aimButton=\{zs \|\| cameraMode === 'third'\}/);
    expect(idx).toMatch(/<AimCrosshair shoulder=\{zs \? zsCam === 'ombro' : cameraMode === 'third'\} \/>/);
    const mc = read('src/components/world/mobile-controls.tsx');
    expect(mc).toMatch(/export function MobileControls\(\{ onAttack, canAim = false, aimButton = canAim, powers = \[\] \}/); // Vale: igual
    expect(mc).toMatch(/\.\.\.\(aimButton \? \[\{ id: 'aim', label: 'Mirar'/);
    const hn = read('src/components/world/harvest-nodes.tsx');
    expect(hn).toMatch(/const built = useMemo\(\(\) => buildAssets\(c, layer === 1, seeThrough\), \[c, layer, seeThrough\]\);/);
  });
});
