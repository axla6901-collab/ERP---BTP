import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/',
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import {
  CompteProrataTab,
  type DepenseView,
  type ParticipantView,
} from '@/components/compte-prorata/compte-prorata-tab';
import { calculerBilan } from '@/lib/chantiers/compte-prorata';

const participants: ParticipantView[] = [
  {
    id: 'g',
    libelle: 'Ma société (gestionnaire)',
    sousTraitantId: null,
    sousTraitantNom: null,
    montantMarcheHt: '20000.00',
    quotePartPctManuel: null,
    estGestionnaire: true,
    notes: null,
  },
  {
    id: 'a',
    libelle: 'Lot maçonnerie',
    sousTraitantId: null,
    sousTraitantNom: 'SARL Maçon',
    montantMarcheHt: '60000.00',
    quotePartPctManuel: null,
    estGestionnaire: false,
    notes: null,
  },
];

const depenses: DepenseView[] = [
  {
    id: 'd1',
    dateDepense: '2026-06-01',
    libelle: 'Benne',
    categorie: 'Benne / évacuation',
    montantHt: '500.00',
    avanceParParticipantId: 'a',
    avanceParLibelle: 'Lot maçonnerie',
    notes: null,
  },
];

const bilan = calculerBilan(
  participants.map((p) => ({
    id: p.id,
    libelle: p.libelle,
    montantMarcheHt: p.montantMarcheHt,
    quotePartPctManuel: p.quotePartPctManuel,
    estGestionnaire: p.estGestionnaire,
  })),
  depenses.map((d) => ({
    id: d.id,
    avanceParParticipantId: d.avanceParParticipantId,
    montantHt: d.montantHt,
  })),
  null,
);

const noop = vi.fn().mockResolvedValue({ ok: true });
const actions = {
  enregistrerParticipant: noop,
  supprimerParticipant: noop,
  enregistrerDepense: noop,
  supprimerDepense: noop,
  arreter: noop,
  rouvrir: noop,
};

function renderTab(over: { peutEcrire?: boolean; peutArreter?: boolean; statut?: 'ouvert' | 'arrete' } = {}) {
  return render(
    <CompteProrataTab
      compteId="cp1"
      statut={over.statut ?? 'ouvert'}
      fraisGestionPct={null}
      participants={participants}
      depenses={depenses}
      bilan={bilan}
      sousTraitants={[]}
      today="2026-06-10"
      peutEcrire={over.peutEcrire ?? false}
      peutArreter={over.peutArreter ?? false}
      actions={actions}
    />,
  );
}

afterEach(() => cleanup());

describe('CompteProrataTab — gating des actions', () => {
  it('masque les actions d’écriture sans droit', () => {
    renderTab({ peutEcrire: false, peutArreter: false });
    expect(screen.queryByText('Ajouter une dépense')).not.toBeInTheDocument();
    expect(screen.queryByText('Ajouter un participant')).not.toBeInTheDocument();
    expect(screen.queryByText('Arrêter le compte')).not.toBeInTheDocument();
  });

  it('affiche les actions d’écriture et d’arrêté avec les droits (compte ouvert)', () => {
    renderTab({ peutEcrire: true, peutArreter: true, statut: 'ouvert' });
    expect(screen.getByText('Ajouter une dépense')).toBeInTheDocument();
    expect(screen.getByText('Ajouter un participant')).toBeInTheDocument();
    expect(screen.getByText('Arrêter le compte')).toBeInTheDocument();
  });

  it('n’affiche pas « Arrêter » sur un compte déjà arrêté', () => {
    renderTab({ peutEcrire: true, peutArreter: true, statut: 'arrete' });
    expect(screen.queryByText('Arrêter le compte')).not.toBeInTheDocument();
    // Compte arrêté ⇒ lecture seule : pas de boutons d'ajout.
    expect(screen.queryByText('Ajouter une dépense')).not.toBeInTheDocument();
    // Mais l'option de réouverture est proposée (droit d'arrêté).
    expect(screen.getByText('Réouvrir')).toBeInTheDocument();
  });

  it('affiche la pastille de statut et les sections', () => {
    renderTab({ peutEcrire: true, peutArreter: true });
    expect(screen.getByText('Ouvert')).toBeInTheDocument();
    expect(screen.getByText(/Participants \(2\)/)).toBeInTheDocument();
    expect(screen.getByText(/Dépenses \(1\)/)).toBeInTheDocument();
  });
});
