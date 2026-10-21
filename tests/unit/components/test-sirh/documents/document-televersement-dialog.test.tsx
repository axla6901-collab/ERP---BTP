import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DocumentTeleversementDialog,
  valeursTeleversementParDefaut,
} from '@/components/test-sirh/documents/document-televersement-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!('PointerEvent' in window)) {
    // @ts-expect-error polyfill minimal pour jsdom (le Switch construit un PointerEvent au clic)
    window.PointerEvent = class extends MouseEvent {};
    // @ts-expect-error idem côté global
    globalThis.PointerEvent = window.PointerEvent;
  }
});

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

const DOSSIER = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const DOC_ID = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';
const DOSSIERS = [{ id: DOSSIER, label: 'Règlement & accords', visibleSalarie: true }];

function actions() {
  return {
    preparerUpload: vi.fn().mockResolvedValue({
      ok: true,
      data: { uploadUrl: 'https://minio.local/put', minioKey: 'test-sirh/e/entreprise/f.pdf' },
    }),
    creerDocument: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { id: DOC_ID, titre: 'reglement-interieur' } }),
  };
}

function choisirFichier(nom = 'reglement-interieur.pdf') {
  const input = screen.getByTestId('televersement-input');
  fireEvent.change(input, {
    target: { files: [new File(['%PDF'], nom, { type: 'application/pdf' })] },
  });
}

describe('valeursTeleversementParDefaut', () => {
  it('hérite la visibilité du dossier présélectionné', () => {
    expect(
      valeursTeleversementParDefaut({ cibleType: 'entreprise', dossierId: DOSSIER }, DOSSIERS),
    ).toMatchObject({ cibleType: 'entreprise', dossierId: DOSSIER, visibleSalarie: true });
    expect(valeursTeleversementParDefaut({}, DOSSIERS)).toMatchObject({
      cibleType: 'employe',
      dossierId: null,
      visibleSalarie: false,
    });
  });
});

describe('DocumentTeleversementDialog', () => {
  it('document d’entreprise : joint les métadonnées saisies à l’enregistrement', async () => {
    const a = actions();
    render(
      <DocumentTeleversementDialog
        open
        onOpenChange={vi.fn()}
        employes={[]}
        dossiers={DOSSIERS}
        initiales={{ cibleType: 'entreprise', dossierId: DOSSIER }}
        actions={a}
      />,
    );
    fireEvent.change(screen.getByLabelText('Date d’expiration'), {
      target: { value: '2027-01-01' },
    });
    fireEvent.click(screen.getByRole('switch', { name: /signature requise/i }));
    choisirFichier();

    await waitFor(() => expect(a.creerDocument).toHaveBeenCalled());
    expect(a.preparerUpload).toHaveBeenCalledWith(
      { type: 'entreprise' },
      'application/pdf',
      'reglement-interieur.pdf',
      4,
    );
    expect(fetchMock).toHaveBeenCalledWith(
      'https://minio.local/put',
      expect.objectContaining({ method: 'PUT' }),
    );
    expect(a.creerDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        cible: { type: 'entreprise' },
        titre: 'reglement-interieur',
        minioKey: 'test-sirh/e/entreprise/f.pdf',
        dossierId: DOSSIER,
        dateExpiration: '2027-01-01',
        visibleSalarie: true,
        signatureRequise: true,
      }),
    );
  });

  it('pièce salarié sans collaborateur : rien n’est envoyé', async () => {
    const a = actions();
    render(
      <DocumentTeleversementDialog
        open
        onOpenChange={vi.fn()}
        employes={[]}
        dossiers={DOSSIERS}
        actions={a}
      />,
    );
    choisirFichier();
    expect(
      await screen.findByText('Complétez le formulaire avant de choisir le fichier.'),
    ).toBeInTheDocument();
    expect(screen.getByText('Collaborateur requis.')).toBeInTheDocument();
    expect(a.preparerUpload).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
