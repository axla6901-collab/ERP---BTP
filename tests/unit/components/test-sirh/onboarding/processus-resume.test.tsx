import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ProcessusResume } from '@/components/test-sirh/onboarding/processus-resume';
import type { ProcessusLigne } from '@/lib/test-sirh/onboarding/types';

afterEach(cleanup);

const TODAY = '2026-10-19';

const ligne = (p: Partial<ProcessusLigne> & { id: string }): ProcessusLigne => ({
  libelle: 'Intégration compagnon BTP — Jean Dupont',
  typeProcessus: 'onboarding',
  statut: 'en_cours',
  dateReference: '2026-11-02',
  employeId: 'e1',
  employeNom: 'Jean Dupont',
  modeleId: 'm1',
  modeleNom: 'Intégration compagnon BTP',
  faites: 4,
  total: 10,
  pourcent: 40,
  ouvertes: 6,
  enRetard: 1,
  prochaineEcheance: '2026-10-15',
  terminable: false,
  createdAt: '2026-10-01T08:00:00.000Z',
  ...p,
});

describe('ProcessusResume', () => {
  it('résume chaque processus : type, statut, retard, progression, dates, lien', () => {
    render(
      <ProcessusResume
        processus={[
          ligne({ id: 'p1' }),
          ligne({
            id: 'p2',
            typeProcessus: 'offboarding',
            statut: 'termine',
            libelle: 'Départ — Jean Dupont',
            faites: 6,
            total: 6,
            pourcent: 100,
            enRetard: 0,
            prochaineEcheance: null,
          }),
        ]}
        today={TODAY}
        baseFiches="/acme/test-sirh/onboarding"
      />,
    );
    expect(
      screen.getByRole('link', { name: 'Intégration compagnon BTP — Jean Dupont' }),
    ).toHaveAttribute('href', '/acme/test-sirh/onboarding/p1');
    expect(screen.getByText('1 en retard')).toBeInTheDocument();
    expect(screen.getByText('Terminé')).toBeInTheDocument();
    expect(screen.getByText('4/10 tâches')).toBeInTheDocument();
    expect(screen.getByText('15/10/2026')).toHaveClass('text-rose-700');
    expect(screen.getByText(/Date de départ : 02\/11\/2026/)).toBeInTheDocument();
  });

  it('sans base de fiches : pas de lien ; état vide', () => {
    const { rerender } = render(
      <ProcessusResume processus={[ligne({ id: 'p1' })]} today={TODAY} />,
    );
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    rerender(<ProcessusResume processus={[]} today={TODAY} />);
    expect(screen.getByText(/aucun processus/i)).toBeInTheDocument();
  });
});
