import '@testing-library/jest-dom/vitest';

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DevisEditor } from '@/components/commercial/devis-editor';
import type { DevisInput } from '@/lib/validation/commercial';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

const CLIENT = {
  id: 'cli-1',
  code: 'C001',
  libelle: 'Dupont Maçonnerie',
  adresseLigne1: '12 rue des Bâtisseurs',
  adresseLigne2: 'Bâtiment B',
  codePostal: '69001',
  ville: 'Lyon',
  email: 'contact@dupont-maconnerie.fr',
};

function renderEditor(defaultValues: Partial<DevisInput>) {
  return render(
    <DevisEditor
      clients={[CLIENT]}
      articles={[]}
      unites={[]}
      defaultValues={defaultValues}
      onSubmit={vi.fn().mockResolvedValue({ ok: true })}
      successRedirect="/devis"
      workflowStatutCourant="brouillon"
      peutGererPostesInternes={false}
    />,
  );
}

describe("DevisEditor — en-tête Affaire / Client", () => {
  afterEach(cleanup);

  it("affiche l'adresse et l'e-mail du client sélectionné", () => {
    renderEditor({ clientId: 'cli-1' });

    expect(screen.getByText('Dupont Maçonnerie')).toBeInTheDocument();
    expect(screen.getByText('12 rue des Bâtisseurs')).toBeInTheDocument();
    expect(screen.getByText('Bâtiment B')).toBeInTheDocument();
    expect(screen.getByText('69001 Lyon')).toBeInTheDocument();

    const mail = screen.getByRole('link', { name: 'contact@dupont-maconnerie.fr' });
    expect(mail).toHaveAttribute('href', 'mailto:contact@dupont-maconnerie.fr');
  });

  it("invite à choisir un client tant qu'aucun n'est sélectionné", () => {
    renderEditor({ clientId: '' });

    expect(
      screen.getByText(/Sélectionne un client pour afficher son adresse/),
    ).toBeInTheDocument();
    expect(screen.queryByText('Dupont Maçonnerie')).not.toBeInTheDocument();
  });

  it("masque la 2e ligne d'adresse quand elle est absente", () => {
    render(
      <DevisEditor
        clients={[{ ...CLIENT, adresseLigne2: null, email: null }]}
        articles={[]}
        unites={[]}
        defaultValues={{ clientId: 'cli-1' }}
        onSubmit={vi.fn().mockResolvedValue({ ok: true })}
        successRedirect="/devis"
        workflowStatutCourant="brouillon"
        peutGererPostesInternes={false}
      />,
    );

    expect(screen.getByText('12 rue des Bâtisseurs')).toBeInTheDocument();
    expect(screen.queryByText('Bâtiment B')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /@/ })).not.toBeInTheDocument();
  });

  it('présente les deux dates empilées (les unes sous les autres)', () => {
    renderEditor({ clientId: 'cli-1' });

    const dateDevis = screen.getByText('Date du devis');
    const dateValidite = screen.getByText(/Valable jusqu/);
    expect(dateDevis).toBeInTheDocument();
    expect(dateValidite).toBeInTheDocument();

    // Les deux dates partagent le même conteneur vertical (space-y-4),
    // distinct du bloc « Coordonnées client » à gauche.
    const colonneDates = dateDevis.closest('div.space-y-4');
    expect(colonneDates).not.toBeNull();
    expect(colonneDates).toContainElement(dateValidite);
  });
});
