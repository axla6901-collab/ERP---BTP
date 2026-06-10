import '@testing-library/jest-dom/vitest';

import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, prefetch: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

import { PrixReferenceQuickForm } from '@/components/catalogue/prix-reference-quick-form';

const unites = [
  { id: 'u1', code: 'M2', symbole: 'm²' },
  { id: 'u2', code: 'U', symbole: 'u' },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderForm(over: Partial<ComponentProps<typeof PrixReferenceQuickForm>> = {}) {
  const action = over.action ?? vi.fn().mockResolvedValue({ ok: true, data: { id: 'p1' } });
  const props: ComponentProps<typeof PrixReferenceQuickForm> = {
    defaultPrix: '10.00',
    defaultUniteId: 'u1',
    defaultValidFrom: '2026-06-01',
    unites,
    action,
    ...over,
  };
  const utils = render(<PrixReferenceQuickForm {...props} />);
  return { ...utils, props, action };
}

describe('PrixReferenceQuickForm', () => {
  it('pré-remplit le prix courant et désactive Enregistrer (rien à enregistrer)', () => {
    renderForm();
    expect(screen.getByLabelText('Prix HT')).toHaveValue('10.00');
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
  });

  it('active Enregistrer dès que le prix change', () => {
    renderForm();
    fireEvent.change(screen.getByLabelText('Prix HT'), { target: { value: '12,50' } });
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeEnabled();
  });

  it('envoie le prix normalisé (virgule → point) puis rafraîchit', async () => {
    const { action } = renderForm();
    fireEvent.change(screen.getByLabelText('Prix HT'), { target: { value: '12,50' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() =>
      expect(action).toHaveBeenCalledWith({ prixUnitaireHt: '12.50', uniteId: 'u1' }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  // Régression : après l'enregistrement, le parent (Server Component) se
  // re-rend avec la nouvelle valeur serveur. Le champ doit se resynchroniser
  // et le bouton repasser désactivé — sans ce comportement, la fiche donnait
  // l'impression de ne pas se mettre à jour.
  it('se resynchronise quand le serveur renvoie un nouveau prix de référence', () => {
    const { rerender, props } = renderForm({ defaultPrix: '10.00' });

    // L'utilisateur saisit puis enregistre : l'état local porte la valeur tapée.
    fireEvent.change(screen.getByLabelText('Prix HT'), { target: { value: '12,50' } });
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeEnabled();

    // router.refresh() → le Server Component renvoie le prix normalisé persisté.
    rerender(
      <PrixReferenceQuickForm
        {...props}
        defaultPrix="12.50"
        defaultValidFrom="2026-06-10"
      />,
    );

    expect(screen.getByLabelText('Prix HT')).toHaveValue('12.50');
    expect(screen.getByRole('button', { name: /enregistrer/i })).toBeDisabled();
    expect(screen.getByText(/en vigueur depuis le 2026-06-10/i)).toBeInTheDocument();
  });

  it('valide la saisie avant envoi (prix vide)', () => {
    const { action } = renderForm({ defaultPrix: null, defaultUniteId: 'u1' });
    // dirty via le changement d'unité indisponible ici → on force un prix puis on le vide
    fireEvent.change(screen.getByLabelText('Prix HT'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Prix HT'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.getByText(/saisis un prix/i)).toBeInTheDocument();
  });
});

