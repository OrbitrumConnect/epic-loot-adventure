/**
 * App instalável (PWA). Android/Chrome/Edge: guarda o convite de instalação do navegador pra
 * um botão "Instalar app" usar na hora que o jogador quiser. iPhone não tem convite: o jogador
 * usa Compartilhar → Adicionar à Tela de Início (o painel mostra a instrução).
 */
import { create } from 'zustand';

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export const usePwa = create<{ canInstall: boolean; installed: boolean; ios: boolean }>(() => ({
  canInstall: false, installed: false, ios: false,
}));

let deferred: InstallPromptEvent | null = null;
let started = false;

export function startPwa(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches
    || window.matchMedia?.('(display-mode: fullscreen)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  usePwa.setState({ installed: Boolean(standalone), ios });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // não mostra a faixa automática: o botão do jogo decide a hora
    deferred = e as InstallPromptEvent;
    usePwa.setState({ canInstall: true });
  });
  window.addEventListener('appinstalled', () => { deferred = null; usePwa.setState({ canInstall: false, installed: true }); });
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* sem SW o jogo segue normal */ });
  }
}

export async function promptInstall(): Promise<void> {
  if (!deferred) return;
  await deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  usePwa.setState({ canInstall: false });
}
