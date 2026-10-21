import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  InscriptionsSection,
  type InscriptionLigneUI,
} from '@/components/test-sirh/formation/inscriptions-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
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

const S1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const E1 = '7a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';
const E2 = '11111111-1111-4111-8111-111111111111';
const E3 = '22222222-2222-4222-8222-222222222222';
const I1 = '33333333-3333-4333-8333-333333333333';
const I2 = '44444444-4444-4444-8444-444444444444';

const inscriptions: InscriptionLigneUI[] = [
  {
    id: I1,
    employeId: E1,
    employeNom: 'Léa Durand',
    matricule: 'M001',
    statut: 'present',
    resultat: 'reussi',
    heuresRealisees: '14.00',
    dateValidite: '2026-12-01',
    commentaire: null,
  },
  {
    id: I2,
    employeId: E2,
    employeNom: 'Marc Petit',
    matricule: null,
    statut: 'inscrit',
    resultat: 'non_evalue',
    heuresRealisees: null,
    dateValidite: null,
    commentaire: 'Arrivée tardive',
  },
];

const employes = [
  { id: E1, label: 'Durand Léa', matricule: 'M001' },
  { id: E2, label: 'Petit Marc', matricule: null },
  { id: E3, label: 'Roux Zoé', matricule: 'M003' },
];

function creerActions() {
  return {
    inscrire: vi.fn().mockResolvedValue({ ok: true, data: { inscrits: 1, dejaInscrits: 0 } }),
    modifier: vi.fn().mockResolvedValue({ ok: true, data: { id: I2 } }),
    retirer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
}

function rendre(
  props: Partial<{ placesRestantes: number | null; peutGerer: boolean }> = {},
  actions = creerActions(),
) {
  render(
    <InscriptionsSection
      sessionId={S1}
      sessionStatut="planifiee"
      dateFinSession="2026-10-16"
      validiteMois={24}
      placesRestantes={props.placesRestantes === undefined ? 1 : props.placesRestantes}
      inscriptions={inscriptions}
      employes={employes}
      peutGerer={props.peutGerer ?? true}
      today="2026-10-19"
      actions={actions}
    />,
  );
  return actions;
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

describe('InscriptionsSection', () => {
  it('affiche participants, présence, résultats et validité', () => {
    rendre();
    expect(screen.getByText('2 participants · 1 place restante')).toBeInTheDocument();
    expect(screen.getByText('Léa Durand')).toBeInTheDocument();
    expect(screen.getByText('Réussi')).toBeInTheDocument();
    expect(screen.getByText('01/12/2026')).toBeInTheDocument();
    expect(screen.getByText('À recycler')).toBeInTheDocument();
    expect(screen.getByText('14 h')).toBeInTheDocument();
    expect(screen.getByText('Arrivée tardive')).toBeInTheDocument();
  });

  it('inscrit les collaborateurs cochés (déjà inscrits exclus)', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: /inscrire des collaborateurs/i }));
    const roux = await screen.findByRole('checkbox', { name: /roux zoé/i });
    expect(screen.queryByRole('checkbox', { name: /durand léa/i })).not.toBeInTheDocument();
    fireEvent.click(roux);
    expect(screen.getByText('1 sélectionné')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Inscrire' }));
    await waitFor(() =>
      expect(actions.inscrire).toHaveBeenCalledWith({ sessionId: S1, employeIds: [E3] }),
    );
  });

  it('exige au moins une sélection', async () => {
    const actions = rendre({ placesRestantes: null });
    fireEvent.click(screen.getByRole('button', { name: /inscrire des collaborateurs/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Inscrire' }));
    expect(await screen.findByText('Sélectionnez au moins un collaborateur.')).toBeInTheDocument();
    expect(actions.inscrire).not.toHaveBeenCalled();
  });

  it('session complète : ajout désactivé', () => {
    rendre({ placesRestantes: 0 });
    expect(screen.getByRole('button', { name: /inscrire des collaborateurs/i })).toBeDisabled();
  });

  it('enregistre la présence et le résultat avec aperçu de validité', async () => {
    const actions = rendre();
    fireEvent.click(
      screen.getByRole('button', { name: 'Modifier la participation de Marc Petit' }),
    );
    await choisirOption('Présence', 'Présent·e');
    await choisirOption('Résultat', 'Réussi');
    expect(
      await screen.findByText('Qualification valable jusqu’au 16/10/2028.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(actions.modifier).toHaveBeenCalledWith(
        expect.objectContaining({ id: I2, statut: 'present', resultat: 'reussi' }),
      ),
    );
  });

  it('retire un participant après confirmation', async () => {
    const actions = rendre();
    fireEvent.click(screen.getAllByRole('button', { name: 'Retirer' })[1]!);
    expect(screen.getByText('Retirer ce participant ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Retirer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(actions.retirer).toHaveBeenCalledWith(I2));
  });

  it('lecture seule : aucune action', () => {
    rendre({ peutGerer: false });
    expect(
      screen.queryByRole('button', { name: /inscrire des collaborateurs/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retirer' })).not.toBeInTheDocument();
  });
});
