import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EcheancesAlertesTable, type AlerteRow } from '@/components/flotte/echeances-alertes-table';

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const alertes: AlerteRow[] = [
  {
    id: '1',
    vehiculeId: 'v1',
    immatriculation: 'AA-123-BB',
    marque: 'Renault',
    modele: 'Master',
    typeEcheance: 'controle_technique',
    dateEcheance: '2026-06-13',
    seuilAlerteJours: 30,
    conducteurNom: 'Marc Dubois',
  },
  {
    id: '2',
    vehiculeId: 'v2',
    immatriculation: 'CC-456-DD',
    marque: 'Peugeot',
    modele: '308',
    typeEcheance: 'assurance',
    dateEcheance: '2026-07-04',
    seuilAlerteJours: 30,
    conducteurNom: null,
  },
];

describe('EcheancesAlertesTable', () => {
  it('affiche les alertes, le filtre « Tout » et les jours restants', () => {
    render(
      <EcheancesAlertesTable
        alertes={alertes}
        today="2026-06-16"
        baseHref="/acme/flotte/vehicules"
      />,
    );
    expect(screen.getByText('AA-123-BB')).toBeInTheDocument();
    expect(screen.getByText('CC-456-DD')).toBeInTheDocument();
    expect(screen.getByText(/Tout/)).toBeInTheDocument();
    // CT dépassé de 3 jours (signe moins typographique).
    expect(screen.getByText('−3 j')).toBeInTheDocument();
    // Assurance dans 18 jours.
    expect(screen.getByText('18 j')).toBeInTheDocument();
  });

  it("affiche le message vide quand il n'y a aucune échéance", () => {
    render(
      <EcheancesAlertesTable
        alertes={[]}
        today="2026-06-16"
        baseHref="/acme/flotte/vehicules"
        emptyMessage="Aucune échéance"
      />,
    );
    expect(screen.getByText('Aucune échéance')).toBeInTheDocument();
  });
});
