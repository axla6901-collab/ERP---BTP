import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { FilAnnonces } from '@/components/test-sirh/annonces/fil-annonces';
import type { AnnonceAffichee } from '@/lib/test-sirh/annonces/types';

afterEach(cleanup);

const TODAY = '2026-10-19';

const annonce = (p: Partial<AnnonceAffichee> & { id: string; titre: string }): AnnonceAffichee => ({
  contenu: 'Contenu',
  categorie: 'information',
  epinglee: false,
  publiee: true,
  datePublication: '2026-10-15',
  dateExpiration: null,
  siteId: null,
  siteNom: null,
  equipeId: null,
  equipeNom: null,
  auteur: 'rh@acme.fr',
  createdAt: '2026-10-15T08:00:00.000Z',
  ...p,
});

describe('FilAnnonces', () => {
  it('affiche titre, catégorie, épinglage, dates, audience et auteur', () => {
    render(
      <FilAnnonces
        today={TODAY}
        annonces={[
          annonce({
            id: 'a1',
            titre: 'Port du casque obligatoire',
            categorie: 'securite',
            epinglee: true,
            dateExpiration: '2026-12-31',
            siteNom: 'Lyon',
            equipeNom: 'Gros œuvre',
          }),
          annonce({ id: 'a2', titre: 'Repas de fin d’année', categorie: 'evenement' }),
        ]}
      />,
    );
    expect(screen.getByText('Port du casque obligatoire')).toBeInTheDocument();
    expect(screen.getByText('Sécurité')).toBeInTheDocument();
    expect(screen.getByText('Événement')).toBeInTheDocument();
    expect(screen.getByText('Épinglée')).toBeInTheDocument();
    expect(screen.getByText('15/10/2026 → 31/12/2026')).toBeInTheDocument();
    expect(screen.getByText('Équipe Gros œuvre · Site Lyon · par rh@acme.fr')).toBeInTheDocument();
    expect(screen.getByText('Toute l’entreprise · par rh@acme.fr')).toBeInTheDocument();
  });

  it('rend le contenu en texte brut (retours à la ligne conservés, HTML non interprété)', () => {
    const { container } = render(
      <FilAnnonces
        today={TODAY}
        annonces={[annonce({ id: 'a1', titre: 'Info', contenu: 'Ligne 1\nLigne 2 <b>gras</b>' })]}
      />,
    );
    const paragraphe = screen.getByText(/Ligne 1/);
    expect(paragraphe).toHaveClass('whitespace-pre-line');
    expect(paragraphe.textContent).toBe('Ligne 1\nLigne 2 <b>gras</b>');
    expect(container.querySelector('b')).toBeNull();
  });

  it('badge de statut (vue gestionnaire), mode compact et actions', () => {
    render(
      <FilAnnonces
        today={TODAY}
        afficherStatut
        compact
        annonces={[
          annonce({ id: 'a1', titre: 'Brouillon', publiee: false }),
          annonce({ id: 'a2', titre: 'Plus tard', datePublication: '2026-11-01' }),
        ]}
        renderActions={(a) => <button type="button">Action {a.id}</button>}
      />,
    );
    expect(screen.getByText('Brouillon', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('Programmée')).toBeInTheDocument();
    for (const p of screen.getAllByText('Contenu', { selector: 'p' })) {
      expect(p).toHaveClass('line-clamp-4');
    }
    expect(screen.getByRole('button', { name: 'Action a2' })).toBeInTheDocument();
  });

  it('affiche l’état vide', () => {
    render(<FilAnnonces today={TODAY} annonces={[]} vide="Rien à signaler." />);
    expect(screen.getByText('Rien à signaler.')).toBeInTheDocument();
  });
});
