/**
 * Aba "Salas" (lobby): lista as partidas ABERTAS (tabela `game_rooms`, heartbeat recente) e
 * deixa entrar por clique — sem precisar do link. Reaproveita o `MultiplayerPanel` embaixo pra
 * CRIAR sala / copiar link / sair. Só com Supabase (MP_ENABLED); no solo mostra um aviso.
 */
import { useEffect, useState } from 'react';
import { RefreshCw, Users } from 'lucide-react';
import { adminCloseRoom, isRoomAdmin, listRooms, useNet, MAX_ROOMS, MP_ENABLED, type RoomInfo } from '@/net/multiplayer';
import { MultiplayerPanel } from './multiplayer-panel';

export function RoomsPanel() {
  const [rooms, setRooms] = useState<RoomInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const room = useNet((s) => s.room);
  const join = useNet((s) => s.join);
  const notice = useNet((s) => s.notice);
  // ADMIN (04/11, Pedro: "eu na conta phpg69@gmail.com sou adm, posso fechar as salas"): botão Fechar em cada sala
  const [admin, setAdmin] = useState(false);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  const refresh = async () => {
    if (!MP_ENABLED) return;
    setLoading(true);
    try { setRooms(await listRooms()); } finally { setLoading(false); }
  };

  useEffect(() => {
    if (!MP_ENABLED) return;
    void isRoomAdmin().then(setAdmin);
    void refresh();
    const t = setInterval(() => { void refresh(); }, 5000); // atualiza sozinho
    return () => clearInterval(t);
  }, []);

  if (!MP_ENABLED) {
    return <p className="panel-message" role="status">Multiplayer desligado (sem Supabase configurado). O jogo roda solo normalmente.</p>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div className="footer-label"><Users />PARTIDAS ABERTAS</div>
        <button onClick={() => void refresh()} title="Atualizar" aria-label="Atualizar"
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--muted-foreground)', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', fontSize: 12 }}>
          <RefreshCw size={13} /> {loading ? '…' : 'Atualizar'}
        </button>
      </div>

      {notice && <p role="status" style={{ margin: 0, fontSize: 13, color: '#ffb48f' }}>{notice}</p>}
      {admin && <p style={{ margin: 0, fontSize: 12, opacity: 0.75 }}>Administrador · {rooms.length}/{MAX_ROOMS} salas{adminMsg ? ` · ${adminMsg}` : ''}</p>}
      {rooms.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 13, margin: '4px 0' }}>
          Nenhuma sala aberta no momento. Crie uma abaixo e compartilhe — ela aparece aqui pros outros.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rooms.map((r) => {
            const full = r.players >= r.max;
            const mine = r.code === room;
            return (
              <div key={r.code} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontWeight: 700, letterSpacing: 1 }}>{r.live ? '🌐' : '⏸️'} {r.code}</span>
                  {r.live
                    ? <span style={{ fontSize: 12, color: full ? '#ff8f8f' : 'var(--muted-foreground)' }}>{r.players}/{r.max}{full ? ' (cheia)' : ''}</span>
                    : <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>pausada · retoma de onde parou</span>}
                </div>
                <button disabled={mine || full} onClick={() => join(r.code)} style={{
                  padding: '5px 14px', borderRadius: 8, border: 'none', cursor: mine || full ? 'default' : 'pointer',
                  fontWeight: 700, fontSize: 13, opacity: mine || full ? 0.5 : 1,
                  background: mine ? 'rgba(255,255,255,0.1)' : '#f2c879', color: mine ? '#e8eef6' : '#1a1206',
                }}>{mine ? 'Você está aqui' : r.live ? 'Entrar' : 'Retomar'}</button>
                {admin && (
                  <button title={`Fechar a sala ${r.code} (quem estiver nela sai)`} aria-label={`Fechar a sala ${r.code}`}
                    onClick={async () => { const err = await adminCloseRoom(r.code); setAdminMsg(err ? `não fechou: ${err}` : `${r.code} fechada`); void refresh(); }}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #ff8f8f', background: 'transparent', color: '#ff8f8f', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>
                    Fechar
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
        <div className="footer-label" style={{ marginBottom: 8 }}>SUA SALA</div>
        <MultiplayerPanel placement="sidebar" />
      </div>
    </div>
  );
}
