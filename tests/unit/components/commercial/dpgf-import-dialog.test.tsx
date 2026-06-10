import '@testing-library/jest-dom/vitest';

import { act, cleanup, render } from '@testing-library/react';
import { createRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DpgfImportZone,
  type DpgfImportZoneHandle,
} from '@/components/commercial/dpgf-import-dialog';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

const noop = async () => ({ ok: true as const, data: {} as never });

describe('DpgfImportZone', () => {
  afterEach(() => cleanup());

  it('ne rend aucun encart visible tant qu’aucun fichier n’est sélectionné', () => {
    const { container, queryByText } = render(
      <DpgfImportZone
        analyserAction={noop}
        importerAction={noop}
        onConfirm={() => {}}
      />,
    );

    // L'input file caché est monté pour permettre le déclenchement via ref…
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
    // …mais l'encart « Importer un DPGF du prospect » est masqué.
    expect(queryByText('Importer un DPGF du prospect')).toBeNull();
  });

  it('expose une méthode `ouvrir` qui déclenche le sélecteur de fichier', () => {
    const ref = createRef<DpgfImportZoneHandle>();
    const { container } = render(
      <DpgfImportZone
        ref={ref}
        analyserAction={noop}
        importerAction={noop}
        onConfirm={() => {}}
      />,
    );

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const clickSpy = vi.spyOn(fileInput, 'click');

    expect(ref.current).not.toBeNull();
    act(() => {
      ref.current!.ouvrir();
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);
  });
});
