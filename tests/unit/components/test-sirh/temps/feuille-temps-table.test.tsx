import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { FeuilleTempsTable } from '@/components/test-sirh/temps/feuille-temps-table';
import {
  construireFeuilleTemps,
  type BadgeageSource,
  type EmployeFeuille,
} from '@/lib/test-sirh/temps/feuille-temps';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  // Base UI (Dialog/Select) s'appuie sur des API absentes de jsdom.
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

const E1 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f71';
const E2 = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f72';

const employes: EmployeFeuille[] = [
  {
    id: E1,
    nom: 'Martin',
    prenom: 'Paul',
    matricule: 'M001',
    horaire: [0, 7, 7, 7, 7, 7, 0],
    horaireNom: '35 h',
    siteId: null,
  },
  {
    id: E2,
    nom: 'Durand',
    prenom: 'Léa',
    matricule: null,
    horaire: [0, 7, 7, 7, 7, 7, 0],
    horaireNom: '35 h',
    siteId: null,
  },
];

function badgeage(p: Partial<BadgeageSource> & Pick<BadgeageSource, 'id'>): BadgeageSource {
  return {
    employeId: E1,
    dateBadgeage: '2026-10-19',
    heureDebut: '08:00:00',
    heureFin: '12:00:00',
    pauseMinutes: 0,
    lieu: 'chantier',
    chantierId: null,
    chantierLabel: 'CH-12 · Résidence Les Tilleuls',
    source: 'manuel',
    valide: false,
    commentaire: null,
    ...p,
  };
}

const feuille = construireFeuilleTemps({
  lundi: '2026-10-19',
  employes,
  badgeages: [
    badgeage({ id: 'b1', valide: true }),
    badgeage({ id: 'b2', heureDebut: '13:00:00', heureFin: '16:30:00' }),
    badgeage({ id: 'b3', employeId: E2, heureDebut: '07:30:00', heureFin: null }),
  ],
});

function actions() {
  return {
    enregistrer: vi.fn().mockResolvedValue({ ok: true, data: { id: 'x' } }),
    supprimer: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    valider: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    validerSemaine: vi.fn().mockResolvedValue({ ok: true, data: { nbValides: 1 } }),
  };
}

describe('FeuilleTempsTable', () => {
  it('affiche collaborateurs, jours, badgeages, totaux et écarts', () => {
    render(<FeuilleTempsTable feuille={feuille} today="2026-10-19" />);
    expect(screen.getByText('Martin Paul')).toBeInTheDocument();
    expect(screen.getByText('Durand Léa')).toBeInTheDocument();
    expect(screen.getByText('lun. 19/10')).toBeInTheDocument();
    expect(screen.getByText('dim. 25/10')).toBeInTheDocument();
    expect(screen.getByText('08:00 – 12:00')).toBeInTheDocument();
    expect(screen.getByText('07:30 – en cours')).toBeInTheDocument();
    // Martin : 7 h 30 travaillées pour 35 h théoriques.
    const ligneMartin = screen.getByText('Martin Paul').closest('tr')!;
    expect(within(ligneMartin).getByText('−27 h 30')).toBeInTheDocument();
    expect(within(ligneMartin).getAllByText('7 h 30').length).toBeGreaterThan(0);
    expect(screen.getByText('1 en cours')).toBeInTheDocument();
    // Détail d'un badgeage : lieu et chantier.
    expect(screen.getAllByText('Chantier').length).toBe(3);
    expect(screen.getAllByText('CH-12 · Résidence Les Tilleuls').length).toBe(3);
  });

  it('affiche la pause d’un badgeage', () => {
    const f = construireFeuilleTemps({
      lundi: '2026-10-19',
      employes: [employes[0]!],
      badgeages: [badgeage({ id: 'p', heureFin: '17:00:00', pauseMinutes: 60 })],
    });
    render(<FeuilleTempsTable feuille={f} today="2026-10-19" sansFiltre />);
    expect(screen.getByText('pause 60 min')).toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Collaborateurs affichés' }),
    ).not.toBeInTheDocument();
  });

  it('masque saisie et validation en lecture seule', () => {
    render(<FeuilleTempsTable feuille={feuille} today="2026-10-19" />);
    expect(screen.queryByRole('button', { name: /valider la semaine/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ajouter un badgeage/i })).not.toBeInTheDocument();
  });

  it('valide la semaine d’un collaborateur', async () => {
    const a = actions();
    render(
      <FeuilleTempsTable feuille={feuille} today="2026-10-19" peutSaisir peutValider actions={a} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Valider la semaine de Paul Martin' }));
    await waitFor(() =>
      expect(a.validerSemaine).toHaveBeenCalledWith({ employeId: E1, lundi: '2026-10-19' }),
    );
  });

  it('valide un badgeage terminé (pas un badgeage en cours)', async () => {
    const a = actions();
    render(
      <FeuilleTempsTable feuille={feuille} today="2026-10-19" peutSaisir peutValider actions={a} />,
    );
    expect(
      screen.queryByRole('button', { name: 'Valider le badgeage 07:30 – en cours' }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Valider le badgeage 13:00 – 16:30' }));
    await waitFor(() => expect(a.valider).toHaveBeenCalledWith('b2'));
  });

  it('un valideur non RH ne valide pas ses propres badgeages', () => {
    render(
      <FeuilleTempsTable
        feuille={feuille}
        today="2026-10-19"
        peutSaisir
        peutValider
        monEmployeId={E1}
        actions={actions()}
      />,
    );
    expect(
      screen.queryByRole('button', { name: 'Valider la semaine de Paul Martin' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 à valider')).toBeInTheDocument();
  });

  it('filtre les collaborateurs à valider', () => {
    render(<FeuilleTempsTable feuille={feuille} today="2026-10-19" />);
    fireEvent.click(screen.getByRole('button', { name: 'À valider' }));
    expect(screen.getByText('Martin Paul')).toBeInTheDocument();
    expect(screen.queryByText('Durand Léa')).not.toBeInTheDocument();
  });

  it('ouvre la saisie d’un badgeage pré-rempli', async () => {
    render(
      <FeuilleTempsTable
        feuille={feuille}
        today="2026-10-19"
        peutSaisir
        peutValider
        employes={[{ id: E1, label: 'Martin Paul' }]}
        actions={actions()}
      />,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Ajouter un badgeage pour Paul Martin le mar. 20/10' }),
    );
    expect(await screen.findByText('Nouveau badgeage')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toHaveValue('2026-10-20');
  });
});
