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
  it('o LEVANTAR e a mensagem do mundo usam a altura do arco; o crédito do mapa vai pro alto', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(css).not.toContain('.zs-touch'); // 31/10: a coluna de retângulos acima do arco saiu (botões entraram no arco)
    expect(css).toContain('.game-shell[data-touch] .zs-btn--pop { right: 10px; bottom: calc(var(--mobile-arc-top, 232px) + 10px); }');
    expect(css).toMatch(/\.game-shell\[data-touch\] \.world-bottom \{ bottom: calc\(var\(--mobile-arc-top/);
    expect(css).toMatch(/\.game-shell\[data-touch\] \.zs-credit \{ top: 2px; bottom: auto;/);
    expect(readFileSync('src/components/world/mobile-controls.tsx', 'utf8')).toContain("setProperty('--mobile-arc-top'");
  });
});

/* Pedro 31/10: "os botões do carro grandes, retangulares, em cima dos outros — horrível; no mesmo sistema dos poderes,
   embaixo". Agora entram no ARCO (redondos, 40 px) e só quando servem. */
describe('celular: botões da Zona Sul DENTRO do arco de poderes', () => {
  it('o arco aceita botões do mapa: substitui o anel de dentro e põe na frente do de fora; segurar solta no dedo', () => {
    const src = readFileSync('src/components/world/mobile-controls.tsx', 'utf8');
    expect(src).toContain('export const useArcExtras = create');
    expect(src).toContain('const inner: ArcButton[] = extras.inner ?? [');
    expect(src).toContain('const outer = [...extras.outer, ...powers.filter(');
    expect(src).toContain('onPointerUp={b.onRelease} onPointerCancel={b.onRelease} onPointerLeave={b.onRelease}');
  });
  it('dirigindo = painel do carro (Subir/Descer/Turbo de segurar + Sair); a pé = Carro perto do carro, Mergulhar nadando', () => {
    const src = readFileSync('src/components/zona-sul/zona-sul-world.tsx', 'utf8');
    expect(src).toContain("holdBtn('zs-up', 'Subir', <ArrowUp />, 'Space'), holdBtn('zs-down', 'Descer', <ArrowDown />, 'KeyC')");
    expect(src).toContain("holdBtn('zs-turbo', 'Turbo', <Gauge />, 'ShiftLeft'), carBtn('Sair do carro', <LogOut />)");
    expect(src).toContain("...(nearCar ? [carBtn('Entrar no carro', <Car />)] : [])");
    expect(src).toContain("...(inWater ? [holdBtn('zs-dive', 'Mergulhar', <ArrowDownToLine />, 'KeyC')] : [])");
    // trocar de momento com o dedo no botão não deixa tecla presa
    expect(src).toContain('for (const k of ARC_HELD) input.keys.delete(k); ARC_HELD.clear();');
    expect(src).toContain('{touch && t && !paused && <ZsTouchArc />}');
    expect(src).not.toContain('className="zs-touch"');
  });
  it('com o painel do carro (4 botões) o arco não cresce: cabe no raio mínimo', () => {
    expect(arcRadius(4, ARC_INNER)).toBe(ARC_INNER);
  });
});
