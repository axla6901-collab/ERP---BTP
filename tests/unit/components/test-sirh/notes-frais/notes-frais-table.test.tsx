import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { NotesFraisTable } from '@/components/test-sirh/notes-frais/notes-frais-table';

import { EMPLOYE_2, ligneNoteFrais } from './fixtures';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useParams: () => ({ entrepriseSlug: 'acme' }),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

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

function actions() {
  return {
    enregistrerBrouillon: vi.fn(),
    soumettre: vi.fn(),
    soumettreBrouillon: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    decider: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    rembourser: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    urlTelechargement: vi.fn(),
  };
}

const NOTES = [
  ligneNoteFrais({
    id: 'n1',
    statut: 'brouillon',
    libelle: 'Péage A7',
    droits: { modifier: true, soumettre: true, supprimer: true } as never,
  }),
  ligneNoteFrais({
    id: 'n2',
    employeId: EMPLOYE_2,
    employeNom: 'Julie Martin',
    nature: 'indemnite_km',
    categorie: 'transport',
    libelle: 'Dépôt → chantier Les Tilleuls',
    montantTtc: 26.71,
    montantTva: null,
    distanceKm: 42,
    puissanceFiscale: 5,
    tauxKm: 0.636,
    chantierLabel: 'CH-2026-014 · Les Tilleuls',
    statut: 'soumise',
    droits: { decider: true } as never,
  }),
  ligneNoteFrais({
    id: 'n3',
    libelle: 'Hôtel Lyon',
    montantTtc: 89,
    statut: 'approuvee',
    commentaireDecision: 'OK pour le grand déplacement',
    droits: { rembourser: true } as never,
  }),
];

describe('NotesFraisTable', () => {
  it('affiche les notes, le détail du calcul et les statuts', () => {
    render(<NotesFraisTable notes={NOTES} chantiers={[]} today="2026-10-19" actions={actions()} />);
    expect(screen.getByText('Péage A7')).toBeInTheDocument();
    expect(screen.getByText('Julie Martin')).toBeInTheDocument();
    expect(screen.getByText(/42 km · 5 CV · 0,636 €\/km/)).toBeInTheDocument();
    expect(screen.getByText(/CH-2026-014/)).toBeInTheDocument();
    expect(screen.getByText('26,71 €')).toBeInTheDocument();
    expect(screen.getByText('Brouillon')).toBeInTheDocument();
    expect(screen.getByText('Approuvée')).toBeInTheDocument();
    expect(screen.getByText(/OK pour le grand déplacement/)).toBeInTheDocument();
  });

  it('n’affiche que les actions permises sur chaque ligne', () => {
    render(<NotesFraisTable notes={NOTES} chantiers={[]} today="2026-10-19" actions={actions()} />);
    const lignes = screen.getAllByRole('row');
    const brouillon = lignes.find((r) => within(r).queryByText('Péage A7'))!;
    expect(within(brouillon).getByRole('button', { name: 'Soumettre' })).toBeInTheDocument();
    expect(within(brouillon).getByRole('button', { name: 'Supprimer' })).toBeInTheDocument();
    expect(within(brouillon).queryByRole('button', { name: /approuver/i })).toBeNull();

    const soumise = lignes.find((r) => within(r).queryByText('Julie Martin'))!;
    expect(within(soumise).getByRole('button', { name: /approuver/i })).toBeInTheDocument();
    expect(within(soumise).queryByRole('button', { name: 'Supprimer' })).toBeNull();

    const approuvee = lignes.find((r) => within(r).queryByText('Hôtel Lyon'))!;
    expect(within(approuvee).getByRole('button', { name: /rembourser/i })).toBeInTheDocument();
  });

  it('masque la colonne collaborateur et le bouton de création selon les props', () => {
    render(
      <NotesFraisTable
        notes={NOTES}
        chantiers={[]}
        today="2026-10-19"
        actions={actions()}
        afficherEmploye={false}
      />,
    );
    expect(screen.queryByText('Julie Martin')).toBeNull();
    expect(screen.queryByRole('button', { name: /nouvelle note de frais/i })).toBeNull();
  });

  it('soumet un brouillon après confirmation', async () => {
    const a = actions();
    render(<NotesFraisTable notes={NOTES} chantiers={[]} today="2026-10-19" actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }));
    expect(screen.getByText('Soumettre à validation ?')).toBeInTheDocument();
    const boutons = screen.getAllByRole('button', { name: 'Soumettre' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(a.soumettreBrouillon).toHaveBeenCalledWith('n1'));
  });

  it('supprime un brouillon après confirmation', async () => {
    const a = actions();
    render(<NotesFraisTable notes={NOTES} chantiers={[]} today="2026-10-19" actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: 'Supprimer' }));
    const boutons = screen.getAllByRole('button', { name: 'Supprimer' });
    fireEvent.click(boutons[boutons.length - 1]!);
    await waitFor(() => expect(a.supprimer).toHaveBeenCalledWith('n1'));
  });

  it('marque une note approuvée remboursée à la date saisie', async () => {
    const a = actions();
    render(<NotesFraisTable notes={NOTES} chantiers={[]} today="2026-10-19" actions={a} />);
    fireEvent.click(screen.getByRole('button', { name: /rembourser/i }));
    const date = await screen.findByLabelText('Date de remboursement');
    expect(date).toHaveValue('2026-10-19');
    fireEvent.change(date, { target: { value: '2026-10-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Marquer remboursée' }));
    await waitFor(() => expect(a.rembourser).toHaveBeenCalledWith('n3', '2026-10-31'));
  });

  it('affiche l’état vide', () => {
    render(
      <NotesFraisTable
        notes={[]}
        chantiers={[]}
        today="2026-10-19"
        actions={actions()}
        peutCreer
      />,
    );
    expect(screen.getByText(/aucune note de frais/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /nouvelle note de frais/i })).toBeInTheDocument();
  });
});
