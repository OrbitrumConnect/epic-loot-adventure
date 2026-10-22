import { Move3d, Rotate3d, Scaling, Save, Undo2, Redo2, Trash2, X, Search } from 'lucide-react';
import { EDITOR_ASSETS, useEditorStore, type Transform } from './editor-store';
import { terrainHeight } from '../world/world-kit';
import { useState } from 'react';

export function EditorPanel() {
  const s = useEditorStore();
  const [query, setQuery] = useState('');
  const selected = s.objects.find(o => o.id === s.selectedId) ?? null;
  const mapObjects = s.objects.filter(o => o.source === 'map' && `${o.name} ${o.id}`.toLowerCase().includes(query.toLowerCase()));
  const placed = s.objects.filter(o => o.source !== 'map');
  const suspicious = s.objects.filter(o => {
    const t = o.transform;
    return t.position.some(v => !Number.isFinite(v) || Math.abs(v) > 400) || t.scale.some(v => !Number.isFinite(v) || v > 120 || v < .02);
  });
  const setAxis = (kind: keyof Transform, axis: number, raw: string) => {
    if (!selected) return;
    const value = Number(raw); if (!Number.isFinite(value)) return;
    const vector = [...selected.transform[kind]] as [number, number, number];
    // Decimais livres (como Max/Blender): escala nunca <=0 (evita sumir/inverter).
    vector[axis] = kind === 'scale' ? Math.max(0.01, value) : value;
    s.update(selected.id, { ...selected.transform, [kind]: vector });
  };
  return <aside className="editor-panel">
    {suspicious.length > 0 && <section className="editor-warning"><label>Objetos suspeitos ({suspicious.length})</label>{suspicious.map(o => <button key={o.id} onClick={() => s.select(o.id)}>⚠ {o.name}<small>{o.id} · escala {o.transform.scale.map(v => v.toFixed(1)).join(' / ')}</small></button>)}</section>}
    <header><b>EDITOR ADM</b><small>LOCAL · não publicado</small><button onClick={() => s.setActive(false)}><X /></button></header>
    <div className="editor-tools">{([['translate', Move3d], ['rotate', Rotate3d], ['scale', Scaling]] as const).map(([tool, Icon]) => <button key={tool} data-active={s.tool === tool} onClick={() => s.setTool(tool)}><Icon /></button>)}</div>
    <section><label>Hierarquia do mapa</label><div className="editor-search"><Search /><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Buscar objeto ou ID..." /></div><div className="editor-list">{mapObjects.map(o => <button key={o.id} data-active={s.selectedId === o.id} onClick={() => s.select(o.id)}>◈ {o.name}<small>{o.id}{!o.selectable && ' · em breve'}</small></button>)}{mapObjects.length === 0 && <p>Nenhum objeto encontrado.</p>}</div></section>
    <section><label>Colocados ({placed.length})</label>{placed.map(o => <button key={o.id} data-active={s.selectedId === o.id} onClick={() => s.select(o.id)}>▣ {o.name}<small>escala {o.transform.scale.map(v => v.toFixed(1)).join(' / ')}</small></button>)}{placed.length === 0 && <p>Adicione pela Biblioteca GLB abaixo.</p>}</section>
    <section><label>Biblioteca GLB</label><div className="editor-list">{EDITOR_ASSETS.map(asset => <button key={asset.assetUrl} onClick={() => s.add(asset)}>+ {asset.name}</button>)}</div></section>
    <section><label>Publicar pra todos</label><button onClick={() => { const objs = s.objects.filter(o => o.source !== 'map'); const json = JSON.stringify(objs); void navigator.clipboard?.writeText(json).then(() => useEditorStore.setState({ saveNotice: `Layout copiado (${objs.length} objetos) — cole pro Claude publicar.` }), () => useEditorStore.setState({ saveNotice: 'Não deu pra copiar: use F12 → copy(localStorage.getItem("tribos.editor.local.v1"))' })); }}>📋 Copiar layout (pra publicar no jogo)</button></section>
    <section><label>Seleção</label>{selected ? <>{(['position', 'rotation', 'scale'] as const).map(kind => <div className="editor-transform" key={kind}><span>{kind}</span>{[0,1,2].map(axis => <input key={axis} type="number" step=".1" value={selected.transform[kind][axis]} onChange={e => setAxis(kind, axis, e.target.value)} />)}</div>)}<div className="editor-transform"><span>colisão</span>{(['none', 'floor', 'block'] as const).map(mode => <button key={mode} data-active={(selected.collide ?? 'none') === mode} onClick={() => s.setCollide(selected.id, mode)}>{mode === 'none' ? 'nenhuma' : mode === 'floor' ? 'chão' : 'bloquear'}</button>)}</div><button onClick={() => { if (!selected) return; const [x, , z] = selected.transform.position; s.update(selected.id, { ...selected.transform, position: [x, terrainHeight(x, z), z] }); }}>⬇ Snap ao chão</button><button onClick={s.remove}><Trash2 /> Excluir</button></> : <p>Adicione e selecione um objeto.</p>}</section>
    <footer><button onClick={s.undo} disabled={!s.undoStack.length}><Undo2 /></button><button onClick={s.redo} disabled={!s.redoStack.length}><Redo2 /></button><button onClick={s.cancel}>Cancelar</button><button onClick={s.saveLocal}><Save /> Salvar local</button></footer>{s.saveNotice && <div className="editor-save-notice">{s.saveNotice}</div>}
  </aside>;
}
