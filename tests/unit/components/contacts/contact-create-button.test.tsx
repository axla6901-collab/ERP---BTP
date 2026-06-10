import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/tiers/contacts-actions', () => ({
  creerContact: vi.fn(),
  mettreAJourContact: vi.fn(),
  supprimerContact: vi.fn(),
}));

import { ContactCreateButton } from '@/components/contacts/contact-create-button';

beforeAll(() => {
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ContactCreateButton', () => {
  it('affiche le bouton et n’ouvre la frame qu’au clic', async () => {
    render(<ContactCreateButton source="fournisseur" tiersId="t1" />);
    const bouton = screen.getByRole('button', { name: /créer un contact/i });
    expect(bouton).toBeInTheDocument();
    // Frame fermée au départ : aucun champ du formulaire de contact rendu.
    expect(screen.queryByLabelText('Nom *')).not.toBeInTheDocument();
    fireEvent.click(bouton);
    await waitFor(() => expect(screen.getByLabelText('Nom *')).toBeInTheDocument());
  });
});
