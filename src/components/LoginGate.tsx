/**
 * Tela de LOGIN na frente do jogo (Pedro): quando o Supabase está configurado, o jogo fica
 * TRAVADO atrás deste overlay até o jogador entrar/criar conta. Só NOME + senha, sem
 * confirmação de email. Sem Supabase (dev local) o overlay não aparece — jogo solo normal.
 *
 * Ao logar, o nome do sobrevivente vai pro player da store (aparece no HUD/ranking).
 */
import { useEffect, useState } from 'react';
import { AUTH_ENABLED, survivorName, useAuth } from '@/net/auth';
import { useGameStore } from '@/game/state/game-store';

export function LoginGate() {
  const ready = useAuth((s) => s.ready);
  const user = useAuth((s) => s.user);
  const busy = useAuth((s) => s.busy);
  const error = useAuth((s) => s.error);
  const init = useAuth((s) => s.init);
  const signIn = useAuth((s) => s.signIn);
  const signUp = useAuth((s) => s.signUp);

  const [name, setName] = useState('');
  const [pass, setPass] = useState('');

  useEffect(() => { init(); }, [init]);

  // Ao autenticar, leva o nome do sobrevivente pro player (HUD/ranking).
  useEffect(() => {
    const n = survivorName(user);
    if (n) useGameStore.setState((s) => (s.player.name === n ? s : { player: { ...s.player, name: n } }));
  }, [user]);

  if (!AUTH_ENABLED || user) return null;        // offline ou já logado → sem tela
  if (!ready) return <Screen>Carregando…</Screen>; // checando sessão

  const canSubmit = name.trim().length >= 2 && pass.length >= 6 && !busy;
  const submit = (fn: (n: string, p: string) => void) => { if (canSubmit) fn(name, pass); };

  return (
    <Screen>
      <div style={{
        width: 'min(92vw, 360px)', background: 'rgba(14,18,26,0.96)', border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', color: '#e8eef6',
        font: '14px/1.4 system-ui', display: 'flex', flexDirection: 'column', gap: 12,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ font: '800 22px system-ui', letterSpacing: 2, color: '#f2c879' }}>TRIBOS</div>
          <div style={{ opacity: 0.75, fontSize: 12, marginTop: 2 }}>Entre com seu nome de sobrevivente</div>
        </div>
        <label style={lbl}>Nome do sobrevivente
          <input style={inp} value={name} maxLength={24} autoFocus placeholder="Ex.: Kael"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(signIn); }} />
        </label>
        <label style={lbl}>Senha
          <input style={inp} type="password" value={pass} placeholder="mínimo 6 caracteres"
            onChange={(e) => setPass(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(signIn); }} />
        </label>
        {error && <div style={{ color: '#ff8f8f', fontSize: 12.5 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button style={{ ...btn, background: '#f2c879', color: '#1a1206', flex: 1 }}
            disabled={!canSubmit} onClick={() => submit(signIn)}>{busy ? '…' : 'Entrar'}</button>
          <button style={{ ...btn, background: 'rgba(255,255,255,0.1)', color: '#e8eef6', flex: 1 }}
            disabled={!canSubmit} onClick={() => submit(signUp)}>Criar conta</button>
        </div>
        <div style={{ opacity: 0.55, fontSize: 11, textAlign: 'center' }}>Seu progresso fica salvo na sua conta.</div>
      </div>
    </Screen>
  );
}

function Screen({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000, display: 'grid', placeItems: 'center',
      background: 'radial-gradient(1200px 600px at 50% -10%, rgba(60,40,15,0.5), rgba(6,8,12,0.96))',
      backdropFilter: 'blur(3px)', color: '#e8eef6', font: '14px system-ui',
    }}>{children}</div>
  );
}

const lbl: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, opacity: 0.9 };
const inp: React.CSSProperties = {
  padding: '9px 11px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.16)',
  background: 'rgba(0,0,0,0.3)', color: '#fff', font: '14px system-ui', outline: 'none',
};
const btn: React.CSSProperties = {
  padding: '10px 12px', borderRadius: 9, border: 'none', cursor: 'pointer', font: '700 14px system-ui',
};
