import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  PreparationPaie,
  type VariablePaieLigne,
} from '@/components/test-sirh/paie/preparation-paie';
import { syntheseParEmploye } from '@/lib/test-sirh/paie/synthese';

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

const PERIODE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const E1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';
const E2 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f72';

const variables: VariablePaieLigne[] = [
  {
    id: 'v1',
    employeId: E1,
    employeNom: 'Martin',
    employePrenom: 'Paul',
    matricule: 'M001',
    typeVariable: 'absence',
    libelle: 'Congés payés',
    codeRubrique: 'ABS-CP',
    quantite: '6.00',
    montant: null,
    source: 'absence',
    commentaire: 'Du 26/10/2026 au 04/11/2026 (CP)',
  },
  {
    id: 'v2',
    employeId: E1,
    employeNom: 'Martin',
    employePrenom: 'Paul',
    matricule: 'M001',
    typeVariable: 'prime',
    libelle: 'Prime de panier',
    codeRubrique: 'P100',
    quantite: null,
    montant: '150.00',
    source: 'manuelle',
    commentaire: null,
  },
  {
    id: 'v3',
    employeId: E2,
    employeNom: 'Bernard',
    employePrenom: 'Léa',
    matricule: null,
    typeVariable: 'remboursement_frais',
    libelle: 'Repas : Déjeuner',
    codeRubrique: null,
    quantite: null,
    montant: '18.50',
    source: 'note_frais',
    commentaire: null,
  },
];

const synthese = syntheseParEmploye(
  variables.map((v) => ({ ...v, majorationPct: null })),
  [
    { id: E1, nom: 'Martin', prenom: 'Paul', matricule: 'M001' },
    { id: E2, nom: 'Bernard', prenom: 'Léa', matricule: null },
  ],
);

function actions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    importer: vi.fn().mockResolvedValue({
      ok: true,
      data: {
        importees: { absence: 2, heures_sup: 0, note_frais: 1 },
        nbImportees: 3,
        dejaImportees: 0,
        ignorees: 0,
      },
    }),
  };
}

const props = {
  synthese,
  csv: 'Matricule;Nom',
  employes: [
    { id: E1, label: 'Martin Paul' },
    { id: E2, label: 'Bernard Léa' },
  ],
};

describe('PreparationPaie', () => {
  it('regroupe les variables par collaborateur', () => {
    render(
      <PreparationPaie
        {...props}
        periode={{ id: PERIODE, annee: 2026, mois: 10, statut: 'ouverte' }}
        variables={variables}
        aImporter={{ absence: 2, heures_sup: 0, note_frais: 1 }}
        actions={actions()}
      />,
    );
    expect(screen.getByText('Martin Paul')).toBeInTheDocument();
    expect(screen.getByText('Bernard Léa')).toBeInTheDocument();
    expect(screen.getByText('2 variables · 150,00 €')).toBeInTheDocument();
    expect(screen.getByText('Prime de panier')).toBeInTheDocument();
    expect(screen.getByText('ABS-CP')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('Note de frais')).toBeInTheDocument();
    expect(screen.getByText('2 absences et 1 note de frais')).toBeInTheDocument();
  });

  it('importe les éléments validés et résume le résultat', async () => {
    const a = actions();
    render(
      <PreparationPaie
        {...props}
        periode={{ id: PERIODE, annee: 2026, mois: 10, statut: 'en_controle' }}
        variables={variables}
        aImporter={{ absence: 2, heures_sup: 0, note_frais: 1 }}
        actions={a}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /importer les éléments validés \(3\)/i }));
    await waitFor(() => expect(a.importer).toHaveBeenCalledWith(PERIODE));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Import terminé : 2 absences et 1 note de frais.'),
    );
  });

  it('une période clôturée est en lecture seule', () => {
    render(
      <PreparationPaie
        {...props}
        periode={{ id: PERIODE, annee: 2026, mois: 9, statut: 'cloturee' }}
        variables={variables}
        aImporter={{ absence: 0, heures_sup: 0, note_frais: 0 }}
        actions={actions()}
      />,
    );
    expect(screen.getByText(/période clôturée/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /importer/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter une variable/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Supprimer' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter csv/i })).toBeEnabled();
  });

  it('bascule sur la synthèse par collaborateur', () => {
    render(
      <PreparationPaie
        {...props}
        periode={{ id: PERIODE, annee: 2026, mois: 10, statut: 'ouverte' }}
        variables={variables}
        aImporter={{ absence: 0, heures_sup: 0, note_frais: 0 }}
        actions={actions()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Synthèse par collaborateur' }));
    expect(screen.getByText('HS 25 %')).toBeInTheDocument();
    expect(screen.getByText('150,00 €')).toBeInTheDocument();
    expect(screen.getByText('18,50 €')).toBeInTheDocument();
  });

  it('ouvre la saisie d’une variable et supprime une variable', async () => {
    const a = actions();
    render(
      <PreparationPaie
        {...props}
        periode={{ id: PERIODE, annee: 2026, mois: 10, statut: 'ouverte' }}
        variables={[variables[1]!]}
        aImporter={{ absence: 0, heures_sup: 0, note_frais: 0 }}
        actions={a}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(a.supprimer).toHaveBeenCalledWith('v2'));

    fireEvent.click(screen.getByRole('button', { name: /ajouter une variable/i }));
    expect(await screen.findByText('Nouvelle variable de paie')).toBeInTheDocument();
    expect(screen.getByLabelText('Libellé')).toHaveValue('Prime');
  });

  it('signale une variable importée dont la source a été annulée', () => {
    render(
      <PreparationPaie
        {...props}
        periode={{ id: PERIODE, annee: 2026, mois: 10, statut: 'ouverte' }}
        variables={[{ ...variables[0]!, sourceObsolete: true }, variables[1]!]}
        aImporter={{ absence: 0, heures_sup: 0, note_frais: 0 }}
        actions={actions()}
      />,
    );
    expect(screen.getByText('Source annulée')).toBeInTheDocument();
    expect(
      screen.getByText(/1 variable importée n’a plus d’élément d’origine valide/),
    ).toBeInTheDocument();
  });

  it('affiche l’état vide et désactive l’export', () => {
    render(
      <PreparationPaie
        {...props}
        synthese={[]}
        periode={{ id: PERIODE, annee: 2026, mois: 10, statut: 'ouverte' }}
        variables={[]}
        aImporter={{ absence: 0, heures_sup: 0, note_frais: 0 }}
        actions={actions()}
      />,
    );
    expect(screen.getByText(/aucune variable pour cette période/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /exporter csv/i })).toBeDisabled();
  });
});
