import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { push, refresh } = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push, refresh, prefetch: vi.fn() }),
}));
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
  SuiviLegalTable,
  type SuiviLigneUI,
} from '@/components/test-sirh/entretiens/suivi-legal-table';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const E1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const E2 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const E3 = '11111111-1111-4111-8111-111111111111';
const M1 = '22222222-2222-4222-8222-222222222222';
const X1 = '33333333-3333-4333-8333-333333333333';
const X2 = '44444444-4444-4444-8444-444444444444';
const NOUVEAU = '55555555-5555-4555-8555-555555555555';
const BASE = '/acme/test-sirh';

const lignes: SuiviLigneUI[] = [
  {
    employeId: E1,
    employeNom: 'Léa Durand',
    employeTri: 'durand léa',
    matricule: 'M001',
    managerId: M1,
    managerNom: 'Paul Martin',
    dateEntree: '2014-09-01',
    dernierEntretien: '2022-08-01',
    dernierEntretienId: X1,
    prochaineEcheance: '2024-08-01',
    joursRestants: -809,
    statut: 'en_retard',
    echeanceBilan: '2026-09-01',
    statutBilan: 'en_retard',
    entretienPlanifie: null,
  },
  {
    employeId: E2,
    employeNom: 'Marc Petit',
    employeTri: 'petit marc',
    matricule: null,
    managerId: null,
    managerNom: null,
    dateEntree: '2024-11-15',
    dernierEntretien: null,
    dernierEntretienId: null,
    prochaineEcheance: '2026-11-15',
    joursRestants: 27,
    statut: 'a_planifier',
    echeanceBilan: '2030-11-15',
    statutBilan: 'a_jour',
    entretienPlanifie: { id: X2, typeEntretien: 'professionnel', datePrevue: '2026-11-10' },
  },
  {
    employeId: E3,
    employeNom: 'Zoé Roux',
    employeTri: 'roux zoé',
    matricule: null,
    managerId: M1,
    managerNom: 'Paul Martin',
    dateEntree: '2020-01-06',
    dernierEntretien: '2026-01-20',
    dernierEntretienId: null,
    prochaineEcheance: '2028-01-20',
    joursRestants: 458,
    statut: 'a_jour',
    echeanceBilan: '2032-01-06',
    statutBilan: 'a_jour',
    entretienPlanifie: null,
  },
];

function rendre(peutGerer = true) {
  const creerEntretien = vi.fn().mockResolvedValue({ ok: true, data: { id: NOUVEAU } });
  render(
    <SuiviLegalTable
      lignes={lignes}
      base={BASE}
      peutGerer={peutGerer}
      creerEntretien={creerEntretien}
    />,
  );
  return creerEntretien;
}

describe('SuiviLegalTable', () => {
  it('affiche échéances, retards et compteurs par statut', () => {
    rendre();
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.getByText('809 j de retard')).toBeInTheDocument();
    expect(screen.getByText('dans 27 j')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^en retard/i })).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: /^tous/i })).toHaveTextContent('3');
  });

  it('filtre par statut', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /^en retard/i }));
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.queryByText('Marc Petit')).not.toBeInTheDocument();
    expect(screen.queryByText('Zoé Roux')).not.toBeInTheDocument();
  });

  it('renvoie vers le dernier entretien et l’entretien déjà programmé', () => {
    rendre();
    expect(screen.getByRole('link', { name: '01/08/2022' })).toHaveAttribute(
      'href',
      `${BASE}/entretiens/${X1}`,
    );
    expect(
      screen.getByRole('link', { name: /professionnel prévu le 10\/11\/2026/i }),
    ).toHaveAttribute('href', `${BASE}/entretiens/${X2}`);
  });

  it('crée un état des lieux 6 ans quand le bilan est dû, puis ouvre la fiche', async () => {
    const creerEntretien = rendre();
    expect(
      screen.queryByRole('button', { name: 'Créer l’entretien de Zoé Roux' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’entretien de Léa Durand' }));
    await waitFor(() =>
      expect(creerEntretien).toHaveBeenCalledWith({
        campagneId: null,
        employeId: E1,
        evaluateurId: M1,
        typeEntretien: 'bilan_6_ans',
        datePrevue: null,
      }),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`${BASE}/entretiens/${NOUVEAU}`));
  });

  it('lecture seule : pas de création', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /créer l’entretien de/i })).not.toBeInTheDocument();
  });
});
