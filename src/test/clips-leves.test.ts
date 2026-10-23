import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* Desempenho (23/10): os clips do herói (idle/walk/run/attack/jump) traziam o CORPO inteiro duplicado
   (49 mil triângulos + texturas, ~2 MB cada, ~10 MB no total) — o jogo só usa a animação. Agora só
   animação + ossos (~0,4 MB no total), animação idêntica (conferida valor a valor). */
describe('clips de animação do herói: só animação', () => {
  for (const n of ['idle', 'walk', 'run', 'attack', 'jump']) {
    it(n, () => {
      const b = fs.readFileSync(`public/models/red/${n}.glb`);
      const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
      expect(b.length).toBeLessThan(300_000);
      expect(j.meshes ?? []).toHaveLength(0);
      expect(j.animations).toHaveLength(1);
      expect(j.animations[0].channels.length).toBeGreaterThan(50);
    });
  }
});
