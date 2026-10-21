import '@testing-library/jest-dom/vitest';
import type { ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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
  HabilitationsTable,
  type QualificationLigneUI,
} from '@/components/test-sirh/formation/habilitations-table';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const BASE = '/acme/test-sirh';
const E1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const E2 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const E3 = '11111111-1111-4111-8111-111111111111';
const F1 = '22222222-2222-4222-8222-222222222222';
const F2 = '33333333-3333-4333-8333-333333333333';
const S1 = '44444444-4444-4444-8444-444444444444';
const S2 = '55555555-5555-4555-8555-555555555555';
const S3 = '66666666-6666-4666-8666-666666666666';
const S4 = '77777777-7777-4777-8777-777777777777';
const EQ1 = '88888888-8888-4888-8888-888888888888';

const base: Omit<
  QualificationLigneUI,
  'inscriptionId' | 'employeId' | 'employeNom' | 'employeTri'
> = {
  sessionId: S1,
  matricule: null,
  formationId: F1,
  formationIntitule: 'Sauveteur secouriste du travail',
  formationCode: 'SST',
  categorie: 'securite',
  dateObtention: '2024-10-01',
  dateValidite: '2026-10-01',
  statut: 'expiree',
  joursRestants: -18,
  recyclagePlanifie: null,
  equipeIds: [],
};

const qualifications: QualificationLigneUI[] = [
  {
    ...base,
    inscriptionId: 'q1',
    employeId: E1,
    employeNom: 'Léa Durand',
    employeTri: 'durand léa',
    equipeIds: [EQ1],
  },
  {
    ...base,
    inscriptionId: 'q2',
    employeId: E2,
    employeNom: 'Marc Petit',
    employeTri: 'petit marc',
    formationId: F2,
    formationIntitule: 'CACES R489',
    formationCode: null,
    categorie: 'reglementaire',
    dateValidite: '2026-12-01',
    statut: 'a_recycler',
    joursRestants: 43,
    recyclagePlanifie: { sessionId: S2, dateDebut: '2026-11-20' },
  },
  {
    ...base,
    inscriptionId: 'q3',
    employeId: E3,
    employeNom: 'Zoé Roux',
    employeTri: 'roux zoé',
    dateValidite: '2028-03-01',
    statut: 'valide',
    joursRestants: 499,
    equipeIds: [EQ1],
  },
];

const sessionsAVenir = [
  {
    id: S3,
    formationId: F1,
    dateDebut: '2026-11-05',
    dateFin: '2026-11-06',
    lieu: 'Centre de Lyon',
    placesRestantes: 4,
  },
  {
    id: S4,
    formationId: F2,
    dateDebut: '2026-11-12',
    dateFin: '2026-11-12',
    lieu: null,
    placesRestantes: null,
  },
];

function rendre(peutGerer = true) {
  const inscrire = vi.fn().mockResolvedValue({ ok: true, data: { inscrits: 1, dejaInscrits: 0 } });
  render(
    <HabilitationsTable
      qualifications={qualifications}
      formations={[
        { id: F2, label: 'CACES R489' },
        { id: F1, label: 'Sauveteur secouriste du travail' },
      ]}
      equipes={[{ id: EQ1, label: 'Équipe gros œuvre' }]}
      sessionsAVenir={sessionsAVenir}
      base={BASE}
      peutGerer={peutGerer}
      inscrire={inscrire}
    />,
  );
  return inscrire;
}

/** Choisit une option d'un `OptionSelect` (Base UI) au clavier — fiable sous jsdom. */
async function choisirOption(nomListe: string, nomOption: string) {
  const declencheur = screen.getByRole('combobox', { name: nomListe });
  declencheur.focus();
  fireEvent.keyDown(declencheur, { key: 'ArrowDown' });
  const option = await screen.findByRole('option', { name: nomOption });
  option.focus();
  fireEvent.keyDown(option, { key: 'Enter' });
}

describe('HabilitationsTable', () => {
  it('affiche validité, statut et compteurs', () => {
    rendre();
    expect(screen.getByText('expirée depuis 18 j')).toBeInTheDocument();
    expect(screen.getByText('dans 43 j')).toBeInTheDocument();
    expect(screen.getByText('Expirée')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^toutes/i })).toHaveTextContent('3');
    expect(screen.getByRole('button', { name: /^expirées/i })).toHaveTextContent('1');
  });

  it('filtre par statut', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /^expirées/i }));
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.queryByText('Marc Petit')).not.toBeInTheDocument();
    expect(screen.queryByText('Zoé Roux')).not.toBeInTheDocument();
  });

  it('filtre par équipe', async () => {
    rendre();
    await choisirOption('Filtrer par équipe', 'Équipe gros œuvre');
    await waitFor(() => expect(screen.queryByText('Marc Petit')).not.toBeInTheDocument());
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.getByText('Zoé Roux')).toBeInTheDocument();
  });

  it('recyclage déjà programmé : lien vers la session', () => {
    rendre();
    expect(screen.getByRole('link', { name: 'Inscrit le 20/11/2026' })).toHaveAttribute(
      'href',
      `${BASE}/formation/sessions/${S2}`,
    );
  });

  it('inscrit à une session à venir de la même formation', async () => {
    const inscrire = rendre();
    expect(screen.queryByRole('button', { name: /inscrire zoé roux/i })).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Inscrire Léa Durand à une session de Sauveteur secouriste du travail',
      }),
    );
    expect(
      await screen.findByText('Léa Durand — Sauveteur secouriste du travail'),
    ).toBeInTheDocument();
    expect(screen.getByText('Centre de Lyon')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(1);
    fireEvent.click(screen.getByRole('radio'));
    fireEvent.click(screen.getByRole('button', { name: 'Inscrire' }));
    await waitFor(() => expect(inscrire).toHaveBeenCalledWith({ sessionId: S3, employeIds: [E1] }));
  });

  it('lecture seule : pas d’inscription', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /inscrire léa durand/i })).not.toBeInTheDocument();
  });
});
