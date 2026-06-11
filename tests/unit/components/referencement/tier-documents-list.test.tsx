import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/lib/referencement/documents', () => ({
  enregistrerDocumentTier: vi.fn(),
  preparerUploadDocumentTier: vi.fn(),
  refuserDocumentTier: vi.fn(),
  supprimerDocumentTier: vi.fn(),
  urlTelechargementDocumentTier: vi.fn(),
  validerDocumentTier: vi.fn(),
}));

import { TierDocumentsList } from '@/components/referencement/tier-documents-list';
import {
  supprimerDocumentTier,
  urlTelechargementDocumentTier,
} from '@/lib/referencement/documents';

type Ligne = Parameters<typeof TierDocumentsList>[0]['lignes'][number];
type DocItem = Parameters<typeof TierDocumentsList>[0]['documents'][number];

const NATURES = [
  {
    id: 'n-rc',
    code: 'RC',
    libelle: 'Assurance responsabilité civile',
    modeControle: 'date_fin_assurance' as const,
  },
  { id: 'n-kbis', code: 'KBIS', libelle: 'K-bis', modeControle: 'date_obtention' as const },
];

function ligne(over: Partial<Ligne> = {}): Ligne {
  return {
    natureDocumentId: 'n-rc',
    code: 'RC',
    libelle: 'Assurance responsabilité civile',
    estBloquant: true,
    statut: 'a_renouveler',
    dateFinValidite: '2026-06-15',
    ...over,
  };
}

function doc(over: Partial<DocItem> = {}): DocItem {
  return {
    id: 'd-rc',
    natureDocumentId: 'n-rc',
    nomFichierOrigine: 'RC.pdf',
    dateFinValidite: '2026-06-15',
    statut: 'a_renouveler',
    motifRefus: null,
    createdAt: '2026-06-10T10:00:00.000Z',
    ...over,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TierDocumentsList — affichage en colonnes', () => {
  it('rend un tableau avec les en-têtes Document / Fin de validité / Statut', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Document' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Fin de validité' })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'Statut' })).toBeInTheDocument();
  });

  it('affiche la date de fin de validité dans sa propre colonne', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne({ dateFinValidite: '2026-06-15' })]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    const row = screen.getByText('Assurance responsabilité civile').closest('tr')!;
    expect(within(row).getByText('2026-06-15')).toBeInTheDocument();
  });

  it('affiche un tiret quand la date de fin de validité est absente', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[
          ligne({
            libelle: 'Attestation sur l’honneur',
            dateFinValidite: null,
            statut: 'manquant',
          }),
        ]}
        documents={[]}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    const row = screen.getByText('Attestation sur l’honneur').closest('tr')!;
    expect(within(row).getByText('—')).toBeInTheDocument();
  });

  it('affiche le statut du document via la pastille', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne({ statut: 'expire' })]}
        documents={[doc({ statut: 'expire' })]}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    expect(screen.getByText('Expiré')).toBeInTheDocument();
  });

  it('affiche le badge bloquant et le nom de fichier (ou « Aucun fichier »)', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[
          ligne({ estBloquant: true }),
          ligne({
            natureDocumentId: 'n-kbis',
            code: 'KBIS',
            libelle: 'K-bis',
            estBloquant: false,
            statut: 'manquant',
            dateFinValidite: null,
          }),
        ]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    expect(screen.getByText('bloquant')).toBeInTheDocument();
    expect(screen.getByText('RC.pdf')).toBeInTheDocument();
    expect(screen.getByText('Aucun fichier')).toBeInTheDocument();
  });

  it('ajoute la colonne Actions et le bon libellé (Remplacer/Ajouter) en écriture', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[
          ligne(), // a un document => Remplacer
          ligne({
            natureDocumentId: 'n-kbis',
            libelle: 'K-bis',
            statut: 'manquant',
            dateFinValidite: null,
          }), // pas de document => Ajouter
        ]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire
      />,
    );
    expect(screen.getByRole('columnheader', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remplacer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ajouter' })).toBeInTheDocument();
  });

  it('masque la colonne Actions en lecture seule', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    expect(screen.queryByRole('columnheader', { name: 'Actions' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remplacer' })).not.toBeInTheDocument();
  });

  it('affiche l’état vide quand aucun document n’est requis', () => {
    render(
      <TierDocumentsList tierId="t1" lignes={[]} documents={[]} natures={NATURES} peutEcrire />,
    );
    expect(screen.getByText(/Aucun document requis/i)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('TierDocumentsList — historique des versions', () => {
  // La pièce courante (RC.pdf, 2026-06-10) + une version précédente (RC-2025.pdf).
  const documentsAvecHistorique: DocItem[] = [
    doc({ id: 'd-rc-v2', nomFichierOrigine: 'RC.pdf', createdAt: '2026-06-10T10:00:00.000Z' }),
    doc({
      id: 'd-rc-v1',
      nomFichierOrigine: 'RC-2025.pdf',
      statut: 'valide',
      createdAt: '2025-06-10T10:00:00.000Z',
    }),
  ];

  it('conserve le bouton de suppression sur la pièce courante (la suppression reste un droit)', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire
      />,
    );
    expect(screen.getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
  });

  it('n’affiche pas de bouton historique quand il n’existe qu’une seule version', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={[doc()]}
        natures={NATURES}
        peutEcrire
      />,
    );
    expect(screen.queryByText(/version précédente/i)).not.toBeInTheDocument();
  });

  it('masque l’historique par défaut puis le déplie au clic', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={documentsAvecHistorique}
        natures={NATURES}
        peutEcrire
      />,
    );
    // Replié : la version précédente n'est pas affichée, mais le bouton l'est.
    expect(screen.queryByText('RC-2025.pdf')).not.toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /1 version précédente/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);

    // Déplié : la version précédente devient consultable (nom + date).
    expect(screen.getByText('RC-2025.pdf')).toBeInTheDocument();
    expect(screen.getByText(/version du/i)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('permet de télécharger une version précédente', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={documentsAvecHistorique}
        natures={NATURES}
        peutEcrire
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1 version précédente/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger cette version' }));
    expect(urlTelechargementDocumentTier).toHaveBeenCalledWith('d-rc-v1');
  });

  it('permet de supprimer une version précédente', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={documentsAvecHistorique}
        natures={NATURES}
        peutEcrire
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1 version précédente/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer cette version' }));
    expect(supprimerDocumentTier).toHaveBeenCalledWith('d-rc-v1');
  });

  it('expose l’historique en lecture seule sans les actions', () => {
    render(
      <TierDocumentsList
        tierId="t1"
        lignes={[ligne()]}
        documents={documentsAvecHistorique}
        natures={NATURES}
        peutEcrire={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /1 version précédente/i }));
    expect(screen.getByText('RC-2025.pdf')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Supprimer cette version' }),
    ).not.toBeInTheDocument();
  });
});
