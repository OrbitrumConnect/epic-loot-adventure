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
  // Pontes de sucata (GLB otimizado 34MB→1.7MB). Transforms EXATOS que o Pedro leu no
  // painel do Editor ADM (20/10). Colisão 'floor' = andável. Fixas no código → Vercel.
  // Obs.: o painel só mostrou 2 eixos de escala; o Z foi igualado ao X (ajuste se esticar).
  {
    id: 'baked-bridge-01', name: 'Ponte de sucata 1', assetUrl: '/models/map/wasteland-scrap-bridge.glb',
    source: 'editor', selectable: true, visible: true, collide: 'floor',
    transform: { position: [10.8, -4.234, 6.9], rotation: [0, 1.7, 0], scale: [9.2, 8.2, 9.2] },
  },
  {
    id: 'baked-bridge-02', name: 'Ponte de sucata 2', assetUrl: '/models/map/wasteland-scrap-bridge.glb',
    source: 'editor', selectable: true, visible: true, collide: 'floor',
    transform: { position: [6.5, -4.046, 38], rotation: [0, -2, 0], scale: [8.7, 8.6, 8.7] },
  },
  // Coqueiros (GLB otimizado 161MB→6.3MB). Oásis ao redor do lago central (25,25). O Pedro
  // colocou coqueiros na água no localhost (não vai pro Vercel) e deu carta branca pra eu
  // fixar — posições minhas, ajustáveis no Editor. Base no chão com POS.y=8 (escala 4),
  // colisão 'none' (decorativo, não escalável). Se flutuar/afundar, ajustar o Y no painel.
  {
    id: 'baked-palms-01', name: 'Coqueiros 1', assetUrl: '/models/map/desert-palm-cluster.glb',
    source: 'editor', selectable: true, visible: true, collide: 'none',
    transform: { position: [45, 8, 30], rotation: [0, 0.4, 0], scale: [4, 4, 4] },
  },
  {
    id: 'baked-palms-02', name: 'Coqueiros 2', assetUrl: '/models/map/desert-palm-cluster.glb',
    source: 'editor', selectable: true, visible: true, collide: 'none',
    transform: { position: [20, 8, 52], rotation: [0, 2.1, 0], scale: [4, 4, 4] },
  },
  {
    id: 'baked-palms-03', name: 'Coqueiros 3', assetUrl: '/models/map/desert-palm-cluster.glb',
    source: 'editor', selectable: true, visible: true, collide: 'none',
    transform: { position: [48, 8, 8], rotation: [0, -1.2, 0], scale: [4, 4, 4] },
  },
];
