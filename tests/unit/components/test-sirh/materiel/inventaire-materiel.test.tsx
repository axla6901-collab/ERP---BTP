import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { InventaireMateriel } from '@/components/test-sirh/materiel/inventaire-materiel';
import type { AttributionLigne, MaterielLigne } from '@/lib/test-sirh/materiel/queries';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!('PointerEvent' in window)) {
    // @ts-expect-error polyfill minimal pour jsdom (le Switch construit un PointerEvent au clic)
    window.PointerEvent = class extends MouseEvent {};
    // @ts-expect-error idem côté global
    globalThis.PointerEvent = window.PointerEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const M_STOCK = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const M_ATTRIBUE = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';
const M_REFORME = '5c8e1a2b-3d4f-4a6b-9c7d-8e9f0a1b2c3d';
const EMPLOYE = '7d9e2f3a-4b5c-4d6e-8f7a-9b0c1d2e3f4a';

const attributionEnCours: AttributionLigne = {
  id: 'a1',
  materielId: M_ATTRIBUE,
  employeId: EMPLOYE,
  employeNom: 'Marc Dubois',
  dateRemise: '2026-09-01',
  dateRetour: null,
  etatRemise: 'Neuf',
  etatRetour: null,
  dechargeSignee: false,
  commentaire: null,
};

function materiel(
  partiel: Partial<MaterielLigne> & { id: string; libelle: string },
): MaterielLigne {
  return {
    categorie: 'epi',
    marque: null,
    modele: null,
    numeroSerie: null,
    taille: null,
    dateAchat: null,
    valeurAchat: null,
    dateFinGarantie: null,
    dateControle: null,
    statut: 'en_stock',
    notes: null,
    detenteur: null,
    historique: [],
    ...partiel,
  };
}

const MATERIELS = [
  materiel({
    id: M_STOCK,
    libelle: 'Casque de chantier',
    marque: 'Petzl',
    modele: 'Vertex',
    taille: 'L',
    valeurAchat: 59.9,
    dateControle: '2026-10-01',
  }),
  materiel({
    id: M_ATTRIBUE,
    libelle: 'Ordinateur portable',
    categorie: 'informatique',
    numeroSerie: 'SN-42',
    statut: 'attribue',
    valeurAchat: 1200,
    detenteur: attributionEnCours,
    historique: [attributionEnCours],
  }),
  materiel({
    id: M_REFORME,
    libelle: 'Harnais usé',
    statut: 'reforme',
    historique: [
      {
        ...attributionEnCours,
        id: 'a0',
        materielId: M_REFORME,
        dateRemise: '2025-01-10',
        dateRetour: '2026-06-30',
        etatRetour: 'Sangle effilochée',
        dechargeSignee: true,
      },
    ],
  }),
];

function actions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: M_STOCK } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    attribuer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'a2' } }),
    restituer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

function rendre(peutGerer = true, a = actions()) {
  render(
    <InventaireMateriel
      materiels={MATERIELS}
      today={TODAY}
      peutGerer={peutGerer}
      employes={[{ id: EMPLOYE, label: 'Dubois Marc' }]}
      actions={a}
    />,
  );
  return a;
}

function ligne(texte: string): HTMLElement {
  return screen.getAllByRole('row').find((r) => within(r).queryByText(texte))!;
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

describe('InventaireMateriel', () => {
  it('affiche statut, détenteur, décharge, contrôle et valeur', () => {
    rendre();
    expect(screen.getByText('Petzl Vertex')).toBeInTheDocument();
    expect(screen.getByText('Taille L')).toBeInTheDocument();
    expect(screen.getByText('En stock')).toBeInTheDocument();
    expect(screen.getByText('Attribué')).toBeInTheDocument();
    expect(screen.getByText('Réformé')).toBeInTheDocument();
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    expect(screen.getByText('Décharge non signée')).toBeInTheDocument();
    expect(screen.getByText('Dépassé')).toBeInTheDocument();
    expect(screen.getByText('1 200,00 €')).toBeInTheDocument();
  });

  it('propose les actions selon le cycle de vie', () => {
    rendre();
    const stock = ligne('Casque de chantier');
    expect(within(stock).getByRole('button', { name: /attribuer/i })).toBeInTheDocument();
    expect(within(stock).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(within(stock).queryByRole('button', { name: /historique/i })).toBeNull();

    const attribue = ligne('Ordinateur portable');
    expect(within(attribue).getByRole('button', { name: /restituer/i })).toBeInTheDocument();
    expect(within(attribue).queryByRole('button', { name: /^attribuer/i })).toBeNull();
    // Historique d'attribution : suppression remplacée par la réforme.
    expect(within(attribue).queryByRole('button', { name: 'Supprimer' })).toBeNull();

    const reforme = ligne('Harnais usé');
    expect(within(reforme).queryByRole('button', { name: /attribuer|restituer/i })).toBeNull();
    expect(within(reforme).getByRole('button', { name: /historique/i })).toBeInTheDocument();
  });

  it('lecture seule : seul l’historique reste consultable', () => {
    rendre(false);
    expect(screen.queryByRole('button', { name: /nouveau matériel/i })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /attribuer|restituer|supprimer|modifier/i }),
    ).toBeNull();
    expect(screen.getAllByRole('button', { name: /historique/i })).toHaveLength(2);
  });

  it('attribue un matériel en stock à un collaborateur', async () => {
    const a = rendre();
    fireEvent.click(
      within(ligne('Casque de chantier')).getByRole('button', { name: /attribuer/i }),
    );
    await screen.findByText('Attribuer le matériel');
    await choisirOption('Collaborateur', 'Dubois Marc');
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Attribuer' }));
    await waitFor(() =>
      expect(a.attribuer).toHaveBeenCalledWith(
        expect.objectContaining({
          materielId: M_STOCK,
          employeId: EMPLOYE,
          dateRemise: TODAY,
          dechargeSignee: true,
        }),
      ),
    );
  });

  it('restitue : refuse un retour antérieur à la remise, puis signale une réparation', async () => {
    const a = rendre();
    fireEvent.click(
      within(ligne('Ordinateur portable')).getByRole('button', { name: /restituer/i }),
    );
    const date = await screen.findByLabelText('Date de retour');
    fireEvent.change(date, { target: { value: '2026-08-15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Restituer' }));
    expect(
      await screen.findByText(/postérieure ou égale à la date de remise/i),
    ).toBeInTheDocument();
    expect(a.restituer).not.toHaveBeenCalled();

    fireEvent.change(date, { target: { value: '2026-10-18' } });
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(screen.getByRole('button', { name: 'Restituer' }));
    await waitFor(() =>
      expect(a.restituer).toHaveBeenCalledWith(
        expect.objectContaining({
          materielId: M_ATTRIBUE,
          dateRetour: '2026-10-18',
          signalerReparation: true,
        }),
      ),
    );
  });

  it('affiche l’historique des attributions', async () => {
    rendre(false);
    fireEvent.click(within(ligne('Harnais usé')).getByRole('button', { name: /historique/i }));
    expect(await screen.findByText('Historique des attributions')).toBeInTheDocument();
    expect(screen.getByText('Sangle effilochée')).toBeInTheDocument();
    expect(screen.getByText('Signée')).toBeInTheDocument();
  });

  it('supprime un matériel jamais attribué après confirmation', async () => {
    const a = rendre();
    const stock = ligne('Casque de chantier');
    fireEvent.click(within(stock).getByRole('button', { name: 'Supprimer' }));
    fireEvent.click(within(stock).getAllByRole('button', { name: 'Supprimer' }).at(-1)!);
    await waitFor(() => expect(a.supprimer).toHaveBeenCalledWith(M_STOCK));
  });
});
