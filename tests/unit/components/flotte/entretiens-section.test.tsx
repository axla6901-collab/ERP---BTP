import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { EntretiensSection } from '@/components/flotte/entretiens-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn() } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const actions = {
  enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
  supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
};

const entretiens = [
  {
    id: 'e1',
    typeEntretien: 'vidange' as const,
    dateEntretien: '2026-06-10',
    kilometrage: 87450,
    description: 'Vidange + filtres',
    prestataire: 'Garage Martin',
    fournisseurNom: null,
    coutHt: '320.00',
    garantie: true,
  },
  {
    id: 'e2',
    typeEntretien: 'pneumatiques' as const,
    dateEntretien: '2026-03-02',
    kilometrage: null,
    description: '4 pneus',
    prestataire: null,
    fournisseurNom: 'Euromaster',
    coutHt: '680.00',
    garantie: false,
  },
];

describe('EntretiensSection', () => {
  it('affiche les entretiens, le garage et le total cumulé', () => {
    render(
      <EntretiensSection
        vehiculeId="v1"
        entretiens={entretiens}
        fournisseurs={[]}
        peutEcrire
        actions={actions}
      />,
    );
    expect(screen.getByText('Vidange')).toBeInTheDocument();
    expect(screen.getByText('Garage Martin')).toBeInTheDocument();
    expect(screen.getByText('Euromaster')).toBeInTheDocument();
    expect(screen.getByText('Garantie')).toBeInTheDocument();
    // Total = 320 + 680 = 1 000 €.
    expect(screen.getByText('1 000 €')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /ajouter un entretien/i })).toBeInTheDocument();
  });

  it("masque les actions d'écriture en lecture seule et affiche l'état vide", () => {
    render(
      <EntretiensSection
        vehiculeId="v1"
        entretiens={[]}
        fournisseurs={[]}
        peutEcrire={false}
        actions={actions}
      />,
    );
    expect(screen.getByText(/aucun entretien/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter un entretien/i })).not.toBeInTheDocument();
  });
});
