import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  CollaborateursTable,
  type CollaborateurLigneUI,
} from '@/components/test-sirh/collaborateurs/collaborateurs-table';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';

const lignes: CollaborateurLigneUI[] = [
  {
    id: 'e1',
    nom: 'Dubois',
    prenom: 'Marc',
    matricule: 'M-001',
    statut: 'actif',
    posteIntitule: 'Chef d’équipe',
    siteNom: 'Agence de Lyon',
    managerNom: 'Julie Durand',
    contrat: { typeContrat: 'cdd', dateDebut: '2026-04-01', dateFin: '2026-11-18' },
    finContratPrevue: '2026-11-18',
    equipes: [
      { id: 'q1', nom: 'Gros œuvre', couleur: '#f59e0b' },
      { id: 'q2', nom: 'Astreinte', couleur: '#0ea5e9' },
      { id: 'q3', nom: 'Sécurité', couleur: '#ef4444' },
    ],
    dateAnciennete: '2023-08-01',
  },
  {
    id: 'e2',
    nom: 'Martin',
    prenom: 'Léa',
    matricule: null,
    statut: 'sorti',
    posteIntitule: null,
    siteNom: null,
    managerNom: null,
    contrat: null,
    finContratPrevue: null,
    equipes: [],
    dateAnciennete: null,
  },
];

describe('CollaborateursTable', () => {
  it('affiche identité, poste, manager, contrat, équipes, ancienneté et statut', () => {
    render(
      <CollaborateursTable
        collaborateurs={lignes}
        today={TODAY}
        baseHref="/acme/test-sirh/collaborateurs"
      />,
    );
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(screen.getByText('Matricule M-001')).toBeInTheDocument();
    expect(screen.getByText('Chef d’équipe')).toBeInTheDocument();
    expect(screen.getByText('Agence de Lyon')).toBeInTheDocument();
    expect(screen.getByText('Julie Durand')).toBeInTheDocument();
    expect(screen.getByText('CDD')).toBeInTheDocument();
    expect(screen.getByText('→ 18/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Gros œuvre')).toBeInTheDocument();
    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(screen.queryByText('Sécurité')).not.toBeInTheDocument();
    expect(screen.getByText('3 ans 2 mois')).toBeInTheDocument();
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Sorti')).toBeInTheDocument();
    expect(screen.getByText('Aucun contrat en cours')).toBeInTheDocument();
  });

  it('met en évidence une fin de contrat proche et atténue les sortis', () => {
    render(
      <CollaborateursTable
        collaborateurs={lignes}
        today={TODAY}
        baseHref="/acme/test-sirh/collaborateurs"
      />,
    );
    const ligneMarc = screen.getByText('Marc Dubois').closest('tr');
    const ligneLea = screen.getByText('Léa Martin').closest('tr');
    expect(ligneMarc?.className).toContain('bg-amber-50/60');
    expect(ligneLea?.className).toContain('opacity-60');
  });

  it('ouvre le dossier au clic sur la ligne', () => {
    render(
      <CollaborateursTable
        collaborateurs={lignes}
        today={TODAY}
        baseHref="/acme/test-sirh/collaborateurs"
      />,
    );
    fireEvent.click(screen.getByText('Marc Dubois'));
    expect(push).toHaveBeenCalledWith('/acme/test-sirh/collaborateurs/e1');
  });

  it('affiche le message vide fourni', () => {
    render(
      <CollaborateursTable
        collaborateurs={[]}
        today={TODAY}
        baseHref="/acme/test-sirh/collaborateurs"
        emptyMessage="Aucun collaborateur sorti."
      />,
    );
    expect(screen.getByText('Aucun collaborateur sorti.')).toBeInTheDocument();
  });
});
