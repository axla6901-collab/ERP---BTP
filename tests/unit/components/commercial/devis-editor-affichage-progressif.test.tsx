import '@testing-library/jest-dom/vitest';

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { DevisInput, LigneDevisInput } from '@/lib/validation/commercial';

const { mockPush } = vi.hoisted(() => ({ mockPush: vi.fn() }));

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({
    refresh: vi.fn(),
    push: mockPush,
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

function lignesLibres(n: number, prefixe = 'L'): LigneDevisInput[] {
  return Array.from({ length: n }, (_, i) => ligneLibre(`${prefixe}${i + 1}`));
}

function renderEditor(
  lignes: LigneDevisInput[],
  props: Partial<Parameters<typeof DevisEditor>[0]> = {},
) {
  return render(
    <DevisEditor
      clients={[]}
      articles={[]}
      unites={[]}
      defaultValues={{ lignes } as Partial<DevisInput>}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      successRedirect="/commercial/devis"
      workflowStatutCourant="brouillon"
      peutGererPostesInternes={false}
      {...props}
    />,
  );
}

const lignesRendues = () => screen.queryAllByLabelText('Prix unitaire HT').length;

/** Laisse passer `n` tranches (un timer de repli + le rendu React de la tranche). */
async function avancerTranches(n: number) {
  for (let i = 0; i < n; i++) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20);
    });
  }
}

describe('DevisEditor — affichage progressif des lignes', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('rend 20 lignes d’abord, puis le reste par tranches de 10', async () => {
    // 35 lignes : 20 d'emblée, puis 30, puis 35 (le rendu jsdom de lignes RHF est lent).
    renderEditor(lignesLibres(35));
    expect(lignesRendues()).toBe(20);
    expect(screen.getByText('Affichage des lignes… 20 / 35')).toBeInTheDocument();

    await avancerTranches(1);
    expect(lignesRendues()).toBe(30);
    await avancerTranches(2);

    expect(lignesRendues()).toBe(35);
    expect(screen.queryByText(/Affichage des lignes…/)).toBeNull();
  }, 20_000);

  it('rend tout d’emblée un devis court (aucun indicateur)', () => {
    renderEditor(lignesLibres(12));
    expect(lignesRendues()).toBe(12);
    expect(screen.queryByText(/Affichage des lignes…/)).toBeNull();
  });

  it('coupe au milieu d’une section sans rendre les sections suivantes', () => {
    // Index : S1=0, lignes 1-10, S2=11, lignes 12-21, S3=22, lignes 23-32.
    renderEditor([
      section('1 Gros œuvre'),
      ...lignesLibres(10, 'A'),
      section('2 Second œuvre'),
      ...lignesLibres(10, 'B'),
      section('3 Finitions'),
      ...lignesLibres(10, 'C'),
    ]);
    // Limite 20 : S1 + 10 lignes + S2 + 8 lignes (index 12 à 19).
    expect(lignesRendues()).toBe(18);
    expect(screen.getAllByLabelText('Replier la section')).toHaveLength(2);
    expect(screen.queryByDisplayValue('3 Finitions')).toBeNull();
  });

  it('calcule les totaux sur toutes les lignes, même non encore affichées', () => {
    renderEditor(lignesLibres(120));
    expect(lignesRendues()).toBe(20);
    // 120 lignes × 1 × 10 € HT = 1 200,00 € (séparateur de milliers variable).
    expect(screen.getAllByText(/1[\s  ]200,00/).length).toBeGreaterThan(0);
  });
});

describe('DevisEditor — redirection après enregistrement', () => {
  afterEach(() => {
    cleanup();
    mockPush.mockReset();
  });

  it('préfixe l’URL de redirection par le slug d’entreprise', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'devis-9' } });
    // clientId UUID valide : sinon la validation Zod court-circuite la soumission.
    renderEditor(lignesLibres(1), {
      onSubmit,
      successRedirectAppendId: true,
      defaultValues: {
        clientId: '11111111-1111-4111-8111-111111111111',
        lignes: lignesLibres(1),
      } as Partial<DevisInput>,
    });

    fireEvent.submit(screen.getByRole('button', { name: 'Enregistrer le devis' }).closest('form')!);

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/acme/commercial/devis/devis-9'));
  });
});
