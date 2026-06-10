import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

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

function section(designation: string): LigneDevisInput {
  return {
    type: 'section',
    designation,
    articleId: null,
    quantite: null,
    unite: null,
    prixUnitaireHt: null,
    tauxTva: null,
    remisePourcent: null,
    notes: null,
    composants: [],
    origineDpgf: false,
  } as LigneDevisInput;
}

function ligneLibre(designation: string): LigneDevisInput {
  return {
    type: 'libre',
    articleId: null,
    designation,
    quantite: '1',
    unite: 'u',
    prixUnitaireHt: '10',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
  } as LigneDevisInput;
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

// Régression : en état MIXTE (une section ouverte, une autre repliée), le bouton
// global doit proposer « Tout déplier » et déplier l'ensemble. Avant le fix, la
// direction suivait « tout est replié », donc en état mixte le bouton repliait
// tout — l'inverse de l'intention de l'utilisateur (cf. capture « sous-menus »).
describe('DevisEditor — bouton « tout déplier / replier » en état mixte', () => {
  afterEach(() => cleanup());

  it('propose « Tout replier » quand toutes les sections sont dépliées', () => {
    renderEditor([section('Gros œuvre'), ligneLibre('A'), section('Second œuvre'), ligneLibre('B')]);
    expect(screen.getByLabelText('Replier toutes les sections')).toBeVisible();
    expect(screen.queryByLabelText('Déplier toutes les sections')).toBeNull();
  });

  it('bascule sur « Tout déplier » dès qu’une seule sous-section est repliée (état mixte)', () => {
    renderEditor([section('Gros œuvre'), ligneLibre('A'), section('Second œuvre'), ligneLibre('B')]);

    // On replie la PREMIÈRE section uniquement → état mixte.
    fireEvent.click(screen.getAllByLabelText('Replier la section')[0]!);

    // Le bouton global doit désormais proposer de tout déplier (le fix).
    expect(screen.getByLabelText('Déplier toutes les sections')).toBeVisible();
    expect(screen.queryByLabelText('Replier toutes les sections')).toBeNull();
  });

  it('« Tout déplier » rouvre la section repliée (et le bouton repasse à « Tout replier »)', () => {
    renderEditor([section('Gros œuvre'), ligneLibre('A'), section('Second œuvre'), ligneLibre('B')]);

    // État mixte : une section repliée.
    fireEvent.click(screen.getAllByLabelText('Replier la section')[0]!);
    expect(screen.getAllByLabelText('Déplier la section')).toHaveLength(1);

    // Clic sur le bouton global « Tout déplier ».
    fireEvent.click(screen.getByLabelText('Déplier toutes les sections'));

    // Les deux sections sont dépliées : aucun chevron « Déplier la section »
    // ne subsiste, et le bouton global repasse en mode « Tout replier ».
    expect(screen.queryAllByLabelText('Déplier la section')).toHaveLength(0);
    expect(screen.getAllByLabelText('Replier la section')).toHaveLength(2);
    expect(screen.getByLabelText('Replier toutes les sections')).toBeVisible();
  });
});
