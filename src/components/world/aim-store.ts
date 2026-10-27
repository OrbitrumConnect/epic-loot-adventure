import { create } from 'zustand';

// A HUD precisa do store de mira sem arrastar three para o primeiro carregamento.

export const AIM_ZOOM_MAX = 4;
export const useAim = create<{ active: boolean; zoom: number }>(() => ({ active: false, zoom: 1 }));
/** Sensibilidade do giro mirando: cai na mesma proporção do campo de visão (52°/zoom vs 65° sem mirar) →
 *  mirar longe não treme (Pedro 25/10, celular). Sem mirar = 1 (igual a antes). */
export function aimSensitivityScale(): number {
  const s = useAim.getState();
  return s.active ? 52 / Math.max(1, s.zoom) / 65 : 1;
}

export function setAiming(on: boolean): void {
  const s = useAim.getState();
  if (s.active === on) return;
  useAim.setState({ active: on, zoom: on ? s.zoom : 1 });
}
