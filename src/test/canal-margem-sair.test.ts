import fs from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { decodeTerrain, type ZsTerrain, ZS_WATER_Y, zsHeightAt } from '@/components/zona-sul/zs-terrain-data';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsStep } from '@/components/zona-sul/zs-move';

/* Pedro 03/11: "no Jardim de Alah, canal, quando entro na água e vou sair do outro lado às vezes buga a margem pra subir".
   No MAPA DE VERDADE: nada do meio do canal até cada margem (os dois lados, de 2 em 2 m ao longo do trecho estreito, z 248–368: das avenidas à areia; antes disso já é a Lagoa aberta) com
   o MESMO passo do jogo (zsStep) e conta onde NÃO dá pra sair (fica preso na beira). */
let t: ZsTerrain;
beforeAll(async () => {
  const sharp = (await import('sharp')).default;
  const { data, info } = await sharp(fs.readFileSync('public' + ZS_TERRAIN.url)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  t = decodeTerrain(data, info.width, info.height);
});
/** eixo do canal (o mesmo do teste do navio) */
const axisX = (z: number) => (z <= 280 ? -205 : z <= 340 ? -205 + (z - 280) * (-18 / 60) : -223);

/** Nada do eixo pro lado `dir` (±1 em x) até sair: true = pisou em terra seca (≥ 0,3 m acima d'água) em ≤ 30 m. */
function exits(z: number, dir: 1 | -1): boolean {
  let x = axisX(z), zz = z;
  const step = 0.06; // ~3,6 m/s a 60 quadros
  for (let k = 0; k < 600; k++) {
    const r = zsStep(t, x, zz, dir * step, 0);
    if (r.x === x && r.z === zz) return false; // travou na beira
    x = r.x; zz = r.z;
    if (!r.swimming && !r.wading && zsHeightAt(t, x, zz) >= ZS_WATER_Y + 0.3) return true;
  }
  return false;
}

describe('canal do Jardim de Alah: sair da água pelos dois lados', () => {
  it('em todo o trecho do canal dá pra subir a margem (dos dois lados)', () => {
    const stuck: string[] = [];
    let n = 0;
    for (let z = 248; z <= 368; z += 2) for (const d of [1, -1] as const) { n++; if (!exits(z, d)) stuck.push(`z${z}${d > 0 ? 'L' : 'O'}`); }
    if (process.env['CANAL_OUT']) fs.writeFileSync(process.env['CANAL_OUT'], `${stuck.length}/${n} ${stuck.join(' ')}`);
    expect(stuck, `${stuck.length}/${n} presos: ${stuck.join(' ')}`).toEqual([]);
  });
});
