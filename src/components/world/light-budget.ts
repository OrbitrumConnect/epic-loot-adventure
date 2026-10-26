/**
 * ORÇAMENTO DE LUZES (26/10, celular fraco — A17). No navegador cada luz pontual ACESA pesa no desenho de TUDO que está
 * na tela. Perto da base, à noite, acendiam juntos: refletores das torres (até 70 m), casa, postes e fogueiras.
 * Cada luz continua decidindo se QUER acender (dia/noite/distância, como antes); aqui só se limita QUANTAS:
 *  PC = sem limite (igual a antes) · celular (controles de toque) = as 4 mais perto do herói · modo leve = 3.
 * Fora do React: cada luz se anuncia por quadro; quem não se anuncia há 0,5 s sai da conta.
 */
import { useRef } from 'react';
import { touchLayout } from './virtual-input';
import { lowGpuMode } from './gpu-guard';

export const MOBILE_LIGHTS = 4;
export const LOW_GPU_LIGHTS = 3;
const STALE_MS = 500;
const LOW_GPU = lowGpuMode();

const wants = new Map<number, { d2: number; at: number }>();

export function lightCap(): number {
  if (LOW_GPU) return LOW_GPU_LIGHTS;
  return touchLayout.on ? MOBILE_LIGHTS : Infinity;
}

/** A luz `id` quer acender (`want`) a `d2` (distância² do herói): pode? Empate de distância desempata pelo id. */
export function lightAllowed(id: number, want: boolean, d2: number, now = performance.now(), cap = lightCap()): boolean {
  if (!want) { wants.delete(id); return false; }
  wants.set(id, { d2, at: now });
  if (!Number.isFinite(cap)) return true;
  let closer = 0;
  for (const [k, v] of wants) {
    if (k === id) continue;
    if (now - v.at > STALE_MS) { wants.delete(k); continue; }
    if (v.d2 < d2 || (v.d2 === d2 && k < id)) closer++;
  }
  return closer < cap;
}

/** Libera a vaga ao desmontar (ex.: torre destruída). */
export function releaseLight(id: number): void { wants.delete(id); }

let nextId = 1;
/** Id estável por luz (componente). */
export function useLightId(): number {
  const r = useRef(0);
  if (r.current === 0) r.current = nextId++;
  return r.current;
}
