import { useSyncExternalStore } from 'react';
import {
  BUILD_KINDS, getBuildMode, setBuildActive, setBuildKind as setWorldKind,
  setBuildTier as setWorldTier, subscribeBuildMode, toggleBuildMode as toggleWorld,
  type BuildKind, type BuildTier,
} from '@/components/world/build-mode';

/**
 * Seleção do modo de construção, vista pelo HUD.
 *
 * O estado de verdade vive em `components/world/build-mode.ts`, que é quem o
 * mundo 3D lê a cada quadro e quem guarda também a fase (claim/construir) e a
 * prévia do arrasto. Este arquivo é só um adaptador com a API que o HUD já usa
 * — os dois lados precisam falar com UM estado só, senão o seletor de peças
 * escolhe uma coisa e o mundo constrói outra.
 */

export type BuildPieceKind = BuildKind;
export type { BuildTier };

export type BuildSelection = {
  /** Modo de construção ligado? */
  active: boolean;
  kind: BuildPieceKind;
  tier: BuildTier;
};

/** Tecla que liga o modo de construção, para o texto da interface. */
export const BUILD_MODE_KEY_LABEL: string | null = 'N';

export const BUILD_PIECE_KINDS: readonly BuildPieceKind[] = BUILD_KINDS;

/**
 * `useSyncExternalStore` exige que o retorno seja estável enquanto nada muda —
 * devolver um objeto novo a cada leitura faria o React re-renderizar sem parar.
 */
let cached: BuildSelection = { active: false, kind: 'wall', tier: 1 };

export function getBuildSelection(): BuildSelection {
  const m = getBuildMode();
  if (m.active !== cached.active || m.kind !== cached.kind || m.tier !== cached.tier) {
    cached = { active: m.active, kind: m.kind, tier: m.tier };
  }
  return cached;
}

export function subscribeBuildSelection(listener: () => void): () => void {
  return subscribeBuildMode(listener);
}

export function setBuildMode(active: boolean): void {
  setBuildActive(active);
}

export function toggleBuildMode(): void {
  toggleWorld();
}

export function setBuildKind(kind: BuildPieceKind): void {
  setWorldKind(kind);
}

export function setBuildTier(tier: BuildTier): void {
  setWorldTier(tier);
}

export function useBuildSelection(): BuildSelection {
  return useSyncExternalStore(subscribeBuildSelection, getBuildSelection, getBuildSelection);
}
