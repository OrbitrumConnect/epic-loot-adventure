/**
 * `true` quando o foco do teclado está num campo editável (input/textarea/select/contenteditable).
 * Usado pelos listeners globais do jogo pra NÃO sequestrar as teclas enquanto o jogador digita
 * (login, chat, busca) — senão WASD/Espaço mexiam o herói e travavam a digitação.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== 'string') return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable === true;
}
