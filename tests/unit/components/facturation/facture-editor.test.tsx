import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FactureEditor } from '@/components/facturation/facture-editor';
import { useUnsavedChangesGuard } from '@/lib/hooks/navigation-guard';
import type { FactureInput, LigneFactureInput } from '@/lib/validation/facturation';

vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/hooks/navigation-guard', () => ({
  useGuardedRouter: () => ({ back: vi.fn(), push: vi.fn() }),
  useUnsavedChangesGuard: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';

const ligne = (prixUnitaireHt: string): LigneFactureInput =>
  ({
    type: 'libre',
    articleId: null,
    designation: 'Pose agglos',
    quantite: '2',
    unite: 'u',
    prixUnitaireHt,
    tauxTva: '20.00',
    remisePourcent: '0',
    notes: null,
  }) as LigneFactureInput;

function renderEditor(
  defaultValues: Partial<FactureInput>,
  onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'f1' } }),
) {
  return render(
    <FactureEditor
      clients={[]}
      chantiers={[]}
      devis={[]}
      articles={[]}
      defaultValues={defaultValues}
      onSubmit={onSubmit}
      successRedirect="/facturation/factures/f1"
    />,
  );
}

/** Montant affiché sur la ligne de récapitulatif portant ce libellé exact. */
function montant(libelle: string): string {
  const etiquette = screen.getByText(libelle, { selector: 'span' });
  return etiquette.parentElement?.querySelector('.tabular-nums')?.textContent ?? '';
}

function dernierIsDirty(): boolean | undefined {
  return vi.mocked(useUnsavedChangesGuard).mock.calls.at(-1)?.[0].isDirty;
}

describe('FactureEditor — totaux en direct', () => {
  it('recalcule les totaux dès qu’un prix de ligne change (plus de totaux figés)', async () => {
    renderEditor({ lignes: [ligne('100')] });
    // 2 × 100 = 200 HT + 20 % = 240 TTC
    expect(montant('Total TTC')).toBe('240,00 €');

    fireEvent.change(screen.getByPlaceholderText('Prix HT'), { target: { value: '150' } });

    // 2 × 150 = 300 HT + 60 TVA = 360 TTC
    await waitFor(() => expect(montant('Total TTC')).toBe('360,00 €'));
    expect(montant('TVA')).toBe('60,00 €');
  });

  it('calcule la retenue de garantie et le net à payer sur les montants à jour', async () => {
    renderEditor({ lignes: [ligne('100')] });

    fireEvent.change(screen.getByPlaceholderText('Prix HT'), { target: { value: '150' } });
    fireEvent.change(screen.getByLabelText('Retenue de garantie (%)'), {
      target: { value: '5' },
    });

    // Retenue 5 % de 300 HT = 15 ; net à payer = 360 − 15 = 345
    await waitFor(() => expect(montant('Retenue de garantie')).toBe('− 15,00 €'));
    expect(montant('Net à payer')).toBe('345,00 €');
  });
});

describe('FactureEditor — après enregistrement', () => {
  it('n’est plus « modifié » une fois la facture enregistrée (pas de fausse alerte de sortie)', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'f1' } });
    const { container } = renderEditor({ clientId: CLIENT_ID, lignes: [ligne('100')] }, onSubmit);

    fireEvent.change(screen.getByPlaceholderText('Prix HT'), { target: { value: '150' } });
    await waitFor(() => expect(dernierIsDirty()).toBe(true));

    fireEvent.submit(container.querySelector('form')!);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(dernierIsDirty()).toBe(false));
  });
});
