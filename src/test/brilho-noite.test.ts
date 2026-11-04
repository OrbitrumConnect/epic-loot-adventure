import fs from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { addNightGlow, dropNightGlow, NIGHT_GLOW, tickNightGlow } from '@/components/world/glb-hero-mixamo';
import { nightFactor, setWorldEpoch } from '@/game/systems/dayNightSystem';
import { HERO_SKINS } from '@/game/data/hero-skins';

/* Pedro 03/11: "personagem e a índia meio escuros à noite; a heroína também — clareia levemente o que precisa, sem ficar
   tosco"; "a Couraça bem mais clara que o herói à noite". Medido nos GLB: TODOS os antigos têm mapa de brilho próprio a
   100% (claros à noite como de dia); TODOS os do Meshy não têm. Na tela (herói à noite, brilho médio): 23 → 38 com 0,3
   (de dia 59) — legível e ainda com cara de noite; 0,5 já esbranquiça o cabelo. */
const emissiveTex = (url: string) => {
  const b = fs.readFileSync('public' + url), j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  return (j.materials as { emissiveTexture?: unknown }[]).some((m) => !!m.emissiveTexture);
};
const tex = () => new THREE.Texture();
/** relógio do mundo no meio do DIA / da NOITE (o ciclo do jogo) */
function setClock(night: boolean) {
  const b0 = Date.now();
  for (let k = 0; k < 400; k++) { setWorldEpoch(b0 - k * 30_000 - 2001); const nf = nightFactor(); if (night ? nf > 0.99 : nf < 0.01) return; }
  throw new Error('relógio');
}

describe('brilho da noite nos personagens do Meshy (sem mapa de brilho próprio)', () => {
  it('os NOVOS não têm brilho próprio; os ANTIGOS têm (e ficam como estão)', () => {
    for (const s of Object.values(HERO_SKINS)) expect(emissiveTex(s.url), s.id).toBe(false);
    for (const f of ['sorceress', 'indigena', 'cannibal', 'kraken']) expect(emissiveTex(`/models/raiders/${f}.glb`), f).toBe(false);
    for (const f of ['spiked', 'swamp', 'pirate', 'rope_archer', 'scrap_brute', 'alien_brute']) expect(emissiveTex(`/models/raiders/${f}.glb`), f).toBe(true);
  });

  it('liga 1× (a textura vira o brilho), DIA = 0, NOITE = 0,3; antigo não muda; remontar o boneco não perde', () => {
    expect(NIGHT_GLOW.max).toBe(0.3);
    const meshy = new THREE.MeshStandardMaterial({ map: tex() });
    const old = new THREE.MeshStandardMaterial({ map: tex(), emissiveMap: tex(), emissive: new THREE.Color(1, 1, 1) });
    const oldI = old.emissiveIntensity;
    setClock(false);
    const got = addNightGlow([meshy, old]);
    expect(got).toEqual([meshy]);
    expect(meshy.emissiveMap).toBe(meshy.map);
    expect(old.emissiveIntensity).toBe(oldI);
    tickNightGlow(1); expect(meshy.emissiveIntensity).toBe(0); // dia: o visual de dia (aprovado) não muda
    setClock(true);
    tickNightGlow(2); expect(meshy.emissiveIntensity).toBeCloseTo(0.3, 5);
    tickNightGlow(2); // mesmo quadro: não refaz
    // o boneco saiu (trocou de skin) e voltou: o material tem o NOSSO brilho — não confunde com modelo antigo
    dropNightGlow(got);
    expect(addNightGlow([meshy])).toEqual([meshy]);
    setClock(false); tickNightGlow(3); expect(meshy.emissiveIntensity).toBe(0);
    dropNightGlow([meshy]);
  });

  it('ligado no corpo (herói e inimigos usam o mesmo): ao montar, e a intensidade 1× por quadro', () => {
    const h = fs.readFileSync('src/components/world/glb-hero-mixamo.tsx', 'utf8');
    expect(h).toMatch(/const glow = addNightGlow\(mats\);[^\n]*\n\s*return \(\) => dropNightGlow\(glow\);/);
    expect(h).toMatch(/tickNightGlow\(st\.clock\.elapsedTime\);/);
    expect(h).toMatch(/if \(sm\.emissiveMap && !sm\.userData\['nightGlow'\]\) continue;/);
  });
});
