import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

import { EntreprisesTable } from '@/components/admin/entreprises-table';
import type { EntrepriseListItem } from '@/lib/admin/entreprises-super';

const ALPHA: EntrepriseListItem = {
  id: 'ent-alpha',
  slug: 'alpha-btp',
  raisonSociale: 'Alpha BTP',
  siret: '12345678901234',
  adresseLigne1: '12 rue de la Paix',
  codePostal: '75001',
  ville: 'Paris',
  actif: true,
  createdAt: new Date('2026-01-15T10:00:00Z'),
  membresCount: 5,
  logoPrincipalStorageKey: 'entreprises/ent-alpha/logos/abc.png',
};

const BETA: EntrepriseListItem = {
  id: 'ent-beta',
  slug: 'beta-construction',
  raisonSociale: 'Beta Construction',
  siret: null,
  adresseLigne1: null,
  codePostal: null,
  ville: 'Lyon',
  actif: false,
  createdAt: new Date('2026-03-20T10:00:00Z'),
  membresCount: 2,
  logoPrincipalStorageKey: null,
};

describe('EntreprisesTable', () => {
  afterEach(() => cleanup());

  describe('rendu', () => {
    it('affiche un message vide quand items est vide', () => {
      render(<EntreprisesTable items={[]} logoUrls={{}} />);
      expect(screen.getByText(/Aucune entreprise/)).toBeInTheDocument();
    });

    it('affiche les colonnes raison sociale + slug + SIRET + adresse + membres', () => {
      render(<EntreprisesTable items={[ALPHA]} logoUrls={{}} />);
      expect(screen.getByText('Alpha BTP')).toBeInTheDocument();
      expect(screen.getByText('alpha-btp')).toBeInTheDocument();
      expect(screen.getByText('12345678901234')).toBeInTheDocument();
      expect(screen.getByText(/Paris/)).toBeInTheDocument();
      expect(screen.getByText(/12 rue de la Paix/)).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('affiche le placeholder « initiales » quand aucune URL de logo', () => {
      render(<EntreprisesTable items={[ALPHA]} logoUrls={{}} />);
      expect(screen.getByText('AL')).toBeInTheDocument(); // 2 premières lettres
    });

    it('affiche l\'<img> du logo quand une URL est fournie', () => {
      render(
        <EntreprisesTable
          items={[ALPHA]}
          logoUrls={{ 'ent-alpha': 'https://signed.example/logo.png' }}
        />,
      );
      const img = screen.getByAltText('Logo Alpha BTP') as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.src).toBe('https://signed.example/logo.png');
    });

    it('affiche « — » quand siret est null', () => {
      render(<EntreprisesTable items={[BETA]} logoUrls={{}} />);
      // SIRET et autres cellules « — » peuvent coexister, on vise la ligne BETA
      const ligne = screen.getByText('Beta Construction').closest('tr');
      expect(ligne).not.toBeNull();
      expect(ligne!.textContent).toContain('—');
    });

    it('badge Actif visible pour entreprise active', () => {
      render(<EntreprisesTable items={[ALPHA]} logoUrls={{}} />);
      expect(screen.getByText('Actif')).toBeInTheDocument();
    });

    it('badge Désactivé visible pour entreprise inactive', () => {
      render(<EntreprisesTable items={[BETA]} logoUrls={{}} />);
      expect(screen.getByText('Désactivé')).toBeInTheDocument();
    });

    it('lien « Ouvrir » pointe vers /admin/entreprises/[id]', () => {
      render(<EntreprisesTable items={[ALPHA]} logoUrls={{}} />);
      const lien = screen.getByRole('link', { name: 'Ouvrir' });
      expect(lien).toHaveAttribute('href', '/admin/entreprises/ent-alpha');
    });

    it('rightActions rendu', () => {
      render(
        <EntreprisesTable
          items={[ALPHA]}
          logoUrls={{}}
          rightActions={<button type="button">Nouvelle entreprise</button>}
        />,
      );
      expect(screen.getByRole('button', { name: 'Nouvelle entreprise' })).toBeInTheDocument();
    });
  });

  describe('recherche', () => {
    it('filtre par raison sociale', () => {
      render(<EntreprisesTable items={[ALPHA, BETA]} logoUrls={{}} />);
      const input = screen.getByRole('searchbox', { name: 'Rechercher' });
      fireEvent.change(input, { target: { value: 'beta' } });
      expect(screen.getByText('Beta Construction')).toBeInTheDocument();
      expect(screen.queryByText('Alpha BTP')).not.toBeInTheDocument();
    });

    it('filtre par ville', () => {
      render(<EntreprisesTable items={[ALPHA, BETA]} logoUrls={{}} />);
      const input = screen.getByRole('searchbox', { name: 'Rechercher' });
      fireEvent.change(input, { target: { value: 'lyon' } });
      expect(screen.getByText('Beta Construction')).toBeInTheDocument();
      expect(screen.queryByText('Alpha BTP')).not.toBeInTheDocument();
    });

    it('filtre par SIRET', () => {
      render(<EntreprisesTable items={[ALPHA, BETA]} logoUrls={{}} />);
      const input = screen.getByRole('searchbox', { name: 'Rechercher' });
      fireEvent.change(input, { target: { value: '1234567' } });
      expect(screen.getByText('Alpha BTP')).toBeInTheDocument();
      expect(screen.queryByText('Beta Construction')).not.toBeInTheDocument();
    });

    it('aucun résultat affiche le message dédié', () => {
      render(<EntreprisesTable items={[ALPHA]} logoUrls={{}} />);
      const input = screen.getByRole('searchbox', { name: 'Rechercher' });
      fireEvent.change(input, { target: { value: 'zzz' } });
      expect(screen.getByText(/Aucun résultat/)).toBeInTheDocument();
    });
  });

  describe('tri', () => {
    it('tri par défaut : raison sociale ascendant', () => {
      render(<EntreprisesTable items={[BETA, ALPHA]} logoUrls={{}} />);
      const lignes = screen.getAllByRole('row').slice(1); // skip header
      expect(lignes[0]?.textContent).toContain('Alpha BTP');
      expect(lignes[1]?.textContent).toContain('Beta Construction');
    });
  });
});
