import type { EditorObject } from './editor-store';

/**
 * Layout do Editor ADM "publicado" (baked) no código → aparece no Vercel/mobile p/
 * TODOS, sem depender do localStorage de cada navegador.
 *
 * Como publicar o que você montou no Editor:
 *  1. No navegador onde você editou: F12 → Console → rode:
 *       copy(localStorage.getItem('tribos.editor.local.v1'))
 *     (isso copia o JSON do seu layout pro clipboard)
 *  2. Cole aqui pro Claude; ele converte e preenche o array abaixo.
 *  3. commit/push → Vercel passa a mostrar as palmeiras/ponte/torre etc.
 *
 * Objetos com `source: 'editor'` renderizam via PlacedObject (com colisão de chão,
 * então dá pra andar em cima da ponte). O localStorage do editor, quando existir,
 * tem prioridade sobre o baked (pra você continuar ajustando).
 */
export const BAKED_EDITOR_OBJECTS: EditorObject[] = [
  // (vazio por enquanto — cole o layout aqui e commite)
];
