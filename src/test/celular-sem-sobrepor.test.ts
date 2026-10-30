import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARC_BTN, ARC_INNER, ARC_RING_GAP, ATTACK_BTN, arcLayout, arcRadius, arcTopPx } from '@/components/world/mobile-controls';

/* Pedro 30/10 (print do celular): "ajustar os triggers ali que estão sobrepostos" — Carro/Correr/Descer da Zona Sul
   ficavam por cima do arco de poderes. Agora o arco publica a altura do topo dele e os botões ficam numa coluna logo acima. */
describe('celular: botões da Zona Sul não cobrem o arco de poderes', () => {
  it('o topo publicado fica acima de TODO botão do arco (com 5 de dentro e 6 de fora)', () => {
    const innerR = arcRadius(5, ARC_INNER), outerR = arcRadius(6, Math.max(112, innerR + ARC_RING_GAP), 84, 186);
    const top = arcTopPx(innerR, outerR, true);
    const all = [...arcLayout(5, innerR), ...arcLayout(6, outerR, 84, 186)];
    const highest = Math.max(...all.map((p) => 18 + ATTACK_BTN / 2 - p.dy + ARC_BTN / 2)); // dy negativo = pra cima
    expect(top).toBeGreaterThanOrEqual(highest);
  });
  it('a coluna da Zona Sul, o LEVANTAR e a mensagem do mundo usam a altura do arco; o crédito do mapa vai pro alto', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).toContain('.game-shell[data-touch] .zs-touch { grid-template-columns: auto; right: 10px; bottom: calc(var(--mobile-arc-top, 232px) + 10px);');
    expect(css).toMatch(/\.game-shell\[data-touch\] \.zs-btn--pop \{ right: 10px; bottom: calc\(var\(--mobile-arc-top/);
    expect(css).toMatch(/\.game-shell\[data-touch\] \.world-bottom \{ bottom: calc\(var\(--mobile-arc-top/);
    expect(css).toMatch(/\.game-shell\[data-touch\] \.zs-credit \{ top: 2px; bottom: auto;/);
    expect(readFileSync('src/components/world/mobile-controls.tsx', 'utf8')).toContain("setProperty('--mobile-arc-top'");
  });
});
