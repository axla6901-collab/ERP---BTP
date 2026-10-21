import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { CalendrierEquipe } from '@/components/test-sirh/absences/calendrier-equipe';
import {
  construireGrilleMois,
  type TypeCalendrier,
} from '@/lib/test-sirh/absences/calendrier-equipe';

afterEach(cleanup);

const TYPES: TypeCalendrier[] = [
  {
    id: 'cp',
    code: 'CP',
    libelle: 'Congés payés',
    couleur: '#f59e0b',
    uniteDecompte: 'jours_ouvrables',
  },
  { id: 'rtt', code: 'RTT', libelle: 'RTT', couleur: '#0ea5e9', uniteDecompte: 'jours_ouvres' },
  {
    id: 'mal',
    code: 'MAL',
    libelle: 'Arrêt maladie',
    couleur: '#ef4444',
    uniteDecompte: 'jours_calendaires',
  },
];

const GRILLE = construireGrilleMois({
  annee: 2026,
  mois: 10,
  employes: [
    { id: 'e1', label: 'Marc Dubois', siteId: null },
    { id: 'e2', label: 'Léa Martin', siteId: null },
  ],
  absences: [
    {
      id: 'a1',
      employeId: 'e1',
      typeAbsenceId: 'cp',
      dateDebut: '2026-10-12',
      dateFin: '2026-10-13',
      demiJourneeDebut: false,
      demiJourneeFin: false,
      statut: 'approuvee',
    },
    {
      id: 'a2',
      employeId: 'e2',
      typeAbsenceId: 'rtt',
      dateDebut: '2026-10-21',
      dateFin: '2026-10-21',
      demiJourneeDebut: false,
      demiJourneeFin: true,
      statut: 'en_attente',
    },
  ],
  feries: [{ date: '2026-10-30', libelle: 'Pont entreprise', siteId: null }],
  types: TYPES,
  today: '2026-10-19',
});

describe('CalendrierEquipe', () => {
  it('une colonne par jour du mois + la colonne des collaborateurs', () => {
    render(<CalendrierEquipe grille={GRILLE} types={TYPES} />);
    expect(screen.getAllByRole('columnheader')).toHaveLength(32);
    expect(screen.getByRole('rowheader', { name: 'Marc Dubois' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: 'Léa Martin' })).toBeInTheDocument();
    expect(screen.getByTitle('30/10/2026 — Pont entreprise')).toBeInTheDocument();
  });

  it('colore les absences ; demande en attente en pointillés ; demi-journée', () => {
    render(<CalendrierEquipe grille={GRILLE} types={TYPES} />);
    const segments = screen.getAllByTestId('segment-absence');
    // a1 : 2 journées entières ; a2 : un matin seul.
    expect(segments).toHaveLength(3);
    const enAttente = segments.filter((s) => s.getAttribute('data-statut') === 'en_attente');
    expect(enAttente).toHaveLength(1);
    expect(enAttente[0]).toHaveClass('border-dashed');
    expect(enAttente[0]).toHaveStyle({ backgroundColor: '#0ea5e9' });
    expect(
      screen.getByTitle('Léa Martin — 21/10/2026 · matin : RTT (en attente)'),
    ).toBeInTheDocument();
    expect(screen.getByTitle('Marc Dubois — 12/10/2026 · Congés payés')).toBeInTheDocument();
  });

  it('ne met d’infobulle que sur les cellules d’absence ou fériées (page allégée)', () => {
    const { container } = render(<CalendrierEquipe grille={GRILLE} types={TYPES} />);
    // 2 collaborateurs × 31 jours.
    expect(container.querySelectorAll('tbody td')).toHaveLength(62);
    // a1 : 2 jours ; a2 : 1 jour ; férié du 30/10 : 1 cellule par collaborateur.
    expect(container.querySelectorAll('tbody td[title]')).toHaveLength(5);
    expect(
      screen.getByTitle('Marc Dubois — 30/10/2026 · férié : Pont entreprise'),
    ).toBeInTheDocument();
  });

  it('légende : types présents, en attente, demi-journée, week-end / férié', () => {
    render(<CalendrierEquipe grille={GRILLE} types={TYPES} />);
    const legende = screen.getByLabelText('Légende');
    expect(legende).toHaveTextContent('Congés payés');
    expect(legende).toHaveTextContent('RTT');
    expect(legende).not.toHaveTextContent('Arrêt maladie');
    expect(legende).toHaveTextContent('En attente de validation');
    expect(legende).toHaveTextContent('Week-end / férié chômé');
  });

  it('état vide sans collaborateur', () => {
    render(<CalendrierEquipe grille={{ ...GRILLE, lignes: [] }} types={TYPES} />);
    expect(screen.getByText('Aucun collaborateur pour ces filtres.')).toBeInTheDocument();
    expect(screen.getByLabelText('Légende')).toHaveTextContent('Aucune absence sur ce mois.');
  });
});
