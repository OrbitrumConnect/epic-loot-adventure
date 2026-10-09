/**
 * Estado compartilhado do modo de construção (mundo 3D <-> HUD).
 *
 * O mundo escreve aqui (fase, validação do claim, resumo da prévia) e o HUD lê
 * e escolhe a peça. É um mini-store externo (sem Zustand, sem React no caminho
 * quente): o mundo usa `getBuildMode()` nos laços de quadro e só chama
 * `patchBuildMode` quando algo DISCRETO muda (nunca a 60 Hz); o HUD usa o hook
 * `useBuildMode()`.
 *
 * Tecla do modo: `N` (liga/desliga). Dentro do modo: `X` troca a peça, `Z` troca
 * o nível (madeira -> pedra -> ferro), `Enter` confirma o claim, `Esc` sai.
 */
import { useSyncExternalStore } from 'react';
import type { BasePieceKind } from '@/game/types/playerbase';

/** O que o jogador pode construir arrastando (a cama nasce com o claim). */
export type BuildKind = Exclude<BasePieceKind, 'core'>;
export const BUILD_KINDS: readonly BuildKind[] = ['wall', 'door', 'tower', 'roof'];

export type BuildTier = 1 | 2 | 3;

export type BuildSnapshot = Readonly<{
  /** Modo de construção ligado. */
  active: boolean;
  /** Peça escolhida para o arrasto. */
  kind: BuildKind;
  tier: BuildTier;
  /** `claim` = ainda sem base (quadrado verde/vermelho segue o jogador); `build` = base existe. */
  phase: 'claim' | 'build';
  /** Fase `claim`: o terreno sob o quadrado passa em `checkClaim`? */
  claimOk: boolean;
  /** Fase `claim`: mensagem pronta em português (motivo da recusa ou "livre"). */
  claimMessage: string;
  /** Fase `build`: quantas peças a prévia construiria / quantas células foram recusadas. */
  previewCells: number;
  previewBlocked: number;
  /** A prévia atual cabe no bolso? (false também quando não há células válidas). */
  previewAffordable: boolean;
  previewCost: readonly { itemId: string; quantity: number }[];
}>;

const INITIAL: BuildSnapshot = {
  active: false,
  kind: 'wall',
  tier: 1,
  phase: 'claim',
  claimOk: false,
  claimMessage: '',
  previewCells: 0,
  previewBlocked: 0,
  previewAffordable: false,
  previewCost: [],
};

let snap: BuildSnapshot = INITIAL;
const listeners = new Set<() => void>();

export function getBuildMode(): BuildSnapshot {
  return snap;
}

/** Atalho barato para guardas em laços de evento (sem alocar). */
export function isBuildActive(): boolean {
  return snap.active;
}

export function subscribeBuildMode(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

function sameCost(a: BuildSnapshot['previewCost'], b: BuildSnapshot['previewCost']): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i]!.itemId !== b[i]!.itemId || a[i]!.quantity !== b[i]!.quantity) return false;
  }
  return true;
}

/** Aplica um patch; só notifica se algum campo de fato mudou. */
export function patchBuildMode(patch: Partial<BuildSnapshot>): void {
  let changed = false;
  for (const key of Object.keys(patch) as (keyof BuildSnapshot)[]) {
    const next = patch[key];
    const prev = snap[key];
    if (key === 'previewCost') {
      if (!sameCost(prev as BuildSnapshot['previewCost'], next as BuildSnapshot['previewCost'])) { changed = true; break; }
    } else if (prev !== next) { changed = true; break; }
  }
  if (!changed) return;
  snap = { ...snap, ...patch };
  for (const fn of listeners) fn();
}

/** Hook do HUD. Re-renderiza só quando o snapshot muda (eventos discretos). */
export function useBuildMode(): BuildSnapshot {
  return useSyncExternalStore(subscribeBuildMode, getBuildMode, getBuildMode);
}

export function setBuildActive(active: boolean): void {
  patchBuildMode(active
    ? { active: true }
    : { active: false, previewCells: 0, previewBlocked: 0, previewAffordable: false, previewCost: [] });
}

export function toggleBuildMode(): void {
  setBuildActive(!snap.active);
}

export function setBuildKind(kind: BuildKind): void {
  patchBuildMode({ kind });
}

export function setBuildTier(tier: BuildTier): void {
  patchBuildMode({ tier });
}

export function cycleBuildKind(): void {
  const i = BUILD_KINDS.indexOf(snap.kind);
  patchBuildMode({ kind: BUILD_KINDS[(i + 1) % BUILD_KINDS.length]! });
}

export function cycleBuildTier(): void {
  patchBuildMode({ tier: (snap.tier % 3 + 1) as BuildTier });
}

/* ------------------------------------------------------------------ *
 * Confirmar o claim: o HUD pode oferecer um botão; quem sabe a origem do
 * quadrado é o mundo, que registra o tratador aqui.
 * ------------------------------------------------------------------ */
let claimHandler: (() => void) | null = null;

export function registerClaimHandler(fn: (() => void) | null): void {
  claimHandler = fn;
}

/** Pede ao mundo para reivindicar o terreno sob o quadrado atual. */
export function confirmClaim(): void {
  claimHandler?.();
}
