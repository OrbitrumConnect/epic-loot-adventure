import { Component, type ErrorInfo, type ReactNode } from 'react';

/**
 * ErrorBoundary para conteúdo DENTRO do `<Canvas>`.
 *
 * Um único asset remoto que falha no fetch (ex.: `/models/house/WoodHouse.obj`
 * durante restart do dev server, HMR, rede lenta ou 404) lança no render do
 * componente que chama o hook de loader do R3F/drei. Sem um boundary ACIMA
 * desse componente, o erro sobe até o CanvasImpl e derruba a aplicação inteira
 * no error boundary do router ("This page didn't load").
 *
 * Este boundary isola cada consumidor de asset: a falha de um renderiza o
 * `fallback` (por padrão `null`) sem afetar o resto da cena.
 *
 * Importante:
 * - O boundary tem que ficar ACIMA do componente que chama o hook de loader
 *   (não dentro dele), senão não captura.
 * - `componentDidCatch` usa `console.warn` de propósito: `console.error` é
 *   embrulhado por `src/lib/error-capture.ts` e poluiria o pipeline de erro.
 * - Funciona em SSR (não acessa `window` no render).
 */
interface AssetBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  label?: string;
}

interface AssetBoundaryState {
  hasError: boolean;
}

export class AssetBoundary extends Component<AssetBoundaryProps, AssetBoundaryState> {
  override state: AssetBoundaryState = { hasError: false };

  static getDerivedStateFromError(): AssetBoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    // NUNCA console.error (error-capture.ts o embrulha e polui o pipeline).
    console.warn(
      `[AssetBoundary${this.props.label ? ` ${this.props.label}` : ''}] asset falhou, usando fallback:`,
      error,
      info?.componentStack,
    );
  }

  override render(): ReactNode {
    if (this.state.hasError) return this.props.fallback ?? null;
    return this.props.children;
  }
}
