import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { OffresSection } from '@/components/test-sirh/recrutement/offres-section';
import type { OffreLigne } from '@/lib/test-sirh/recrutement/queries';

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push, refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  // base-ui (Dialog, Select) s'appuie sur des API absentes de jsdom.
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
const O1 = '11111111-1111-4111-8111-111111111111';
const O2 = '22222222-2222-4222-8222-222222222222';
const P1 = '33333333-3333-4333-8333-333333333333';
const S1 = '44444444-4444-4444-8444-444444444444';
const E1 = '55555555-5555-4555-8555-555555555555';

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'nouvelle' } }),
  changerStatut: vi.fn().mockResolvedValue({ ok: true, data: { statut: 'publiee' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const options = {
  postes: [{ id: P1, label: 'Maçon (N2P1)' }],
  sites: [{ id: S1, label: 'Agence de Lyon' }],
  responsables: [{ id: E1, label: 'Bernard Paul', actif: true }],
};

const offres: OffreLigne[] = [
  {
    id: O1,
    reference: 'REC-01',
    titre: 'Maçon coffreur',
    posteId: P1,
    posteLibelle: 'Maçon (N2P1)',
    siteId: S1,
    siteNom: 'Agence de Lyon',
    typeContrat: 'cdi',
    description: null,
    profilRecherche: null,
    nbPostes: 2,
    salaireMin: '2000.00',
    salaireMax: '2400.00',
    statut: 'publiee',
    datePublication: '2026-10-01',
    dateCloture: null,
    responsableId: E1,
    responsableNom: 'Paul Bernard',
    nbCandidatures: 3,
    nbActives: 2,
    nbEmbauches: 1,
  },
  {
    id: O2,
    reference: null,
    titre: 'Conducteur de travaux',
    posteId: null,
    posteLibelle: null,
    siteId: null,
    siteNom: null,
    typeContrat: 'cdd',
    description: null,
    profilRecherche: null,
    nbPostes: 1,
    salaireMin: null,
    salaireMax: null,
    statut: 'brouillon',
    datePublication: null,
    dateCloture: null,
    responsableId: null,
    responsableNom: null,
    nbCandidatures: 0,
    nbActives: 0,
    nbEmbauches: 0,
  },
];

function rendre(peutGerer = true, liste = offres) {
  return render(
    <OffresSection
      offres={liste}
      base={BASE}
      peutGerer={peutGerer}
      options={options}
      actions={actions}
    />,
  );
}

describe('OffresSection', () => {
  it('affiche les offres, contrat, candidatures, salaire et statut', () => {
    rendre();
    expect(screen.getByText('Maçon coffreur')).toBeInTheDocument();
    expect(screen.getByText('REC-01')).toBeInTheDocument();
    expect(screen.getByText('Maçon (N2P1) · Agence de Lyon')).toBeInTheDocument();
    expect(screen.getByText('CDI')).toBeInTheDocument();
    expect(screen.getByText('CDD')).toBeInTheDocument();
    expect(screen.getByText('postes pourvus : 1 / 2')).toBeInTheDocument();
    expect(screen.getByText('2 000 – 2 400 €')).toBeInTheDocument();
    expect(screen.getByText('Publiée')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouvelle offre/i })).toBeInTheDocument();
  });

  it('masque les actions de gestion en lecture seule', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouvelle offre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /modifier/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('la ligne ouvre le pipeline de l’offre', () => {
    rendre(false);
    fireEvent.click(screen.getByText('Maçon coffreur'));
    expect(push).toHaveBeenCalledWith(`${BASE}/recrutement/offres/${O1}`);
  });

  it('affiche l’état vide', () => {
    render(
      <OffresSection
        offres={[]}
        base={BASE}
        peutGerer
        options={options}
        actions={actions}
        messageVide="Aucune offre au statut « Pourvue »."
      />,
    );
    expect(screen.getByText('Aucune offre au statut « Pourvue ».')).toBeInTheDocument();
  });

  it('demande confirmation puis supprime', async () => {
    rendre(true, [offres[1]!]);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    expect(screen.getByText('Supprimer cette offre ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.supprimer).toHaveBeenCalledWith(O2));
    expect(push).not.toHaveBeenCalled();
  });

  it('création : titre obligatoire, puis envoi des valeurs normalisées', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouvelle offre/i }));
    expect(screen.getByText('Nouvelle offre d’emploi')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Créer l’offre' }));
    await waitFor(() => expect(screen.getByText('Titre requis.')).toBeInTheDocument());
    expect(actions.enregistrer).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Intitulé de l’offre'), {
      target: { value: 'Chef d’équipe gros œuvre' },
    });
    fireEvent.change(screen.getByLabelText('Salaire brut mensuel min. (€)'), {
      target: { value: '2 300' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Créer l’offre' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          titre: 'Chef d’équipe gros œuvre',
          nbPostes: 1,
          typeContrat: 'cdi',
          statut: 'brouillon',
          salaireMin: '2300.00',
          salaireMax: null,
        }),
      ),
    );
  });

  it('édition : modale préremplie', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Maçon coffreur' }));
    expect(screen.getByText('Modifier l’offre')).toBeInTheDocument();
    expect(screen.getByLabelText('Intitulé de l’offre')).toHaveValue('Maçon coffreur');
    expect(screen.getByLabelText('Référence')).toHaveValue('REC-01');
  });

  it('refus serveur : message affiché dans la modale', async () => {
    actions.enregistrer.mockResolvedValueOnce({
      ok: false,
      error: 'Une offre porte déjà cette référence.',
    });
    rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Modifier Maçon coffreur' }));
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(screen.getByText('Une offre porte déjà cette référence.')).toBeInTheDocument(),
    );
  });

  it('changer le statut depuis la ligne ne déclenche pas la navigation (options en portail)', async () => {
    rendre(true, [offres[0]!]);
    const ligne = screen.getByText('Maçon coffreur').closest('tr')!;
    fireEvent.click(within(ligne).getByRole('combobox', { name: 'Changer le statut de l’offre' }));
    const option = await screen.findByRole('option', { name: 'Suspendre' });
    // Base UI ignore les relâchements de souris juste après l'ouverture.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    fireEvent.pointerDown(option, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseDown(option, { button: 0 });
    fireEvent.pointerUp(option, { pointerType: 'mouse', button: 0 });
    fireEvent.mouseUp(option, { button: 0 });
    fireEvent.click(option, { button: 0 });
    await waitFor(() =>
      expect(actions.changerStatut).toHaveBeenCalledWith({ id: O1, statut: 'suspendue' }),
    );
    expect(push).not.toHaveBeenCalled();
  });
});
