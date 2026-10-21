import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ProcessusListe } from '@/components/test-sirh/onboarding/processus-liste';
import type { ProcessusLigne } from '@/lib/test-sirh/onboarding/types';

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const BASE = '/acme/test-sirh/onboarding';

const ligne = (p: Partial<ProcessusLigne> & { id: string }): ProcessusLigne => ({
  libelle: 'Intégration compagnon BTP — Jean Dupont',
  typeProcessus: 'onboarding',
  statut: 'en_cours',
  dateReference: '2026-11-02',
  employeId: 'e1',
  employeNom: 'Jean Dupont',
  modeleId: 'm1',
  modeleNom: 'Intégration compagnon BTP',
  faites: 3,
  total: 10,
  pourcent: 30,
  ouvertes: 7,
  enRetard: 0,
  prochaineEcheance: '2026-10-28',
  terminable: false,
  createdAt: '2026-10-01T08:00:00.000Z',
  ...p,
});

const processus: ProcessusLigne[] = [
  ligne({ id: 'p1', enRetard: 2, prochaineEcheance: '2026-10-15' }),
  ligne({
    id: 'p2',
    typeProcessus: 'offboarding',
    employeNom: 'Marie Curie',
    libelle: 'Départ — Marie Curie',
    dateReference: '2026-12-31',
  }),
  ligne({ id: 'p3', statut: 'termine', employeNom: 'Paul Martin', libelle: 'Intégration — Paul' }),
];

describe('ProcessusListe', () => {
  it('affiche par défaut les processus en cours en cartes, avec progression et retard', () => {
    render(<ProcessusListe processus={processus} today={TODAY} baseFiches={BASE} />);
    expect(screen.getByText('Jean Dupont')).toBeInTheDocument();
    expect(screen.getByText('Marie Curie')).toBeInTheDocument();
    expect(screen.queryByText('Paul Martin')).not.toBeInTheDocument();
    expect(screen.getByText('2 en retard')).toBeInTheDocument();
    expect(screen.getByText('Date de départ')).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(2);
    expect(screen.getByText('Jean Dupont').closest('a')).toHaveAttribute('href', `${BASE}/p1`);
  });

  it('filtre par type et par statut', () => {
    render(<ProcessusListe processus={processus} today={TODAY} baseFiches={BASE} />);
    fireEvent.click(screen.getByRole('button', { name: /^offboarding/i }));
    expect(screen.queryByText('Jean Dupont')).not.toBeInTheDocument();
    expect(screen.getByText('Marie Curie')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^tous les types/i }));
    fireEvent.click(screen.getByRole('button', { name: /^terminé/i }));
    expect(screen.getByText('Paul Martin')).toBeInTheDocument();
    expect(screen.queryByText('Marie Curie')).not.toBeInTheDocument();
  });

  it('bascule en vue tableau (lignes cliquables vers la fiche)', () => {
    render(<ProcessusListe processus={processus} today={TODAY} baseFiches={BASE} />);
    fireEvent.click(screen.getByRole('button', { name: /tableau/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    // En-tête + 2 processus en cours.
    expect(screen.getAllByRole('row')).toHaveLength(3);
  });

  it('affiche l’état vide', () => {
    render(<ProcessusListe processus={[]} today={TODAY} baseFiches={BASE} />);
    expect(screen.getByText(/aucun processus\. lancez un onboarding/i)).toBeInTheDocument();
  });
});
