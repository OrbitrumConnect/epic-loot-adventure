import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { setWorldMap } from '@/components/world/world-map-choice';

/** /zona-sul (link antigo, 29/10): a Zona Sul agora é um MAPA DO JOGO — este endereço escolhe ela e abre o jogo. */
function ZonaSulPage() {
  const navigate = useNavigate();
  useEffect(() => { setWorldMap('zona-sul'); void navigate({ to: '/', replace: true }); }, [navigate]);
  return <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', font: '600 18px system-ui' }}>Abrindo a Zona Sul…</div>;
}

export const Route = createFileRoute('/zona-sul')({ component: ZonaSulPage });
