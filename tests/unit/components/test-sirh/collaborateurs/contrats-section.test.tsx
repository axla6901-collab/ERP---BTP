import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ContratsSection,
  type ContratLigneUI,
} from '@/components/test-sirh/collaborateurs/contrats-section';
import type { PrefillFicheRh } from '@/lib/test-sirh/collaborateurs/saisie-contrat';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const C_ANCIEN = '1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const C_COURANT = '8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

function contrat(partiel: Partial<ContratLigneUI> & { id: string }): ContratLigneUI {
  return {
    typeContrat: 'cdi',
    motifRecours: null,
    dateDebut: '2024-01-08',
    dateFin: null,
    dateFinPeriodeEssai: null,
    motifFin: null,
    posteId: null,
    posteIntitule: null,
    intitulePoste: 'Maçon',
    categorie: 'ouvrier',
    niveau: 'N2',
    coefficient: '185',
    tempsTravail: 'temps_plein',
    heuresHebdo: '35.00',
    joursForfait: null,
    conventionCollective: 'BTP',
    societeId: null,
    societeLibelle: null,
    siteId: null,
    siteNom: null,
    notes: null,
    salaireBrutMensuel: null,
    tauxHoraireBrut: null,
    ...partiel,
  };
}

const historique: ContratLigneUI[] = [
  contrat({
    id: C_ANCIEN,
    typeContrat: 'cdd',
    motifRecours: 'Accroissement temporaire d’activité',
    dateDebut: '2023-03-01',
    dateFin: '2023-12-31',
    intitulePoste: 'Manœuvre',
  }),
  contrat({
    id: C_COURANT,
    dateDebut: '2024-01-01',
    dateFinPeriodeEssai: '2026-10-27',
    intitulePoste: 'Chef d’équipe',
    salaireBrutMensuel: '2650.00',
    tauxHoraireBrut: '17.47',
  }),
];

const options = {
  postes: [
    {
      id: '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e',
      label: 'Coffreur (N3)',
      intitule: 'Coffreur',
      categorie: 'ouvrier' as const,
      niveau: 'N3',
      coefficient: '210',
    },
  ],
  sites: [],
  societes: [],
};

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'n', versionsCloses: [] } }),
  terminer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const prefill: PrefillFicheRh = {
  typeContrat: 'cdi',
  dateDebut: '2024-01-01',
  dateFin: null,
  intitulePoste: 'Maçon qualifié',
  categorie: 'ouvrier',
  coefficient: '210',
  heuresHebdo: '39.00',
  conventionCollective: 'Bâtiment',
  salaireBrutMensuel: null,
  tauxHoraireBrut: null,
};

function rendre(
  opts: { peutGerer?: boolean; avecRemuneration?: boolean; contrats?: ContratLigneUI[] } = {},
) {
  return render(
    <ContratsSection
      employeId={EMPLOYE}
      contrats={opts.contrats ?? historique}
      today={TODAY}
      peutGerer={opts.peutGerer ?? true}
      avecRemuneration={opts.avecRemuneration ?? true}
      options={options}
      prefill={prefill}
      actions={actions}
    />,
  );
}

describe('ContratsSection', () => {
  it('affiche l’historique, met en évidence la version en cours et l’alerte de fin d’essai', () => {
    rendre();
    expect(screen.getByText('Chef d’équipe')).toBeInTheDocument();
    expect(screen.getByText('Manœuvre')).toBeInTheDocument();
    expect(screen.getByText('En cours')).toBeInTheDocument();
    expect(screen.getByText('Remplacée')).toBeInTheDocument();
    expect(screen.getByText('Accroissement temporaire d’activité')).toBeInTheDocument();
    expect(screen.getAllByText('Ouvrier · N2 · coef. 185')).toHaveLength(2);
    const ligneCourante = screen.getByText('Chef d’équipe').closest('tr');
    expect(ligneCourante).toHaveAttribute('aria-current', 'true');
    expect(screen.getByText('Fin de période d’essai le 27/10/2026 (dans 8 j)')).toBeInTheDocument();
  });

  it('affiche la rémunération seulement avec le droit PAIE', () => {
    rendre();
    expect(screen.getByText('2 650,00 € / mois')).toBeInTheDocument();
    expect(screen.getByText('17,47 € / h')).toBeInTheDocument();
    cleanup();
    rendre({
      avecRemuneration: false,
      contrats: historique.map((c) => ({ ...c, salaireBrutMensuel: null, tauxHoraireBrut: null })),
    });
    expect(screen.queryByText('Rémunération')).not.toBeInTheDocument();
  });

  it('lecture seule : aucune action de gestion', () => {
    rendre({ peutGerer: false });
    expect(screen.queryByRole('button', { name: /nouveau contrat/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /terminer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
  });

  it('« Terminer » seulement sur la dernière version, avec motif suggéré', async () => {
    rendre();
    const boutons = screen.getAllByRole('button', { name: /terminer/i });
    expect(boutons).toHaveLength(1);
    fireEvent.click(boutons[0]!);
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByLabelText('Date de fin effective')).toHaveValue(TODAY);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Terminer le contrat' }));
    await waitFor(() =>
      expect(actions.terminer).toHaveBeenCalledWith({
        id: C_COURANT,
        dateFin: TODAY,
        motifFin: 'demission',
      }),
    );
  });

  it('nouveau contrat : CDI par défaut, sans rémunération transmise sans droit PAIE', async () => {
    rendre({ avecRemuneration: false });
    fireEvent.click(screen.getByRole('button', { name: /nouveau contrat/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText(/salaire brut mensuel/i)).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Intitulé du poste (figé)'), {
      target: { value: 'Chef de chantier' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Créer le contrat' }));
    await waitFor(() =>
      expect(actions.enregistrer).toHaveBeenCalledWith(
        expect.objectContaining({
          employeId: EMPLOYE,
          typeContrat: 'cdi',
          dateDebut: TODAY,
          intitulePoste: 'Chef de chantier',
          tempsTravail: 'temps_plein',
          heuresHebdo: '35.00',
          salaireBrutMensuel: null,
          tauxHoraireBrut: null,
        }),
      ),
    );
  });

  it('pré-remplit depuis la fiche RH', () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /nouveau contrat/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(
      within(dialog).getByRole('button', { name: /pré-remplir depuis la fiche rh/i }),
    );
    expect(within(dialog).getByLabelText('Intitulé du poste (figé)')).toHaveValue('Maçon qualifié');
    expect(within(dialog).getByLabelText('Date de début')).toHaveValue('2024-01-01');
    expect(within(dialog).getByLabelText('Heures hebdomadaires')).toHaveValue('39.00');
    expect(within(dialog).getByLabelText('Convention collective')).toHaveValue('Bâtiment');
  });

  it('refuse un CDD sans date de fin ni motif de recours (validation client)', async () => {
    rendre({
      contrats: [contrat({ id: C_COURANT, typeContrat: 'cdd', dateDebut: '2026-09-01' })],
    });
    fireEvent.click(screen.getByRole('button', { name: /modifier le contrat du 01\/09\/2026/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(
      await within(dialog).findByText(/date de fin requise pour un contrat à terme/i),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        'Motif de recours obligatoire pour un CDD ou une mission d’intérim.',
      ),
    ).toBeInTheDocument();
    expect(actions.enregistrer).not.toHaveBeenCalled();
  });

  it('état vide', () => {
    rendre({ contrats: [] });
    expect(screen.getByText(/aucun contrat enregistré dans le sirh/i)).toBeInTheDocument();
  });
});
