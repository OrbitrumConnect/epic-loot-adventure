import { create } from 'zustand';
import { BAKED_EDITOR_OBJECTS } from './baked-layout';

export type EditorTool = 'translate' | 'rotate' | 'scale';
export type Transform = { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] };
/** Colisão do objeto colocado: nenhuma (decorativo, atravessa), chão (anda EM CIMA,
 *  ex. ponte) ou bloquear (barra horizontal, ex. parede/pedra). Default: nenhuma —
 *  assim prop decorativo (palmeira) não vira "escada". */
export type EditorCollide = 'none' | 'floor' | 'block';
export type EditorObject = { id: string; name: string; assetUrl: string; transform: Transform; visible: boolean; source?: 'editor' | 'map'; selectable?: boolean; collide?: EditorCollide; ground?: boolean };
export const EDITOR_ASSETS = [
  { name: 'Árvore rachada', assetUrl: '/models/trees/tree-split.glb', scale: 4 },
  { name: 'Árvore ancestral', assetUrl: '/models/trees/tree-gnarled.glb', scale: 5 },
  { name: 'Torre de vigia', assetUrl: '/models/watchtower/watchtower.glb', scale: 1 },
  { name: 'Labirinto', assetUrl: '/models/props/maze.glb', scale: 14 },
  { name: 'Montanha oeste', assetUrl: '/models/terrain/mountain.glb', scale: 1 },
  { name: 'Montanha caverna', assetUrl: '/models/terrain/mountain-cave.glb', scale: 1 },
  // Novos assets de mapa (Meshy). De-shine aplicado no PlacedObject p/ assets /models/map/.
  // 6 entradas removidas (rio-wasteland-master, desert-palm-cluster, savannah-grass-sparse/low,
  // metal-house, palm-farm): apontavam p/ arquivo que NÃO existe em public/models/map/ (404 no
  // FileLoader) e não há substituto em disco. Removidas em vez de deixadas quebradas no catálogo
  // do Editor ADM. A ponte (wasteland-scrap-bridge) foi restaurada: o Pedro trouxe o GLB (otimizado,
  // 1,6 MB) no upstream/main, então a entrada voltou a apontar para arquivo existente.
  { name: 'Rio devastado (icônico)', assetUrl: '/models/map/rio-wasteland-iconic.glb', scale: 20 },
  { name: 'Ponte de sucata', assetUrl: '/models/map/wasteland-scrap-bridge.glb', scale: 8 },
  // stone-house: arquivo real vive em /models/house/ (confirmado com test -f), não /models/map/.
  { name: 'Casa de pedra', assetUrl: '/models/house/stone-house.glb', scale: 6 },
  // Favelas (Pedro, 22/10): 2 conjuntos Meshy otimizados (499 mil→40 mil e 50 mil→25 mil triângulos,
  // textura 1024). Modelo ~1 m de lado → escala 40 ≈ 40 m de quarteirão (ajustável no gizmo).
  { name: 'Favela A (casinhas densas)', assetUrl: '/models/map/favela-a.glb', scale: 40 },
  { name: 'Favela B (rua e pracinha)', assetUrl: '/models/map/favela-b.glb', scale: 40 },
] as const;
const KEY = 'tribos.editor.local.v1';
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const mapCatalog: EditorObject[] = [
  { id: 'map-tree-gnarled-01', name: 'Árvore ancestral 01', assetUrl: '/models/trees/tree-gnarled.glb', source: 'map', selectable: true, visible: true, transform: { position: [11, 0, -22], rotation: [0, 0, 0], scale: [6, 6, 6] } },
  { id: 'map-tree-gnarled-02', name: 'Árvore ancestral 02', assetUrl: '/models/trees/tree-gnarled.glb', source: 'map', selectable: true, visible: true, transform: { position: [-18, 0, -10], rotation: [0, .8, 0], scale: [5.5, 5.5, 5.5] } },
  { id: 'map-tree-gnarled-03', name: 'Árvore ancestral 03', assetUrl: '/models/trees/tree-gnarled.glb', source: 'map', selectable: true, visible: true, transform: { position: [34, 0, -48], rotation: [0, 2.1, 0], scale: [6.5, 6.5, 6.5] } },
  { id: 'map-tree-gnarled-04', name: 'Árvore ancestral 04', assetUrl: '/models/trees/tree-gnarled.glb', source: 'map', selectable: true, visible: true, transform: { position: [-32, 0, -42], rotation: [0, 1.3, 0], scale: [5, 5, 5] } },
  { id: 'map-tree-gnarled-05', name: 'Árvore ancestral 05', assetUrl: '/models/trees/tree-gnarled.glb', source: 'map', selectable: true, visible: true, transform: { position: [42, 0, 8], rotation: [0, 3, 0], scale: [6, 6, 6] } },
  { id: 'map-tree-gnarled-06', name: 'Árvore ancestral 06', assetUrl: '/models/trees/tree-gnarled.glb', source: 'map', selectable: true, visible: true, transform: { position: [-40, 0, 24], rotation: [0, .4, 0], scale: [5.5, 5.5, 5.5] } },
  { id: 'map-desert-plain-01', name: 'Planície desértica', assetUrl: '/models/terrain/desert-plain.glb', source: 'map', selectable: false, visible: true, transform: { position: [0, -1, 36], rotation: [0, 0, 0], scale: [206, 206, 206] } },
  { id: 'map-maze-01', name: 'Labirinto norte', assetUrl: 'procedural:maze', source: 'map', selectable: false, visible: true, transform: { position: [-8, 0, 56], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  { id: 'map-factory-01', name: 'Fábrica principal', assetUrl: 'component:factory', source: 'map', selectable: false, visible: true, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
  { id: 'map-containers-01', name: 'Containers do cenário', assetUrl: 'component:glb-containers', source: 'map', selectable: false, visible: true, transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
];
const initial = (): EditorObject[] => {
  if (typeof window === 'undefined') return [];
  try { const raw = window.localStorage.getItem(KEY); return raw ? JSON.parse(raw) as EditorObject[] : []; } catch { return []; }
};
const id = () => typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `editor-${Date.now()}-${Math.random()}`;
type State = {
  active: boolean; tool: EditorTool; selectedId: string | null; objects: EditorObject[]; saved: EditorObject[]; undoStack: EditorObject[][]; redoStack: EditorObject[][]; saveNotice: string;
  setActive(active: boolean): void; setTool(tool: EditorTool): void; select(id: string | null): void; add(asset: typeof EDITOR_ASSETS[number]): void;
  commit(next: EditorObject[]): void; update(id: string, transform: Transform): void; setCollide(id: string, collide: EditorCollide): void; remove(): void; undo(): void; redo(): void; cancel(): void; saveLocal(): void;
};
// Baked (layout publicado no código) como BASE; o localStorage do usuário tem prioridade
// por id → aparece no Vercel pra todos, e quem edita continua vendo suas mudanças.
const stored = initial();
const saved: EditorObject[] = [...BAKED_EDITOR_OBJECTS.filter(b => !stored.some(s => s.id === b.id)), ...stored];
const mergeCatalog = (stored: EditorObject[]) => {
  const byId = new Map(stored.map(o => [o.id, o]));
  const merged = mapCatalog.map(o => {
    const saved = byId.get(o.id);
    if (!saved) return o;
    // Recupera montanhas que foram salvas fora do mapa/altitude por um arraste
    // acidental. Mantém a edição normal quando a transformação é plausível.
    if (o.id === 'map-mountain-01' || o.id === 'map-mountain-02') {
      const [x, y, z] = saved.transform.position;
      if (![x, y, z].every(Number.isFinite) || Math.abs(x) > 300 || Math.abs(z) > 300 || Math.abs(y) > 20) return o;
    }
    return saved;
  });
  return [...merged, ...stored.filter(o => !mapCatalog.some(c => c.id === o.id) && o.id !== 'map-mountain-01' && o.id !== 'map-mountain-02')];
};
export const useEditorStore = create<State>((set, get) => ({
  active: false, tool: 'translate', selectedId: null, objects: mergeCatalog(copy(saved)), saved: mergeCatalog(copy(saved)), undoStack: [], redoStack: [], saveNotice: '',
  setActive: active => set({ active, selectedId: active ? get().selectedId : null }), setTool: tool => set({ tool }), select: selectedId => set({ selectedId }),
  commit: next => set(s => ({ objects: copy(next), undoStack: [...s.undoStack, copy(s.objects)].slice(-50), redoStack: [] })),
  add: asset => { const s = get(); const n = s.objects.filter(o => o.source !== 'map').length + 1; const o: EditorObject = { id: id(), name: `${asset.name} ${n}`, assetUrl: asset.assetUrl, source: 'editor', visible: true, collide: 'none', transform: { position: [0, 0, 0], rotation: [0, 0, 0], scale: [asset.scale, asset.scale, asset.scale] } }; s.commit([...s.objects, o]); set({ selectedId: o.id }); },
  update: (id, transform) => { const s = get(); s.commit(s.objects.map(o => o.id === id ? { ...o, transform } : o)); },
  setCollide: (id, collide) => { const s = get(); s.commit(s.objects.map(o => o.id === id ? { ...o, collide } : o)); },
  remove: () => { const s = get(); if (!s.selectedId) return; s.commit(s.objects.filter(o => o.id !== s.selectedId)); set({ selectedId: null }); },
  undo: () => set(s => { const prev = s.undoStack.at(-1); return prev ? { objects: copy(prev), undoStack: s.undoStack.slice(0, -1), redoStack: [...s.redoStack, copy(s.objects)] } : s; }),
  redo: () => set(s => { const next = s.redoStack.at(-1); return next ? { objects: copy(next), redoStack: s.redoStack.slice(0, -1), undoStack: [...s.undoStack, copy(s.objects)] } : s; }),
  cancel: () => set(s => ({ objects: copy(s.saved), selectedId: null, undoStack: [], redoStack: [] })),
  saveLocal: () => { const objects = copy(get().objects); try { localStorage.setItem(KEY, JSON.stringify(objects)); console.info('[Editor ADM] Salvo localmente:', { total: objects.length, ids: objects.map(o => o.id) }); set({ saved: objects, undoStack: [], redoStack: [], saveNotice: `Salvo localmente às ${new Date().toLocaleTimeString()}` }); } catch (error) { console.error('[Editor ADM] Falha ao salvar localmente:', error); set({ saveNotice: 'Não foi possível gravar no navegador.' }); } },
}));
export const isEditorActive = () => useEditorStore.getState().active;

