/**
 * BARRA DO CHEFE NA TELA (04/11, Pedro: "no Kraken do oceano e no outro boss Canibal, ambos têm barra de vida? vi no
 * tentáculo do Kraken, mas depois quando ele solta não vi"). Em cima, no meio: nome, o que falta (tentáculos ou o corpo)
 * e a vida. Quem escreve é o chefe (`useZsBossBar`, só quando muda); some quando ele dorme/afunda/morre ou você se afasta.
 */
import { useZsBossBar } from './zs-context';

export function ZsBossBarHud() {
  const bar = useZsBossBar((s) => s.bar);
  if (!bar) return null;
  const pct = Math.max(0, Math.min(100, bar.frac * 100));
  return (
    <div className="zs-boss-bar" role="status" aria-label={`${bar.name}: ${Math.round(pct)}% de vida (${bar.sub})`}>
      <div className="zs-boss-bar__head"><strong>{bar.name}</strong><small>{bar.sub}</small></div>
      <div className="zs-boss-bar__track"><div className="zs-boss-bar__fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}
