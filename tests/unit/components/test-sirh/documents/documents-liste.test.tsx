import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DocumentsListe,
  type DocumentListeItem,
} from '@/components/test-sirh/documents/documents-liste';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('sonner', () => ({ toast }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const DOSSIER = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const TODAY = '2026-10-19';

const documents: DocumentListeItem[] = [
  {
    id: 'd1',
    titre: 'Contrat de travail CDI',
    dossierId: DOSSIER,
    mimeType: 'application/pdf',
    tailleBytes: 245760,
    dateDocument: '2024-03-01',
    dateExpiration: null,
    signatureRequise: true,
    signeLe: null,
    createdAt: '2024-03-01T09:00:00.000Z',
  },
  {
    id: 'd2',
    titre: 'Habilitation électrique B1V',
    dossierId: null,
    dossierNom: 'Formations & habilitations',
    mimeType: 'application/pdf',
    tailleBytes: null,
    dateDocument: null,
    dateExpiration: '2026-10-01',
    signatureRequise: false,
    signeLe: null,
    createdAt: '2023-10-01T09:00:00.000Z',
  },
  {
    id: 'd3',
    titre: 'Avenant horaires',
    dossierId: null,
    mimeType: 'application/pdf',
    tailleBytes: 1024,
    dateDocument: null,
    dateExpiration: '2026-11-01',
    signatureRequise: true,
    signeLe: '2026-09-15T10:00:00.000Z',
    createdAt: '2026-09-10T09:00:00.000Z',
  },
];

describe('DocumentsListe', () => {
  it('affiche titres, dossiers, tailles, expirations et signatures', () => {
    render(
      <DocumentsListe
        documents={documents}
        today={TODAY}
        obtenirUrl={vi.fn()}
        dossiers={[{ id: DOSSIER, label: 'Contrats & avenants' }]}
      />,
    );
    expect(screen.getByText('Contrat de travail CDI')).toBeInTheDocument();
    expect(screen.getByText(/Contrats & avenants · du 01\/03\/2024 · 240 Ko/)).toBeInTheDocument();
    expect(screen.getByText(/Formations & habilitations/)).toBeInTheDocument();
    expect(screen.getByText('Expiré')).toBeInTheDocument();
    expect(screen.getByText('Expire bientôt')).toBeInTheDocument();
    expect(screen.getByText('À signer')).toBeInTheDocument();
    expect(screen.getByText('Signé le 15/09/2026')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /signer/i })).toBeNull();
  });

  it('propose « Signer » sur les documents à signer quand l’action est fournie', async () => {
    const onSigner = vi.fn().mockResolvedValue({ ok: true, data: undefined });
    render(
      <DocumentsListe
        documents={documents}
        today={TODAY}
        obtenirUrl={vi.fn()}
        onSigner={onSigner}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /signer/i }));
    await waitFor(() => expect(onSigner).toHaveBeenCalledWith('d1'));
    expect(toast.success).toHaveBeenCalled();
  });

  it('télécharge via l’URL présignée', async () => {
    const obtenirUrl = vi.fn().mockResolvedValue({ ok: false, error: 'Accès refusé.' });
    render(<DocumentsListe documents={documents} today={TODAY} obtenirUrl={obtenirUrl} />);
    fireEvent.click(screen.getByRole('button', { name: 'Contrat de travail CDI' }));
    await waitFor(() => expect(obtenirUrl).toHaveBeenCalledWith('d1'));
    expect(toast.error).toHaveBeenCalledWith('Accès refusé.');
  });

  it('affiche l’état vide', () => {
    render(
      <DocumentsListe documents={[]} today={TODAY} obtenirUrl={vi.fn()} emptyMessage="Rien ici." />,
    );
    expect(screen.getByText('Rien ici.')).toBeInTheDocument();
  });
});
