import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

/* 27/10 — celular DEITADO (~340 px de altura): o jogo exigia 550 px (`min-height`) → rodapé 210 px fora da tela,
   AUTO/piloto/triggers sem toque e arco de ataque cortado. Bloco só pra tela baixa (≤ 500 px). */
const css = fs.readFileSync('src/styles.css', 'utf8').replace(/\r\n/g, '\n');
const block = css.slice(css.indexOf('@media (max-height: 500px)'));

describe('celular deitado cabe na tela', () => {
  it('existe o bloco de tela baixa e ele vem DEPOIS das regras que impõem altura mínima (ganha na cascata)', () => {
    expect(css.indexOf('@media (max-height: 500px)')).toBeGreaterThan(css.lastIndexOf('min-height: 550px'));
    expect(css.indexOf('@media (max-height: 500px)')).toBeGreaterThan(css.lastIndexOf('min-height: 450px'));
  });
  it('jogo sem altura mínima; cabeçalho fino; rodapé numa linha; missão fora; lateral rola', () => {
    expect(block).toMatch(/\.game-shell \{ min-height: 0; \}/);
    expect(block).toMatch(/\.game-header \{ height: 44px;/);
    expect(block).toMatch(/\.potion-ctl \{ flex-direction: row;/);
    expect(block).toMatch(/\.quest \{ display: none; \}/);
    expect(block).toMatch(/\.game-sidebar \{ overflow-y: auto;/);
  });
  it('PC e celular em pé: a altura mínima original continua (550 / 450)', () => {
    expect(css).toMatch(/\.game-shell \{[^}]*min-height: 550px;/);
    expect(css).toMatch(/\.game-shell \{[^}]*min-height: 450px;/);
  });
});
