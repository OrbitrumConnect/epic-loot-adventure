import { useEffect, useState } from 'react';
import { useNet, MP_ENABLED, inviteLink, roomFromUrl, MAX_PLAYERS } from '@/net/multiplayer';

/** Painel de sala online (canto). Sem login: cria sala (código) ou entra por
 *  código/link. Mostra quantos estão e o link de convite. Seletores pontuais
 *  (número/bool) → não re-renderiza a cada pose. */
export function MultiplayerPanel({ placement = 'overlay' }: { placement?: 'overlay' | 'sidebar' }) {
  const room = useNet((s) => s.room);
  const connected = useNet((s) => s.connected);
  const full = useNet((s) => s.full);
  const others = useNet((s) => Object.keys(s.players).length);
  const join = useNet((s) => s.join);
  const leave = useNet((s) => s.leave);

  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Auto-entra se o jogo abriu por um link de convite (?room=XXXX).
  useEffect(() => {
    const r = roomFromUrl();
    if (MP_ENABLED && r && !useNet.getState().room) join(r);
  }, [join]);

  if (!MP_ENABLED) return null; // sem Supabase (dev local) → jogo solo, sem painel

  const box: React.CSSProperties = {
    ...(placement === 'overlay' ? { position: 'fixed', top: 10, left: 10, zIndex: 50 } : {}),
    display: 'flex', gap: 6,
    alignItems: 'center', flexWrap: 'wrap', padding: '6px 10px', borderRadius: 10,
    background: 'rgba(12,16,24,0.82)', color: '#e8eef6', font: '600 13px system-ui',
    border: '1px solid rgba(255,255,255,0.12)', backdropFilter: 'blur(4px)',
  };
  const btn: React.CSSProperties = {
    padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)',
    background: 'rgba(255,255,255,0.08)', color: '#e8eef6', cursor: 'pointer', fontWeight: 700,
  };

  if (!room) {
    return (
      <div className={placement === 'sidebar' ? 'multiplayer-sidebar' : undefined} style={box}>
        {placement === 'sidebar' && <small className="multiplayer-sidebar-title">SALAS PÚBLICAS</small>}
        <button style={{ ...btn, background: 'rgba(80,140,255,0.22)' }} onClick={() => join()}>🌐 Criar sala</button>
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="código" maxLength={6}
          style={{ width: 78, padding: '4px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(0,0,0,0.3)', color: '#fff', textTransform: 'uppercase' }} />
        <button style={btn} disabled={!code.trim()} onClick={() => join(code)}>Entrar</button>
      </div>
    );
  }

  return (
    <div className={placement === 'sidebar' ? 'multiplayer-sidebar' : undefined} style={box}>
      {placement === 'sidebar' && <small className="multiplayer-sidebar-title">SALA PÚBLICA</small>}
      <span>🌐 Sala <b>{room}</b> · {connected ? `${others + 1}/${MAX_PLAYERS}` : 'conectando…'}{full ? ' (cheia)' : ''}</span>
      <button style={btn} onClick={() => {
        try { navigator.clipboard?.writeText(inviteLink(room)); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
      }}>{copied ? '✓ link copiado' : 'Copiar link'}</button>
      <button style={btn} onClick={() => leave()}>Sair</button>
    </div>
  );
}
