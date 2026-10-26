import fs from 'node:fs';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ARC_BTN, ARC_FROM, ARC_GAP, ARC_INNER, ARC_OUTER, ARC_RING_GAP, ARC_TO, arcLayout, arcRadius, ATTACK_BTN, MobileControls } from '@/components/world/mobile-controls';

/* Pedro, 25/10: "no celular os triggers sobem em linha; o certo é o ATACAR central e os outros em volta, meio
   círculo". Arco em 2 anéis em volta do ATACAR grande; cada botão chama a MESMA ação de antes; correr = joystick
   na borda. */
const dist = (a: { dx: number; dy: number }, b: { dx: number; dy: number }) => Math.hypot(a.dx - b.dx, a.dy - b.dy);

describe('arco do celular', () => {
  it('nenhum botão encosta no vizinho nem no ATACAR, com 1 a 5 botões por anel', () => {
    for (let n = 1; n <= 5; n++) {
      const rIn = arcRadius(n, ARC_INNER);
      const inner = arcLayout(n, rIn);
      for (let i = 1; i < n; i++) expect(dist(inner[i]!, inner[i - 1]!)).toBeGreaterThanOrEqual(ARC_GAP - 1);
      for (const p of inner) expect(Math.hypot(p.dx, p.dy)).toBeGreaterThanOrEqual(ATTACK_BTN / 2 + ARC_BTN / 2); // ATACAR + botão
      const rOut = arcRadius(n, Math.max(ARC_OUTER, rIn + ARC_RING_GAP), ARC_FROM + 4, ARC_TO - 4);
      const outer = arcLayout(n, rOut, ARC_FROM + 4, ARC_TO - 4);
      for (let i = 1; i < n; i++) expect(dist(outer[i]!, outer[i - 1]!)).toBeGreaterThanOrEqual(ARC_GAP - 1);
      expect(rOut - rIn).toBeGreaterThanOrEqual(ARC_BTN + 6); // anéis não se encostam
    }
  });
  /* 26/10 (Pedro: "mais juntos e um pouco menores; o joystick fica com pouco espaço"): com o arco CHEIO (4 dentro,
     5 fora) nenhum botão sai da tela (ATACAR a 16 px da direita, 18 px de baixo) e tudo cabe em ~210 px da direita
     (antes ~271). */
  it('arco cheio cabe no canto: não sai da tela e deixa espaço pro joystick', () => {
    const rIn = arcRadius(4, ARC_INNER);
    const rOut = arcRadius(5, Math.max(ARC_OUTER, rIn + ARC_RING_GAP), ARC_FROM + 4, ARC_TO - 4);
    const all = [...arcLayout(4, rIn), ...arcLayout(5, rOut, ARC_FROM + 4, ARC_TO - 4)];
    const half = ATTACK_BTN / 2, b = ARC_BTN / 2;
    for (const p of all) {
      expect(p.dx + b).toBeLessThanOrEqual(half + 16 - 4); // borda direita (folga 4 px)
      expect(p.dy + b).toBeLessThanOrEqual(half + 18 - 4); // borda de baixo
    }
    const widest = Math.max(...all.map((p) => -p.dx)) + b + half + 16;
    expect(widest).toBeLessThanOrEqual(210);
  });
  it('cada botão chama a mesma ação; ATACAR chama o ataque de sempre', () => {
    const onAttack = vi.fn(), q = vi.fn(), f = vi.fn();
    render(<MobileControls onAttack={onAttack} powers={[
      { id: 'Q', label: 'Especial: salto', icon: null, onPress: q },
      { id: 'F', label: 'Chuva de Flechas', icon: null, onPress: f, cooldown: 3 },
    ]} />);
    fireEvent.pointerDown(screen.getByLabelText('Atacar'));
    fireEvent.pointerDown(screen.getByLabelText('Especial: salto'));
    fireEvent.pointerDown(screen.getByLabelText('Chuva de Flechas'));
    expect(onAttack).toHaveBeenCalledTimes(1);
    expect(q).toHaveBeenCalledTimes(1);
    expect(f).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Chuva de Flechas').textContent).toContain('3'); // recarga visível
    expect(screen.queryByLabelText('Correr')).toBeNull(); // virou joystick na borda
  });
  it('rodapé: botões de COMBATE somem só com os controles de toque (PC/janela estreita iguais)', () => {
    const css = fs.readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\[data-touch\] \.world-actions--footer \[data-combat\] \{ display: none; \}/);
    const idx = fs.readFileSync('src/routes/index.tsx', 'utf8');
    expect(idx).toMatch(/data-touch=\{isMobile \|\| undefined\}/);
    expect(idx.match(/data-combat/g)!.length).toBeGreaterThanOrEqual(5);
  });
});
