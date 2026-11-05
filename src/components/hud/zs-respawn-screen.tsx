import { useEffect, useState } from 'react';
import { Skull } from 'lucide-react';
import { ZS_TERRAIN } from '@/components/zona-sul/zona-sul-meta';
import { zsWorldToPct } from '@/components/hud/zs-map';
import { zsMapArtUrl } from '@/components/hud/zs-map-art';
import {
  defaultSpawn, deathStage, resolveSpawn, RESPAWN, SPAWN_ICON, SPAWN_LABEL, spawnNudge, stageSecondsLeft, useZsRespawn, type SpawnKind,
} from '@/components/zona-sul/zs-respawn';

/**
 * TELA DA MORTE da Zona Sul (05/11, Pedro: "morreu: aparece a mensagem, dura 6 s; depois aparece o mapa e aí tem os 6 s
 * restantes vendo aonde quer nascer; passou os 12 no total, ele nasce onde escolheu"). Regras em zona-sul/zs-respawn.ts;
 * quem faz nascer é o mundo (zona-sul-world), aos 12 s, no ponto escolhido (sem escolher: base, senão praia).
 *  - 0–6 s: "Você morreu!" + quem matou + "o mapa abre em Ns" (não clica — o jogo segue atrás).
 *  - 6–12 s: o MAPA da Zona Sul com os pontos (base / navio / carro / praia); os que não servem agora aparecem apagados
 *    com o porquê (afundou, em combate, volta em 2:10…). Clique no ponto ou no botão embaixo (celular).
 */
export function ZsRespawnScreen({ deathBy }: { deathBy: { name: string; pvp: boolean } | null | undefined }) {
  const deathAt = useZsRespawn((s) => s.deathAt), choice = useZsRespawn((s) => s.choice);
  const points = useZsRespawn((s) => s.points), diedAt = useZsRespawn((s) => s.diedAt);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const id = window.setInterval(() => setNow(Date.now()), 200); return () => window.clearInterval(id); }, []);
  // o MAPA DESENHADO (o terrain.png cru é dado — verde-neon): começa a pintar já na mensagem, fica pronto antes dos 6 s
  const [art, setArt] = useState<string | null>(null);
  useEffect(() => { let on = true; zsMapArtUrl().then((u) => { if (on) setArt(u); }).catch(() => { /* sem mapa desenhado: fundo escuro */ }); return () => { on = false; }; }, []);
  // o mundo ainda não registrou a morte (1º quadro): conta do agora
  const at = deathAt || now, stage = deathStage(at, now), left = stageSecondsLeft(at, now);
  const pick = (k: SpawnKind) => useZsRespawn.setState({ choice: k });

  if (stage === 'msg') {
    return (
      <div className="zs-death" data-stage="msg">
        <Skull className="zs-death-skull" />
        <h2 className="zs-death-title">Você morreu!</h2>
        {/* Quem te matou (Pedro, 22/10): outro jogador em destaque; bicho em texto simples. */}
        {deathBy && (
          <p className="zs-death-by" data-pvp={deathBy.pvp || undefined}>
            {deathBy.pvp ? '⚔️ ' : ''}<span>{deathBy.name}</span> te matou
          </p>
        )}
        <p className="zs-death-count">O mapa abre em <strong>{left}s</strong> — escolha onde nascer</p>
      </div>
    );
  }

  const target = points.length ? resolveSpawn(points, choice) : null;
  const def = points.length ? defaultSpawn(points) : 'beach';
  const nudge = spawnNudge(points);
  return (
    <div className="zs-death" data-stage="map">
      <div className="zs-respawn">
        <div className="zs-respawn-head">
          <h2>Escolha onde nascer</h2>
          <p>Nascendo em <strong>{left}s</strong>{target ? <> · {SPAWN_ICON[target.kind]} {SPAWN_LABEL[target.kind]}</> : null}</p>
        </div>
        <div className="zs-respawn-mapbox">
        {/* a caixa na proporção do terreno (560×523) — os pontos em % batem com o desenho */}
        <div className="zs-map zs-respawn-map" style={{ ['--ar' as string]: String(ZS_TERRAIN.w / ZS_TERRAIN.h) }} role="group" aria-label="Mapa da Zona Sul: escolha onde nascer">
          {art && <img className="zs-map-bg" src={art} alt="" draggable={false} />}
          {diedAt && (() => { const { left: l, top } = zsWorldToPct(diedAt.x, diedAt.z); return <div className="zs-respawn-died" style={{ left: `${l}%`, top: `${top}%` }} title="Onde você morreu" aria-label="Onde você morreu">✖</div>; })()}
          {points.map((pt, k) => {
            const { left: l, top } = zsWorldToPct(pt.x, pt.z), on = target?.kind === pt.kind, nk = nudge[k] ?? 0;
            const txt = `${SPAWN_LABEL[pt.kind]}${pt.ok ? '' : ` — ${pt.why}`}`;
            return (
              <button key={pt.kind} type="button" className="zs-respawn-pt" data-ok={pt.ok || undefined} data-on={on || undefined}
                style={{ left: `${l}%`, top: `${top}%`, ['--nx' as string]: `${nk === 0 ? 0 : (nk % 2 ? 1 : -1) * Math.ceil(nk / 2) * 36}px` }} data-up={nk > 0 || undefined} disabled={!pt.ok} title={txt} aria-label={txt} aria-pressed={on} onClick={() => pick(pt.kind)}>
                <span aria-hidden="true">{SPAWN_ICON[pt.kind]}</span>
                <b>{SPAWN_LABEL[pt.kind]}</b>
              </button>
            );
          })}
        </div>
        </div>
        <div className="zs-respawn-list">
          {points.map((pt) => {
            const on = target?.kind === pt.kind;
            return (
              <button key={pt.kind} type="button" className="zs-respawn-opt" data-on={on || undefined} disabled={!pt.ok} aria-pressed={on} onClick={() => pick(pt.kind)}>
                <span aria-hidden="true">{SPAWN_ICON[pt.kind]}</span>
                <strong>{SPAWN_LABEL[pt.kind]}</strong>
                <small>{pt.ok ? (pt.kind === def && !choice ? 'padrão' : pt.kind === 'ship' || pt.kind === 'car' ? `espera ${RESPAWN.VEH_CD_MS / 60_000} min depois` : pt.kind === 'cave' ? 'começo do caminho' : 'disponível') : pt.why}</small>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
