import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { creerContact, mettreAJourContact } = vi.hoisted(() => ({
  creerContact: vi.fn(),
  mettreAJourContact: vi.fn(),
}));
vi.mock('@/lib/tiers/contacts-actions', () => ({
  creerContact,
  mettreAJourContact,
  supprimerContact: vi.fn(),
}));

import { ContactDialog } from '@/components/contacts/contact-dialog';
import type { ContactFiche } from '@/lib/contacts/types';

beforeAll(() => {
  // base-ui Dialog s'appuie sur des API absentes de jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});

beforeEach(() => {
  creerContact.mockResolvedValue({ ok: true, data: { id: 'new' } });
  mettreAJourContact.mockResolvedValue({ ok: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ContactDialog', () => {
  it('création : soumission appelle creerContact avec la source et le tiers', async () => {
    render(<ContactDialog source="client" tiersId="t1" open onOpenChange={vi.fn()} />);
    expect(screen.getByText('Créer un contact')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nom *'), { target: { value: 'Doe' } });
    fireEvent.click(screen.getByRole('button', { name: /créer le contact/i }));
    await waitFor(() =>
      expect(creerContact).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'client', tiersId: 't1', nom: 'Doe' }),
      ),
    );
  });

  it('refuse la soumission quand le nom est vide', async () => {
    render(<ContactDialog source="fournisseur" tiersId="t1" open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /créer le contact/i }));
    await waitFor(() => expect(screen.getByText('Nom requis.')).toBeInTheDocument());
    expect(creerContact).not.toHaveBeenCalled();
  });

  it('édition : valeurs préremplies, soumission appelle mettreAJourContact', async () => {
    const contact: ContactFiche = {
      id: '11111111-1111-4111-8111-111111111111',
      nom: 'Durand',
      prenom: 'Paul',
      fonction: null,
      email: null,
      telephoneMobile: null,
      telephoneFixe: null,
      notes: null,
      principal: false,
      actif: true,
    };
    render(
      <ContactDialog
        source="fournisseur"
        tiersId="t1"
        contact={contact}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText('Modifier le contact')).toBeInTheDocument();
    const nom = screen.getByLabelText('Nom *');
    expect(nom).toHaveValue('Durand');
    fireEvent.submit(nom.closest('form')!);
    await waitFor(() =>
      expect(mettreAJourContact).toHaveBeenCalledWith(
        'fournisseur',
        '11111111-1111-4111-8111-111111111111',
        expect.objectContaining({ nom: 'Durand' }),
      ),
    );
  });
});
