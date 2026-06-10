import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { creerContact, mettreAJourContact, supprimerContact } = vi.hoisted(() => ({
  creerContact: vi.fn(),
  mettreAJourContact: vi.fn(),
  supprimerContact: vi.fn(),
}));
vi.mock('@/lib/tiers/contacts-actions', () => ({
  creerContact,
  mettreAJourContact,
  supprimerContact,
}));

import { ContactsSection } from '@/components/contacts/contacts-section';
import type { ContactFiche } from '@/lib/contacts/types';

const PRINCIPAL: ContactFiche = {
  id: 'c1',
  nom: 'Durand',
  prenom: 'Paul',
  fonction: 'Commercial',
  email: 'paul@x.fr',
  telephoneMobile: '0600000000',
  telephoneFixe: null,
  notes: null,
  principal: true,
  actif: true,
};

const INACTIF: ContactFiche = {
  id: 'c2',
  nom: 'Albert',
  prenom: null,
  fonction: null,
  email: null,
  telephoneMobile: null,
  telephoneFixe: null,
  notes: null,
  principal: false,
  actif: false,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ContactsSection', () => {
  it('affiche le message vide (le bouton de création vit dans le bandeau, pas ici)', () => {
    render(<ContactsSection source="fournisseur" tiersId="t1" contacts={[]} />);
    expect(screen.getByText(/Aucun contact/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /créer un contact/i })).not.toBeInTheDocument();
  });

  it('liste les contacts avec les badges principal / inactif', () => {
    render(<ContactsSection source="fournisseur" tiersId="t1" contacts={[PRINCIPAL, INACTIF]} />);
    expect(screen.getByText('Durand Paul')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
    expect(screen.getByText('Albert')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('supprime un contact (source transmise) après confirmation', async () => {
    supprimerContact.mockResolvedValue({ ok: true });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ContactsSection source="client" tiersId="t1" contacts={[PRINCIPAL]} />);
    fireEvent.click(screen.getByRole('button', { name: /supprimer durand paul/i }));
    await waitFor(() => expect(supprimerContact).toHaveBeenCalledWith('client', 'c1'));
  });

  it('n’appelle pas la suppression si la confirmation est refusée', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<ContactsSection source="client" tiersId="t1" contacts={[PRINCIPAL]} />);
    fireEvent.click(screen.getByRole('button', { name: /supprimer durand paul/i }));
    expect(supprimerContact).not.toHaveBeenCalled();
  });
});
