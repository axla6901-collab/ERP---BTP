import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { ContactsTable } from '@/components/tiers/contacts-table';
import type { ContactUnifie } from '@/lib/tiers/contacts-annuaire';

const FOURNISSEUR: ContactUnifie = {
  cle: 'fournisseur:fc1',
  source: 'fournisseur',
  nom: 'Durand',
  prenom: 'Paul',
  fonction: 'Commercial',
  email: 'paul@btpplus.fr',
  telephone: '0600000000',
  tiersNom: 'BTP Plus',
  tiersHref: '/tiers/fournisseurs/f9',
  principal: true,
  actif: true,
};

const SOUS_TRAITANT: ContactUnifie = {
  cle: 'sous_traitant:st1',
  source: 'sous_traitant',
  nom: 'Albert',
  prenom: null,
  fonction: null,
  email: null,
  telephone: null,
  tiersNom: 'Maçonnerie Sud',
  tiersHref: '/tiers/sous-traitants/s5',
  principal: false,
  actif: false,
};

const CLIENT: ContactUnifie = {
  cle: 'client:cl7',
  source: 'client',
  nom: 'SCI Horizon',
  prenom: null,
  fonction: null,
  email: 'contact@horizon.fr',
  telephone: '0233334444',
  tiersNom: 'SCI Horizon',
  tiersHref: '/commercial/clients/cl7',
  principal: false,
  actif: true,
};

describe('ContactsTable', () => {
  afterEach(() => cleanup());

  it('affiche le message vide quand aucun contact', () => {
    render(<ContactsTable items={[]} />);
    expect(screen.getByText(/Aucun contact/)).toBeInTheDocument();
  });

  it('affiche le nom complet, la fonction et le badge de type', () => {
    render(<ContactsTable items={[FOURNISSEUR]} />);
    expect(screen.getByText('Durand Paul')).toBeInTheDocument();
    expect(screen.getByText('Commercial')).toBeInTheDocument();
    expect(screen.getByText('Fournisseur')).toBeInTheDocument();
    expect(screen.getByText('Principal')).toBeInTheDocument();
  });

  it('le tiers est un lien vers la fiche correspondante', () => {
    render(<ContactsTable items={[FOURNISSEUR, CLIENT]} />);
    expect(screen.getByRole('link', { name: 'BTP Plus' })).toHaveAttribute(
      'href',
      '/tiers/fournisseurs/f9',
    );
    expect(screen.getByRole('link', { name: 'SCI Horizon' })).toHaveAttribute(
      'href',
      '/commercial/clients/cl7',
    );
  });

  it('email rendu en lien mailto, « — » si absent', () => {
    render(<ContactsTable items={[FOURNISSEUR, SOUS_TRAITANT]} />);
    expect(screen.getByRole('link', { name: 'paul@btpplus.fr' })).toHaveAttribute(
      'href',
      'mailto:paul@btpplus.fr',
    );
    const ligneSt = screen.getByText('Albert').closest('tr');
    expect(ligneSt?.textContent).toContain('—');
  });

  it('statut Actif / Inactif selon le contact', () => {
    render(<ContactsTable items={[FOURNISSEUR, SOUS_TRAITANT]} />);
    expect(screen.getByText('Actif')).toBeInTheDocument();
    expect(screen.getByText('Inactif')).toBeInTheDocument();
  });

  it('recherche filtre par nom de tiers', () => {
    render(<ContactsTable items={[FOURNISSEUR, SOUS_TRAITANT, CLIENT]} />);
    const input = screen.getByRole('searchbox', { name: 'Rechercher' });
    fireEvent.change(input, { target: { value: 'horizon' } });
    // « SCI Horizon » figure deux fois pour un client (colonne Contact + lien Tiers).
    expect(screen.getByRole('link', { name: 'SCI Horizon' })).toBeInTheDocument();
    expect(screen.queryByText('Durand Paul')).not.toBeInTheDocument();
    expect(screen.queryByText('Albert')).not.toBeInTheDocument();
  });

  it('recherche filtre par type de tiers', () => {
    render(<ContactsTable items={[FOURNISSEUR, SOUS_TRAITANT, CLIENT]} />);
    const input = screen.getByRole('searchbox', { name: 'Rechercher' });
    fireEvent.change(input, { target: { value: 'sous-traitant' } });
    expect(screen.getByText('Albert')).toBeInTheDocument();
    expect(screen.queryByText('Durand Paul')).not.toBeInTheDocument();
  });

  it('sans onChangerStatut : pas de colonne d’actions', () => {
    render(<ContactsTable items={[FOURNISSEUR]} />);
    expect(screen.queryByRole('button', { name: /désactiver|activer/i })).not.toBeInTheDocument();
  });

  it('avec onChangerStatut : un toggle par contact fournisseur / sous-traitant', () => {
    render(<ContactsTable items={[FOURNISSEUR, SOUS_TRAITANT]} onChangerStatut={vi.fn()} />);
    // Fournisseur actif → « Désactiver » ; sous-traitant inactif → « Activer ».
    expect(screen.getByRole('button', { name: 'Désactiver' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Activer' })).toBeInTheDocument();
  });

  it('ne propose pas de toggle pour une ligne « client »', () => {
    render(<ContactsTable items={[CLIENT]} onChangerStatut={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /désactiver|activer/i })).not.toBeInTheDocument();
  });

  it('appelle onChangerStatut avec la source, l’id (extrait de la clé) et l’état cible', async () => {
    const onChangerStatut = vi.fn().mockResolvedValue({ ok: true });
    render(<ContactsTable items={[FOURNISSEUR]} onChangerStatut={onChangerStatut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Désactiver' }));
    await waitFor(() =>
      expect(onChangerStatut).toHaveBeenCalledWith('fournisseur', 'fc1', false),
    );
  });
});
