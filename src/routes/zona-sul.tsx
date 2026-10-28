import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

/** Rota ISOLADA /zona-sul — Zona Sul do RJ (relevo real, mata, água). Não toca no mundo do jogo. */
const ZonaSulWorld = lazy(() => import('@/components/zona-sul/zona-sul-world'));

function ZonaSulPage() {
  return (
    <Suspense fallback={<div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', font: '600 18px system-ui' }}>Carregando a Zona Sul…</div>}>
      <ZonaSulWorld />
    </Suspense>
  );
}

export const Route = createFileRoute('/zona-sul')({ component: ZonaSulPage });
