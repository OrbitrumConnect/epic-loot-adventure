/**
 * Card "Aliado ou Inimigo" (fatia 1 do PvP). Aparece quando você ENTRA numa sala por
 * link/código (convidado) e ainda não declarou a postura. O host entra como aliado e não vê o
 * card. A escolha vai pro `selfSide` (viaja na pose), e os outros te renderizam com a cor certa.
 *
 * Só com Supabase configurado (MP_ENABLED). No solo nunca aparece (zero regressão).
 */
import { MP_ENABLED, useNet } from '@/net/multiplayer';

export function PvpGate() {
  const connected = useNet((s) => s.connected);
  const sideChosen = useNet((s) => s.sideChosen);
  const setSide = useNet((s) => s.setSide);

  if (!MP_ENABLED || !connected || sideChosen) return null;

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 900, display: 'grid', placeItems: 'center',
      background: 'rgba(6,8,12,0.72)', backdropFilter: 'blur(3px)', font: '14px system-ui', color: '#e8eef6',
    }}>
      <div style={{
        width: 'min(92vw, 380px)', background: 'rgba(14,18,26,0.97)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', textAlign: 'center',
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>
        <div>
          <div style={{ font: '800 20px system-ui', letterSpacing: 1, color: '#f2c879' }}>Você entrou na partida</div>
          <div style={{ opacity: 0.78, fontSize: 13, marginTop: 4 }}>Como quer jogar com quem está aqui?</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setSide('ally')} style={{
            flex: 1, padding: '14px 10px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(85,201,121,0.5)',
            background: 'rgba(85,201,121,0.16)', color: '#9be6b4', font: '700 15px system-ui',
          }}>🤝 Aliado</button>
          <button onClick={() => setSide('enemy')} style={{
            flex: 1, padding: '14px 10px', borderRadius: 10, cursor: 'pointer', border: '1px solid rgba(239,68,68,0.5)',
            background: 'rgba(239,68,68,0.16)', color: '#ff9b9b', font: '700 15px system-ui',
          }}>⚔️ Inimigo</button>
        </div>
        <div style={{ opacity: 0.5, fontSize: 11 }}>Aliado: joga junto. Inimigo: PvP (fogo amigo em breve).</div>
      </div>
    </div>
  );
}
