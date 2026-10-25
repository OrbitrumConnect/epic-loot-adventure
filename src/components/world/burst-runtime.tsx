import { useFrame } from '@react-three/fiber';
import { cancelBurst, tickBurst } from '@/game/systems/burstSystem';

/** Solta os tiros seguintes da RAJADA do rifle (burstSystem) no relógio do jogo; pausar/abrir painel corta a rajada. */
export function BurstRuntime({ paused }: { paused: boolean }) {
  useFrame(() => {
    if (paused) { cancelBurst(); return; }
    tickBurst();
  });
  return null;
}
