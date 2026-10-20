import { render, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AssetBoundary } from '../asset-boundary';

afterEach(cleanup);

/** Reproduz a falha real: um filho que lança exatamente o erro do bug report
 *  (`Could not load /models/house/WoodHouse.obj: Failed to fetch`) no render. */
function ExplodingAsset(): never {
  throw new Error('Could not load /models/house/WoodHouse.obj: Failed to fetch');
}

describe('AssetBoundary', () => {
  it('sem boundary o erro do asset propaga (comportamento antigo que derrubava a página)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Sem AssetBoundary, o erro do filho sobe até o render e derruba a árvore.
    expect(() => render(<ExplodingAsset />)).toThrow(
      'Could not load /models/house/WoodHouse.obj: Failed to fetch',
    );

    error.mockRestore();
  });

  it('renderiza o fallback quando um filho de asset lança no render', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { getByTestId, queryByTestId } = render(
      <AssetBoundary label="WoodHouse" fallback={<div data-testid="fallback">fallback</div>}>
        <ExplodingAsset />
      </AssetBoundary>,
    );

    // (i) renderiza o fallback
    expect(getByTestId('fallback')).toBeInTheDocument();
    // conteúdo do asset não ficou montado
    expect(queryByTestId('asset')).toBeNull();
    // usa console.warn (NUNCA console.error, que error-capture.ts embrulha)
    expect(warn).toHaveBeenCalled();

    warn.mockRestore();
    error.mockRestore();
  });

  it('NÃO propaga o erro para fora do boundary', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    // Se o erro vazasse, render() lançaria e este expect falharia.
    expect(() =>
      render(
        <div data-testid="outside">
          <AssetBoundary label="WoodHouse">
            <ExplodingAsset />
          </AssetBoundary>
        </div>,
      ),
    ).not.toThrow();

    warn.mockRestore();
    error.mockRestore();
  });

  it('fallback padrão é null (sem fallback explícito nada é renderizado)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = render(
      <AssetBoundary>
        <ExplodingAsset />
      </AssetBoundary>,
    );
    expect(container).toBeEmptyDOMElement();

    warn.mockRestore();
    error.mockRestore();
  });

  it('renderiza os filhos normalmente quando não há erro', () => {
    const { getByTestId } = render(
      <AssetBoundary>
        <div data-testid="asset">ok</div>
      </AssetBoundary>,
    );
    expect(getByTestId('asset')).toBeInTheDocument();
  });
});
