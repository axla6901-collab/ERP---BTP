import '@testing-library/jest-dom/vitest';

import type { ReactNode } from 'react';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={typeof href === 'string' ? href : '#'}>{children}</a>
  ),
}));

import { SousTraitantRail } from '@/components/tiers/sous-traitant-rail';
import { calculerSyntheseConformite } from '@/lib/sous-traitance/fiche-synthese';

const conformite = calculerSyntheseConformite(
  {
    documents: [
      { type: 'assurance_decennale', dateValidite: '2026-06-28' },
      { type: 'attestation_urssaf', dateValidite: '2026-12-02' },
      { type: 'contrat_sous_traitance', dateValidite: null },
    ],
    qualifications: ['Qualibat 1234', 'RGE'],
  },
  '2026-06-15',
);

function renderRail() {
  return render(
    <SousTraitantRail
      conformite={conformite}
      cascade={{
        rang: 2,
        max: 3,
        depassement: false,
        parent: { libelle: 'ELEC-GEN — ÉLEC Générale SAS', href: '/e/tiers/sous-traitants/parent' },
        retenuePct: '5.00',
      }}
      meta={{
        statut: 'agree',
        actif: true,
        creeLe: '2026-03-12',
        creePar: 'alex@compte-r.com',
        modifieLe: '2026-06-15',
        modifiePar: 'alex@compte-r.com',
      }}
      contacts={{
        actifs: 2,
        total: 3,
        gererHref: '#contacts',
        items: [
          { id: 'c1', nom: 'Sophie Martin', fonction: 'Conductrice de travaux', principal: true },
          { id: 'c2', nom: 'Karim Bensaïd', fonction: "Chargé d'affaires", principal: false },
        ],
      }}
      historique={[
        {
          id: '1',
          label: 'Attestation URSSAF mise à jour',
          ton: 'amber',
          quand: '14/06 · 16:40',
          par: 'alex',
        },
        { id: '2', label: 'Sous-traitant créé', ton: 'emerald', quand: '12/03 · 10:22', par: null },
      ]}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('SousTraitantRail', () => {
  it('affiche la synthèse de conformité « Vigilance · 3/4 »', () => {
    const { getByText } = renderRail();
    expect(getByText('Vigilance · 3/4')).toBeInTheDocument();
    expect(getByText(/Décennale expire le 28\/06\/2026/)).toBeInTheDocument();
  });

  it('affiche le rang de cascade et le parent', () => {
    const { getByText } = renderRail();
    expect(getByText('Rang 2 / 3')).toBeInTheDocument();
    expect(getByText('ELEC-GEN — ÉLEC Générale SAS')).toBeInTheDocument();
  });

  it('affiche la retenue de garantie', () => {
    const { getByText } = renderRail();
    expect(getByText('5.00 %')).toBeInTheDocument();
  });

  it('affiche le statut d’agrément et le contact principal', () => {
    const { getByText } = renderRail();
    expect(getByText('Agréé')).toBeInTheDocument();
    expect(getByText('Sophie Martin')).toBeInTheDocument();
  });

  it('affiche les événements de l’historique', () => {
    const { getByText } = renderRail();
    expect(getByText('Attestation URSSAF mise à jour')).toBeInTheDocument();
    expect(getByText('Sous-traitant créé')).toBeInTheDocument();
  });
});
