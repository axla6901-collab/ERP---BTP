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
  FormationsEmployeListe,
  type FormationEmployeLigneUI,
} from '@/components/test-sirh/formation/formations-employe-liste';

afterEach(() => cleanup());

const lignes: FormationEmployeLigneUI[] = [
  {
    inscriptionId: 'i3',
    sessionId: 's3',
    formationIntitule: 'Sauveteur secouriste du travail',
    formationCode: 'SST',
    dateDebut: '2026-11-05',
    dateFin: '2026-11-06',
    sessionStatut: 'confirmee',
    statut: 'inscrit',
    resultat: 'non_evalue',
    heuresRealisees: null,
    dateValidite: null,
    statutQualification: null,
    remplacee: false,
  },
  {
    inscriptionId: 'i2',
    sessionId: 's2',
    formationIntitule: 'CACES R489',
    formationCode: null,
    dateDebut: '2021-12-01',
    dateFin: '2021-12-03',
    sessionStatut: 'realisee',
    statut: 'present',
    resultat: 'reussi',
    heuresRealisees: '21.00',
    dateValidite: '2026-12-03',
    statutQualification: 'a_recycler',
    remplacee: false,
  },
  {
    inscriptionId: 'i1',
    sessionId: 's1',
    formationIntitule: 'CACES R489',
    formationCode: null,
    dateDebut: '2016-11-28',
    dateFin: '2016-11-30',
    sessionStatut: 'realisee',
    statut: 'present',
    resultat: 'reussi',
    heuresRealisees: '21.00',
    dateValidite: '2021-11-30',
    statutQualification: null,
    remplacee: true,
  },
];

describe('FormationsEmployeListe', () => {
  it('affiche l’historique, la validité courante et les réussites renouvelées', () => {
    render(<FormationsEmployeListe formations={lignes} baseHref="/acme/test-sirh" />);
    expect(screen.getByRole('link', { name: 'Sauveteur secouriste du travail' })).toHaveAttribute(
      'href',
      '/acme/test-sirh/formation/sessions/s3',
    );
    expect(screen.getByText('05/11/2026 → 06/11/2026')).toBeInTheDocument();
    expect(screen.getByText('Confirmée')).toBeInTheDocument();
    expect(screen.getByText('Inscrit·e')).toBeInTheDocument();
    expect(screen.getByText('03/12/2026')).toBeInTheDocument();
    expect(screen.getByText('À recycler')).toBeInTheDocument();
    expect(screen.getByText('Renouvelée depuis')).toBeInTheDocument();
    expect(screen.getAllByText('21 h')).toHaveLength(2);
  });

  it('sans lien hors accès et état vide', () => {
    const { unmount } = render(<FormationsEmployeListe formations={lignes} />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    unmount();
    render(<FormationsEmployeListe formations={[]} />);
    expect(screen.getByText('Aucune formation suivie.')).toBeInTheDocument();
  });
});
