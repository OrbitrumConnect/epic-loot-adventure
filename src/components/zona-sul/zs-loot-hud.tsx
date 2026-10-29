/**
 * ZONA SUL — HOTBAR embaixo (1–9 e 0, como no jogo) + INVENTÁRIO (tecla I) com o MESMO loot do jogo (cópia de leitura,
 * ver zs-loot.ts) e a PRANCHA de surf. Clicar num item no inventário = pôr no espaço selecionado do hotbar.
 * Selecionar a prancha no hotbar = surfar na água (zsGear.board).
 */
import { useEffect, useState } from 'react';
import { ItemSprite } from '@/components/hud/item-sprite';
import { useGameStore } from '@/game/state/game-store';
import { readZsLoot, zsAssignHotbar, ZS_BOARD_ID, ZS_HOTBAR_SIZE, zsItemName, type ZsLoot, zsSelectedItem } from './zs-loot';

/** O que o herói tem na mão na Zona Sul (lido pelo Hero a cada quadro). */
export const zsGear = { board: false };

function BoardIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <g transform="rotate(-35 12 12)">
        <ellipse cx="12" cy="12" rx="3.6" ry="10.5" fill="#f4efe2" stroke="#1b4c63" strokeWidth="1.2" />
        <line x1="12" y1="2.2" x2="12" y2="21.8" stroke="#e0672f" strokeWidth="1.1" />
        <path d="M10.6 19.5 L12 22.3 L13.4 19.5 Z" fill="#1b4c63" />
      </g>
    </svg>
  );
}
function Sprite({ id, size }: { id: string | null; size: number }) {
  if (id === ZS_BOARD_ID) return <BoardIcon size={size} />;
  return <ItemSprite itemId={id} size={size} />;
}

const slotStyle = (active: boolean): React.CSSProperties => ({
  width: 46, height: 46, borderRadius: 8, display: 'grid', placeItems: 'center', position: 'relative', cursor: 'pointer',
  background: active ? 'rgba(255,214,120,.28)' : 'rgba(10,22,32,.62)', border: `2px solid ${active ? '#ffd27a' : 'rgba(255,255,255,.18)'}`,
  boxShadow: active ? '0 0 10px rgba(255,210,122,.55)' : 'none', padding: 0,
});

export function ZsLootHud() {
  const [loot, setLoot] = useState<ZsLoot>(() => readZsLoot(typeof window === 'undefined' ? null : safeStorage(), useGameStore.getState().player.inventory));
  const [sel, setSel] = useState(0);
  const [open, setOpen] = useState(false);
  const held = zsSelectedItem(loot, sel);
  useEffect(() => { zsGear.board = held === ZS_BOARD_ID; }, [held]);
  useEffect(() => () => { zsGear.board = false; }, []);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (/^Digit[0-9]$/.test(e.code)) { const n = Number(e.code.slice(5)); setSel(n === 0 ? 9 : n - 1); }
      if (e.code === 'KeyI') setOpen((o) => !o);
      if (e.code === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  return (
    <>
      {/* HOTBAR embaixo */}
      <div style={{ position: 'absolute', left: '50%', bottom: 26, transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, pointerEvents: 'none', maxWidth: 'calc(100% - 16px)' }}>
        <div style={{ font: '600 12px system-ui', color: '#fff', textShadow: '0 1px 2px #000', background: 'rgba(10,22,32,.5)', padding: '2px 8px', borderRadius: 6 }}>
          {zsItemName(held)}{held === ZS_BOARD_ID ? ' · na água: rema · Espaço levanta quando a onda pegar' : ''} <span style={{ opacity: 0.7 }}>· I inventário</span>
        </div>
        <div style={{ display: 'flex', gap: 4, pointerEvents: 'auto', flexWrap: 'wrap', justifyContent: 'center' }} aria-label="Hotbar">
          {Array.from({ length: ZS_HOTBAR_SIZE }, (_, i) => {
            const id = zsSelectedItem(loot, i);
            return (
              <button key={i} type="button" style={slotStyle(i === sel)} title={zsItemName(id)} aria-label={`Espaço ${i === 9 ? 0 : i + 1}: ${zsItemName(id)}`} onClick={() => setSel(i)}>
                {id ? <Sprite id={id} size={34} /> : null}
                <span style={{ position: 'absolute', left: 3, top: 1, font: '700 10px system-ui', color: '#fff', textShadow: '0 1px 2px #000' }}>{i === 9 ? 0 : i + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* INVENTÁRIO (I) */}
      {open && (
        <div role="dialog" aria-label="Inventário" style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 'min(560px, calc(100% - 24px))', maxHeight: 'calc(100% - 140px)', overflow: 'auto', background: 'rgba(12,24,34,.92)', color: '#eef4f8', borderRadius: 12, padding: 14, boxShadow: '0 10px 40px rgba(0,0,0,.45)', font: '400 13px system-ui' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
            <strong style={{ fontSize: 16 }}>Inventário</strong>
            <button type="button" onClick={() => setOpen(false)} style={{ background: 'none', border: 0, color: '#eef4f8', font: '700 18px system-ui', cursor: 'pointer' }} aria-label="Fechar">×</button>
          </div>
          <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 10 }}>
            Clique num item pra pôr no espaço <b>{sel === 9 ? 0 : sel + 1}</b> do hotbar. Mesmo loot do jogo (só leitura aqui — o save do jogo não é mexido) + a prancha de surf.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))', gap: 6 }}>
            {loot.slots.map((s, i) => (
              <button key={i} type="button" title={zsItemName(s.itemId)} onClick={() => setLoot((l) => zsAssignHotbar(l, sel, i))}
                style={{ ...slotStyle(loot.hotbar[sel] === i), width: '100%', height: 64 }}>
                <Sprite id={s.itemId} size={38} />
                {s.quantity > 1 && <span style={{ position: 'absolute', right: 4, bottom: 2, font: '700 11px system-ui', color: '#fff', textShadow: '0 1px 2px #000' }}>{s.quantity}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

function safeStorage(): Storage | null { try { return window.localStorage; } catch { return null; } }
