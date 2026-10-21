import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import {
  EntretiensEmployeListe,
  type EntretienEmployeLigneUI,
  type ObjectifEmployeLigneUI,
} from '@/components/test-sirh/entretiens/entretiens-employe-liste';

afterEach(() => cleanup());

const entretiens: EntretienEmployeLigneUI[] = [
  {
    id: 'e1',
    campagneLibelle: 'Entretiens annuels 2026',
    evaluateurNom: 'Paul Martin',
    typeEntretien: 'annuel',
    datePrevue: '2026-10-10',
    dateRealisation: '2026-10-12',
    statut: 'signe',
    noteGlobale: 4,
    synthese: 'Très bonne année.',
  },
  {
    id: 'e2',
    campagneLibelle: null,
    evaluateurNom: null,
    typeEntretien: 'professionnel',
    datePrevue: '2026-11-20',
    dateRealisation: null,
    statut: 'planifie',
    noteGlobale: null,
  },
];

const objectifs: ObjectifEmployeLigneUI[] = [
  {
    id: 'o1',
    libelle: 'Obtenir le CACES R482',
    dateEcheance: '2026-09-30',
    poids: 50,
    progression: 50,
    statut: 'en_cours',
  },
  {
    id: 'o2',
    libelle: 'Former un apprenti',
    dateEcheance: '2027-06-30',
    poids: 50,
    progression: 100,
    statut: 'atteint',
  },
];

describe('EntretiensEmployeListe', () => {
  it('liste les entretiens avec lien, statut, note et synthèse', () => {
    render(
      <EntretiensEmployeListe
        entretiens={entretiens}
        objectifs={objectifs}
        baseHref="/acme/test-sirh"
        today="2026-10-19"
        afficherSynthese
      />,
    );
    expect(screen.getByRole('link', { name: 'Annuel' })).toHaveAttribute(
      'href',
      '/acme/test-sirh/entretiens/e1',
    );
    expect(screen.getByText('12/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Signé')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('Très bonne année.')).toBeInTheDocument();
    expect(screen.getByText('Hors campagne')).toBeInTheDocument();
    expect(screen.getByText('prévu')).toBeInTheDocument();
  });

  it('résume les objectifs (atteinte pondérée, échéance dépassée)', () => {
    render(
      <EntretiensEmployeListe entretiens={entretiens} objectifs={objectifs} today="2026-10-19" />,
    );
    expect(screen.getByText('75 %')).toBeInTheDocument();
    expect(screen.getByText(/30\/09\/2026 · dépassée/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Très bonne année.')).not.toBeInTheDocument();
  });

  it('états vides ; bloc objectifs absent si non fourni', () => {
    render(<EntretiensEmployeListe entretiens={[]} today="2026-10-19" />);
    expect(screen.getByText('Aucun entretien enregistré.')).toBeInTheDocument();
    expect(screen.queryByText('Objectifs')).not.toBeInTheDocument();
  });
});
