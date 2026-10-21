import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { DocumentsGed } from '@/components/test-sirh/documents/documents-ged';
import type { DocumentGedLigne } from '@/lib/test-sirh/documents/queries';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const D1 = '5c8e1a2b-3d4f-4a6b-9c7d-8e9f0a1b2c3d';
const D3 = '7d9e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a';

function doc(partiel: Partial<DocumentGedLigne> & { id: string; titre: string }): DocumentGedLigne {
  return {
    dossierId: null,
    dossierNom: null,
    employeId: EMPLOYE,
    employeNom: 'Marc Dubois',
    mimeType: 'application/pdf',
    tailleBytes: 2048,
    dateDocument: '2026-01-15',
    dateExpiration: null,
    visibleSalarie: true,
    signatureRequise: false,
    signeLe: null,
    notes: null,
    createdAt: '2026-01-15T09:00:00.000Z',
    ...partiel,
  };
}

const DOCUMENTS = [
  doc({
    id: D1,
    titre: 'Contrat CDI',
    dossierNom: 'Contrats & avenants',
    signatureRequise: true,
  }),
  doc({
    id: 'd2',
    titre: 'Règlement intérieur',
    employeId: null,
    employeNom: null,
    dossierNom: 'Règlement & accords',
  }),
  doc({ id: D3, titre: 'CACES R482', dateExpiration: '2026-09-30', visibleSalarie: false }),
];

function actions() {
  return {
    modifier: vi.fn().mockResolvedValue({ ok: true, data: { id: D1 } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    signer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    urlTelechargement: vi.fn(),
    televersement: { preparerUpload: vi.fn(), creerDocument: vi.fn() },
  };
}

function rendre(peutGerer: boolean, a = actions()) {
  render(
    <DocumentsGed
      documents={DOCUMENTS}
      today={TODAY}
      peutGerer={peutGerer}
      base="/acme/test-sirh/documents"
      employes={[{ id: EMPLOYE, label: 'Dubois Marc' }]}
      dossiers={[]}
      actions={a}
    />,
  );
  return a;
}

describe('DocumentsGed', () => {
  it('affiche documents salariés et d’entreprise, expiration, visibilité, signature', () => {
    rendre(true);
    expect(screen.getByText('Contrat CDI')).toBeInTheDocument();
    expect(screen.getByText('Entreprise')).toBeInTheDocument();
    expect(screen.getByText('Règlement & accords')).toBeInTheDocument();
    expect(screen.getByText('Expiré')).toBeInTheDocument();
    expect(screen.getByText('Masqué')).toBeInTheDocument();
    expect(screen.getByText('À signer')).toBeInTheDocument();
    expect(screen.getAllByText('2 Ko')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /téléverser/i })).toBeInTheDocument();
  });

  it('lecture seule : ni téléversement, ni modification, ni suppression', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /téléverser/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).toBeNull();
    expect(screen.queryByRole('button', { name: /modifier/i })).toBeNull();
    expect(screen.getAllByRole('button', { name: /télécharger/i })).toHaveLength(3);
  });

  it('marque signé un document à signature après confirmation', async () => {
    const a = rendre(true);
    const ligne = screen.getAllByRole('row').find((r) => within(r).queryByText('Contrat CDI'))!;
    fireEvent.click(within(ligne).getByRole('button', { name: /signé/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Marquer signé' }));
    await waitFor(() => expect(a.signer).toHaveBeenCalledWith(D1));
  });

  it('supprime un document après confirmation', async () => {
    const a = rendre(true);
    const ligne = screen.getAllByRole('row').find((r) => within(r).queryByText('CACES R482'))!;
    fireEvent.click(within(ligne).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(ligne).getAllByRole('button', { name: 'Supprimer' }).at(-1)!);
    await waitFor(() => expect(a.supprimer).toHaveBeenCalledWith(D3));
  });

  it('ouvre la modification des métadonnées et enregistre', async () => {
    const a = rendre(true);
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Contrat CDI' }));
    const titre = await screen.findByLabelText('Titre');
    expect(titre).toHaveValue('Contrat CDI');
    fireEvent.change(titre, { target: { value: 'Contrat CDI signé' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(a.modifier).toHaveBeenCalledWith(
        expect.objectContaining({ id: D1, titre: 'Contrat CDI signé', signatureRequise: true }),
      ),
    );
  });
});
