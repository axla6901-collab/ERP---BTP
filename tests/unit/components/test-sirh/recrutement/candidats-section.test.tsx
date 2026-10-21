import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { CandidatsSection } from '@/components/test-sirh/recrutement/candidats-section';
import type { CandidatLigne } from '@/lib/test-sirh/recrutement/queries';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

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

function candidat(id: string, prenom: string, nom: string, extra: Partial<CandidatLigne> = {}) {
  return {
    id,
    nom,
    prenom,
    email: null,
    telephone: null,
    ville: null,
    source: 'cooptation',
    consentementRgpd: false,
    dateConsentement: null,
    employeId: null,
    nbCandidatures: 0,
    nbActives: 0,
    derniereActivite: '2026-10-01',
    aPurger: false,
    ...extra,
  } satisfies CandidatLigne;
}

const candidats: CandidatLigne[] = [
  candidat('k1', 'Léa', 'Durand', {
    email: 'lea@exemple.fr',
    telephone: '06 11 22 33 44',
    ville: 'Lyon',
    nbCandidatures: 2,
    nbActives: 1,
    consentementRgpd: true,
    dateConsentement: '2026-09-01',
  }),
  candidat('k2', 'Marc', 'Ancien', { derniereActivite: '2023-05-02', aPurger: true }),
  candidat('k3', 'Zoé', 'Blanc', { employeId: 'emp-5', source: 'ecole' }),
];

const actions = { enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'nouveau' } }) };

function rendre(peutGerer = true) {
  render(
    <CandidatsSection
      candidats={candidats}
      base={BASE}
      today="2026-10-19"
      peutGerer={peutGerer}
      actions={actions}
    />,
  );
}

describe('CandidatsSection', () => {
  it('affiche le vivier : contact, source, candidatures, activité et statuts', () => {
    rendre();
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.getByText('lea@exemple.fr')).toBeInTheDocument();
    expect(screen.getByText('Lyon')).toBeInTheDocument();
    expect(screen.getAllByText('Cooptation')).toHaveLength(2);
    expect(screen.getByText('École / CFA')).toBeInTheDocument();
    expect(screen.getByText('02/05/2023')).toBeInTheDocument();
    expect(screen.getByText('À purger (RGPD)')).toBeInTheDocument();
    expect(screen.getByText('Embauché·e')).toBeInTheDocument();
    expect(screen.getByText('Consentement RGPD')).toBeInTheDocument();
  });

  it('la ligne ouvre la fiche candidat', () => {
    rendre(false);
    fireEvent.click(screen.getByText('Marc Ancien'));
    expect(push).toHaveBeenCalledWith(`${BASE}/recrutement/candidats/k2`);
  });

  it('recherche par nom, email ou ville', () => {
    rendre();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Rechercher' }), {
      target: { value: 'lyon' },
    });
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.queryByText('Marc Ancien')).not.toBeInTheDocument();
  });

  it('lecture seule : pas de création', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouveau candidat/i })).not.toBeInTheDocument();
  });

  it('création : nom et prénom requis, puis ouverture de la fiche créée', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouveau candidat/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Créer le candidat' }));
    await waitFor(() => expect(screen.getByText('Nom requis.')).toBeInTheDocument());
    expect(screen.getByText('Prénom requis.')).toBeInTheDocument();
    expect(actions.enregistrer).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Hugo' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Martin' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'hugo@exemple.fr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le candidat' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          nom: 'Martin',
          prenom: 'Hugo',
          email: 'hugo@exemple.fr',
          source: 'candidature_spontanee',
          consentementRgpd: false,
          dateConsentement: null,
        }),
      ),
    );
    await waitFor(() => expect(push).toHaveBeenCalledWith(`${BASE}/recrutement/candidats/nouveau`));
  });

  it('email déjà utilisé : message d’unicité sur le champ', async () => {
    actions.enregistrer.mockResolvedValueOnce({
      ok: false,
      error: 'Un candidat avec cet email existe déjà dans le vivier.',
      fieldErrors: { email: ['Un candidat avec cet email existe déjà dans le vivier.'] },
    });
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouveau candidat/i }));
    fireEvent.change(screen.getByLabelText('Prénom'), { target: { value: 'Léa' } });
    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Durand' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'LEA@exemple.fr' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer le candidat' }));
    await waitFor(() =>
      expect(
        screen.getAllByText('Un candidat avec cet email existe déjà dans le vivier.'),
      ).toHaveLength(2),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
