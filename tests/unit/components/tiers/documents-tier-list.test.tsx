import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

import { DocumentsTierList } from '@/components/tiers/documents-tier-list';

const TODAY = '2026-06-10';

const noopActions = {
  preparerUpload: vi.fn().mockResolvedValue({ ok: false, error: 'x' }),
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: '1' } }),
  getDownloadUrl: vi.fn().mockResolvedValue({ ok: false, error: 'x' }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

function doc(over: Partial<Parameters<typeof DocumentsTierList>[0]['items'][number]> = {}) {
  return {
    id: 'd1',
    type: 'kbis' as const,
    libelle: 'K-BIS Société Dupont',
    mimeType: 'application/pdf',
    tailleBytes: 2048,
    dateValidite: null as string | null,
    createdAt: '2026-06-01T00:00:00.000Z',
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DocumentsTierList', () => {
  it('affiche l’état vide sans bouton d’ajout en lecture seule', () => {
    const { getByText, queryByRole } = render(
      <DocumentsTierList items={[]} peutEcrire={false} today={TODAY} actions={noopActions} />,
    );
    expect(getByText('Aucun document.')).toBeInTheDocument();
    expect(queryByRole('button', { name: /ajouter un document/i })).not.toBeInTheDocument();
  });

  it('affiche le bouton d’ajout quand l’écriture est autorisée', () => {
    const { getByRole } = render(
      <DocumentsTierList items={[]} peutEcrire today={TODAY} actions={noopActions} />,
    );
    expect(getByRole('button', { name: /ajouter un document/i })).toBeInTheDocument();
  });

  it('affiche le libellé et le type lisible du document', () => {
    const { getByText } = render(
      <DocumentsTierList items={[doc()]} peutEcrire={false} today={TODAY} actions={noopActions} />,
    );
    expect(getByText('Extrait K-BIS')).toBeInTheDocument();
    expect(getByText('Extrait K-BIS', { selector: 'span.rounded-full' })).toBeTruthy();
  });

  it('marque un document expiré', () => {
    const { getByText } = render(
      <DocumentsTierList
        items={[doc({ dateValidite: '2026-01-01' })]}
        peutEcrire={false}
        today={TODAY}
        actions={noopActions}
      />,
    );
    expect(getByText(/expiré le 2026-01-01/i)).toBeInTheDocument();
  });

  it('marque un document qui expire bientôt (≤ 30 jours)', () => {
    const { getByText } = render(
      <DocumentsTierList
        items={[doc({ dateValidite: '2026-06-20' })]}
        peutEcrire={false}
        today={TODAY}
        actions={noopActions}
      />,
    );
    expect(getByText(/expire le 2026-06-20/i)).toBeInTheDocument();
  });

  it('affiche la validité simple pour un document loin de l’expiration', () => {
    const { getByText } = render(
      <DocumentsTierList
        items={[doc({ dateValidite: '2027-01-01' })]}
        peutEcrire={false}
        today={TODAY}
        actions={noopActions}
      />,
    );
    expect(getByText(/valide jusqu’au 2027-01-01|valide jusqu'au 2027-01-01/i)).toBeInTheDocument();
  });

  it('propose le téléchargement mais pas la suppression en lecture seule', () => {
    const { getByTitle, queryByTitle } = render(
      <DocumentsTierList items={[doc()]} peutEcrire={false} today={TODAY} actions={noopActions} />,
    );
    expect(getByTitle('Télécharger')).toBeInTheDocument();
    expect(queryByTitle('Supprimer')).not.toBeInTheDocument();
  });

  it('propose la suppression quand l’écriture est autorisée', () => {
    const { getByTitle } = render(
      <DocumentsTierList items={[doc()]} peutEcrire today={TODAY} actions={noopActions} />,
    );
    expect(getByTitle('Supprimer')).toBeInTheDocument();
  });
});
