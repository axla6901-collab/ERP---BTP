import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { ComposantLigneInput, DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// ─── Fabriques de lignes ──────────────────────────────────────────────

function section(origineDpgf: boolean): LigneDevisInput {
  return {
    type: 'section',
    designation: 'Section',
    articleId: null,
    quantite: null,
    unite: null,
    prixUnitaireHt: null,
    tauxTva: null,
    remisePourcent: null,
    notes: null,
    composants: [],
    origineDpgf,
  } as LigneDevisInput;
}

function ligneLibre(origineDpgf: boolean, composants: ComposantLigneInput[] = []): LigneDevisInput {
  return {
    type: 'libre',
    articleId: null,
    designation: 'Ligne test',
    quantite: '1',
    unite: 'u',
    prixUnitaireHt: '1000',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants,
    origineDpgf,
  } as LigneDevisInput;
}

function composantLibre(): ComposantLigneInput {
  return {
    type: 'libre',
    articleId: null,
    designation: 'Composant',
    quantiteParUnite: '1',
    prixUnitaireHt: '10',
    tauxTva: null,
    remisePourcent: null,
    notes: null,
  } as ComposantLigneInput;
}

function renderEditor(lignes: LigneDevisInput[]) {
  return render(
    <DevisEditor
      clients={[]}
      articles={[]}
      unites={[]}
      defaultValues={{ lignes } as Partial<DevisInput>}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      successRedirect="/devis"
      workflowStatutCourant="brouillon"
      peutGererPostesInternes={false}
    />,
  );
}

// Les boutons de gestion des composants (le cadre « rouge » de la maquette).
const LABELS_COMPOSANTS = [
  'Afficher / masquer les composants',
  'Ajouter un composant article catalogue',
  'Ajouter un composant libre',
  'Vider les composants',
];

describe('DevisEditor — boutons composants gatés sur import DPGF', () => {
  afterEach(() => cleanup());

  it('masque les 4 boutons composants quand aucun DPGF n’a été importé', () => {
    renderEditor([ligneLibre(false)]);
    for (const label of LABELS_COMPOSANTS) {
      expect(screen.queryByLabelText(label)).not.toBeInTheDocument();
    }
    // Le bouton « Supprimer la ligne » (hors cadre rouge) reste présent.
    expect(screen.getByLabelText('Supprimer la ligne')).toBeInTheDocument();
  });

  it('affiche les 4 boutons composants dès qu’une ligne provient d’un import DPGF', () => {
    renderEditor([section(true), ligneLibre(true)]);
    for (const label of LABELS_COMPOSANTS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  it('garde les boutons accessibles sur une ligne sans DPGF mais portant déjà des composants (anciens devis)', () => {
    renderEditor([ligneLibre(false, [composantLibre()])]);
    for (const label of LABELS_COMPOSANTS) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });
});
