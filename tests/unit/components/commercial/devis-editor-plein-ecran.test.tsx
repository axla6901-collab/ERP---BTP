import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import { SidebarProvider } from '@/components/layout/sidebar-context';
import type { DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

vi.mock('next/navigation', () => ({
  usePathname: () => '/acme/commercial/devis/devis-1',
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

// GuardedLink dépend de la garde de navigation (provider) : on le réduit à un
// simple <a> pour la carte « Chantier rattaché ».
vi.mock('@/components/layout/guarded-link', () => ({
  GuardedLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

const LIGNES: LigneDevisInput[] = [
  {
    type: 'libre',
    articleId: null,
    designation: 'Prestation',
    quantite: '10',
    unite: 'u',
    prixUnitaireHt: '100',
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
    composants: [],
    origineDpgf: false,
  } as LigneDevisInput,
];

function renderEditor(extra: Partial<React.ComponentProps<typeof DevisEditor>> = {}) {
  return render(
    <SidebarProvider>
      <DevisEditor
        clients={[]}
        articles={[]}
        unites={[]}
        defaultValues={{ lignes: LIGNES } as Partial<DevisInput>}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/commercial/devis"
        workflowStatutCourant="brouillon"
        peutGererPostesInternes={false}
        {...extra}
      />
    </SidebarProvider>,
  );
}

describe('DevisEditor — rail récap & plein écran', () => {
  afterEach(cleanup);

  it('rend le récapitulatif dans le rail (Récapitulatif + Total TTC)', () => {
    renderEditor();
    expect(screen.getByText('Récapitulatif')).toBeInTheDocument();
    expect(screen.getByText('Total TTC')).toBeInTheDocument();
  });

  it('affiche la carte « Chantier rattaché » quand un chantier est lié', () => {
    renderEditor({
      chantierRattache: { id: 'ch-1', numero: 'CH-2026-014', libelle: 'École Marguerite' },
    });
    expect(screen.getByText('Chantier rattaché')).toBeInTheDocument();
    expect(screen.getByText('École Marguerite')).toBeInTheDocument();
    const lien = screen.getByRole('link', { name: /École Marguerite/ });
    expect(lien).toHaveAttribute('href', '/chantiers/ch-1');
  });

  it('aucune carte chantier sans chantier rattaché', () => {
    renderEditor();
    expect(screen.queryByText('Chantier rattaché')).not.toBeInTheDocument();
  });

  it('le bouton « Plein écran » bascule le rail (classe hidden) et son libellé', () => {
    renderEditor();
    const rail = screen.getByText('Récapitulatif').closest('aside') as HTMLElement;
    expect(rail.className).not.toContain('hidden');

    fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }));

    // Deux boutons « Quitter le plein écran » en plein écran : le bandeau +
    // la barre figée en bas.
    expect(
      screen.getAllByRole('button', { name: 'Quitter le plein écran' }).length,
    ).toBeGreaterThanOrEqual(1);
    expect(rail.className).toContain('hidden');
  });

  it('actions de ligne sous un menu ⋮ en mode normal, en icônes alignées en plein écran', () => {
    renderEditor();

    // Mode normal : un menu ⋮ regroupe les actions de la ligne.
    expect(screen.getByTitle('Actions de la ligne')).toBeInTheDocument();
    // « Supprimer la ligne » reste accessible (item du menu).
    expect(screen.getByLabelText('Supprimer la ligne')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Plein écran' }));

    // Plein écran : plus de menu ⋮, les actions repassent en icônes en ligne.
    expect(screen.queryByTitle('Actions de la ligne')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Supprimer la ligne')).toBeInTheDocument();
  });

  it('rail : carte « Estimation marge » avec coût calculé sur les lignes catalogue', () => {
    renderEditor({
      articles: [
        { id: 'a1', code: 'BTN', libelle: 'Béton', uniteVenteSymbole: 'm³', prixCourant: '100' },
      ],
      defaultValues: {
        lignes: [
          {
            type: 'article_catalogue',
            articleId: 'a1',
            designation: 'Béton',
            quantite: '10',
            unite: 'm³',
            prixUnitaireHt: '150',
            tauxTva: '20.00',
            remisePourcent: '0',
            notes: null,
            composants: [],
            origineDpgf: false,
          } as LigneDevisInput,
        ],
      } as Partial<DevisInput>,
    });

    expect(screen.getByText('Estimation marge')).toBeInTheDocument();
    // Vente 10×150 = 1500 ; coût 10×100 = 1000 ; marge = 500/1500 = 33,3 %.
    expect(screen.getByText(/33,3\s*%/)).toBeInTheDocument();
  });

  it('rail : carte « Historique » alimentée par le journal d’audit', () => {
    renderEditor({
      historique: [
        {
          id: 'h1',
          action: 'insert',
          statutAvant: null,
          statutApres: 'brouillon',
          createdAt: '2026-06-15T10:00:00.000Z',
          email: 'alex@erp.fr',
        },
        {
          id: 'h2',
          action: 'update',
          statutAvant: 'brouillon',
          statutApres: 'en_validation',
          createdAt: '2026-06-15T11:00:00.000Z',
          email: 'alex@erp.fr',
        },
      ],
    });

    expect(screen.getByText('Historique')).toBeInTheDocument();
    expect(screen.getByText('Devis créé')).toBeInTheDocument();
    expect(screen.getByText('Statut → En validation')).toBeInTheDocument();
  });

  it('rail : pas de carte « Historique » sans données (création)', () => {
    renderEditor();
    expect(screen.queryByText('Historique')).not.toBeInTheDocument();
  });
});
