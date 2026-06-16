import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FournisseurRail, type FournisseurRailProps } from '@/components/tiers/fournisseur-rail';

const baseProps: FournisseurRailProps = {
  synthese: {
    titrePrincipal: '2 grilles en vigueur',
    sousTitre: '48 articles tarifés · 3 grilles au total',
    lignes: [
      {
        label: 'Tarif POINT.P 2026',
        detail: 'Générale · 36 articles · jusqu’au 31/12/2026',
        tone: 'ok',
      },
      {
        label: 'Tour Oxygène',
        detail: 'Chantier · 12 articles · jusqu’au 30/06/2026',
        tone: 'warn',
      },
    ],
  },
  statut: {
    actif: true,
    nbArticlesPreferes: 12,
    creeLe: '08/01/2026',
    creePar: 'alex@compte-r.com',
    modifieLe: '15/06/2026',
    modifiePar: 'alex@compte-r.com',
  },
  contacts: {
    actifs: 2,
    total: 3,
    principalNom: 'Laure Vidal',
    gererHref: '#contacts',
  },
  conformite: {
    items: [
      { label: 'Attestation URSSAF', valeur: 'Expire bientôt', tone: 'warn' },
      { label: 'RIB', valeur: 'À jour', tone: 'ok' },
    ],
    note: 'Vigilance L.8222-1 : exigible pour tout contrat ≥ 5 000 € HT.',
  },
  historique: [
    {
      id: 'h1',
      label: 'Réactivation',
      ton: 'emerald',
      quand: '15/06 · 09:30',
      par: 'alex@compte-r.com',
    },
    { id: 'h2', label: 'Fournisseur créé', ton: 'emerald', quand: '08/01 · 10:22', par: null },
  ],
};

afterEach(cleanup);

describe('FournisseurRail', () => {
  it('affiche la synthèse tarifaire et ses lignes', () => {
    const { getByText } = render(<FournisseurRail {...baseProps} />);
    expect(getByText('Synthèse tarifaire')).toBeInTheDocument();
    expect(getByText('2 grilles en vigueur')).toBeInTheDocument();
    expect(getByText('Tarif POINT.P 2026')).toBeInTheDocument();
  });

  it('affiche le nombre d’articles dont le fournisseur est préféré', () => {
    const { getByText } = render(<FournisseurRail {...baseProps} />);
    expect(getByText('12 articles')).toBeInTheDocument();
  });

  it('résume les contacts (principal) et propose un lien de gestion', () => {
    const { getByText, getByRole } = render(<FournisseurRail {...baseProps} />);
    expect(getByText('Laure Vidal')).toBeInTheDocument();
    expect(getByRole('link', { name: /gérer les contacts/i })).toHaveAttribute('href', '#contacts');
  });

  it('affiche les pastilles de conformité d’achat', () => {
    const { getByText } = render(<FournisseurRail {...baseProps} />);
    expect(getByText('Expire bientôt')).toBeInTheDocument();
    expect(getByText('À jour')).toBeInTheDocument();
  });

  it('affiche l’historique d’audit', () => {
    const { getByText } = render(<FournisseurRail {...baseProps} />);
    expect(getByText('Historique')).toBeInTheDocument();
    expect(getByText('Réactivation')).toBeInTheDocument();
    expect(getByText('Fournisseur créé')).toBeInTheDocument();
  });

  it('affiche un tiret quand aucun article n’est préféré', () => {
    const { queryByText } = render(
      <FournisseurRail {...baseProps} statut={{ ...baseProps.statut, nbArticlesPreferes: 0 }} />,
    );
    expect(queryByText('12 articles')).not.toBeInTheDocument();
  });
});
