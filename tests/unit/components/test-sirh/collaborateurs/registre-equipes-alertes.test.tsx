import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ListeAlertesContrats } from '@/components/test-sirh/collaborateurs/alertes-contrats';
import { TypeContratBadge } from '@/components/test-sirh/collaborateurs/badges';
import { EquipesCollaborateur } from '@/components/test-sirh/collaborateurs/equipes-collaborateur';
import { RegistreTable } from '@/components/test-sirh/collaborateurs/registre-table';
import type { LigneRegistreNumerotee } from '@/lib/test-sirh/collaborateurs/registre';

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
});

const TODAY = '2026-10-19';

describe('RegistreTable', () => {
  const lignes: LigneRegistreNumerotee[] = [
    {
      numero: 1,
      employeId: 'e1',
      nom: 'Dubois',
      prenoms: 'Marc André',
      nationalite: 'Française',
      dateNaissance: '1985-04-12',
      sexe: 'M',
      emploi: 'Chef d’équipe',
      qualification: 'E · coef. 250',
      categorie: 'etam',
      typeContrat: 'cdd',
      tempsPartiel: true,
      mentions: ['Contrat à durée déterminée', 'Temps partiel'],
      agenceInterim: null,
      dateEntree: '2019-03-04',
      dateSortie: null,
    },
    {
      numero: 2,
      employeId: 'e2',
      nom: 'Martin',
      prenoms: 'Léa',
      nationalite: 'Portugaise',
      dateNaissance: null,
      sexe: 'F',
      emploi: null,
      qualification: null,
      categorie: null,
      typeContrat: 'interim',
      tempsPartiel: false,
      mentions: ['Travailleur temporaire — Adecco'],
      agenceInterim: 'Adecco',
      dateEntree: '2024-02-01',
      dateSortie: '2024-06-30',
    },
  ];

  it('affiche les mentions obligatoires du registre', () => {
    render(
      <RegistreTable lignes={lignes} today={TODAY} baseHref="/acme/test-sirh/collaborateurs" />,
    );
    expect(screen.getByText('Dubois')).toBeInTheDocument();
    expect(screen.getByText('Française')).toBeInTheDocument();
    expect(screen.getByText('12/04/1985')).toBeInTheDocument();
    expect(screen.getByText('Masculin')).toBeInTheDocument();
    expect(screen.getByText('ETAM · E · coef. 250')).toBeInTheDocument();
    expect(screen.getByText('CDD')).toBeInTheDocument();
    expect(screen.getByText('Contrat à durée déterminée · Temps partiel')).toBeInTheDocument();
    expect(screen.getByText('Travailleur temporaire — Adecco')).toBeInTheDocument();
    expect(screen.getByText('30/06/2024')).toBeInTheDocument();
    const ligneSortie = screen.getByText('Martin').closest('tr');
    expect(ligneSortie?.className).toContain('opacity-60');
  });
});

describe('EquipesCollaborateur', () => {
  it('liste les équipes en vigueur puis l’historique', () => {
    render(
      <EquipesCollaborateur
        today={TODAY}
        lienEquipes="/acme/test-sirh/organisation/equipes"
        equipes={[
          {
            membreId: 'm2',
            equipeId: 'q2',
            nom: 'Ancienne équipe',
            couleur: '#999999',
            equipeActive: false,
            siteNom: null,
            estResponsable: false,
            dateDebut: '2023-01-01',
            dateFin: '2024-12-31',
          },
          {
            membreId: 'm1',
            equipeId: 'q1',
            nom: 'Gros œuvre',
            couleur: '#f59e0b',
            equipeActive: true,
            siteNom: 'Agence de Lyon',
            estResponsable: true,
            dateDebut: '2025-01-01',
            dateFin: null,
          },
        ]}
      />,
    );
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Gros œuvre');
    expect(items[0]).toHaveTextContent('Responsable');
    expect(items[0]).toHaveTextContent('depuis le 01/01/2025');
    expect(items[1]).toHaveTextContent('Terminé');
    expect(items[1]).toHaveTextContent('(équipe inactive)');
    expect(screen.getByRole('link', { name: /gérer les équipes/i })).toHaveAttribute(
      'href',
      '/acme/test-sirh/organisation/equipes',
    );
  });

  it('état vide', () => {
    render(<EquipesCollaborateur equipes={[]} today={TODAY} />);
    expect(screen.getByText('Membre d’aucune équipe.')).toBeInTheDocument();
  });
});

describe('ListeAlertesContrats et badges', () => {
  it('relie chaque alerte au dossier du collaborateur', () => {
    render(
      <ListeAlertesContrats
        lienDossier="/acme/test-sirh/collaborateurs"
        alertes={[
          {
            type: 'fin_contrat',
            niveau: 'critique',
            date: '2026-10-22',
            jours: 3,
            message: 'Fin de contrat (CDD) le 22/10/2026 (dans 3 j)',
            employeId: 'e1',
            employeNom: 'Marc Dubois',
          },
        ]}
      />,
    );
    expect(screen.getByRole('link', { name: 'Marc Dubois' })).toHaveAttribute(
      'href',
      '/acme/test-sirh/collaborateurs/e1',
    );
    expect(screen.getByText(/Fin de contrat \(CDD\) le 22\/10\/2026/)).toBeInTheDocument();
  });

  it('ne rend rien sans alerte', () => {
    const { container } = render(<ListeAlertesContrats alertes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('badge de type de contrat avec libellé long en infobulle', () => {
    render(<TypeContratBadge type="apprentissage" />);
    expect(screen.getByText('Apprentissage')).toHaveAttribute('title', 'Contrat d’apprentissage');
  });
});
