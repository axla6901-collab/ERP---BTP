import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SituationForm } from '@/components/facturation/situation-form';

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

function renderForm() {
  return render(
    <SituationForm
      chantiers={[]}
      articles={[]}
      onSubmit={vi.fn().mockResolvedValue({ ok: true, data: { id: 's1', numero: 1 } })}
      chargerLignesPrecedentesAction={vi.fn().mockResolvedValue(null)}
      parserFichierAction={vi.fn()}
      listerDevisFacturablesAction={vi.fn().mockResolvedValue([])}
      chargerLignesDevisAction={vi.fn().mockResolvedValue(null)}
      successRedirect="/facturation/situations"
    />,
  );
}

/** Montant affiché sur la ligne du récapitulatif (section 4) dont le libellé commence ainsi. */
function montant(libelle: RegExp): string {
  const recap = screen.getByText('Total marché HT').closest('div.grid') as HTMLElement;
  const etiquette = within(recap).getByText(libelle, { selector: 'span' });
  return etiquette.parentElement?.querySelector('.tabular-nums')?.textContent ?? '';
}

describe('SituationForm — aperçu en direct', () => {
  it('met à jour le récapitulatif dès la saisie du montant et de l’avancement', async () => {
    renderForm();

    fireEvent.change(screen.getByPlaceholderText('OU Montant HT (€)'), {
      target: { value: '250' },
    });
    // Le récapitulatif apparaît dès qu'une ligne a un montant marché.
    await waitFor(() => expect(montant(/^Total marché HT$/)).toBe('250,00 €'));

    fireEvent.change(screen.getByPlaceholderText('% avancement'), { target: { value: '50' } });

    await waitFor(() => expect(montant(/^Cumulé HT \(50/)).toBe('125,00 €'));
    expect(montant(/^À facturer HT/)).toBe('125,00 €');
  });
});
