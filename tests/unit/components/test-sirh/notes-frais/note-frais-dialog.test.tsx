import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  NoteFraisDialog,
  valeursNoteFraisParDefaut,
  type NoteFraisEditable,
} from '@/components/test-sirh/notes-frais/note-frais-dialog';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

beforeAll(() => {
  // Base UI (Dialog, Select, Switch) s'appuie sur des API absentes de jsdom.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as never;
  if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = () => {};
  if (!('PointerEvent' in window)) {
    // @ts-expect-error polyfill minimal pour jsdom (le Switch construit un PointerEvent au clic)
    window.PointerEvent = class extends MouseEvent {};
    // @ts-expect-error idem côté global
    globalThis.PointerEvent = window.PointerEvent;
  }
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';
const NOTE_ID = '9b1d4c2e-7a3f-4c8d-8e2b-1f0a9c8d7e6b';
const TODAY = '2026-10-19';

function actionsOk() {
  return {
    enregistrerBrouillon: vi
      .fn()
      .mockResolvedValue({ ok: true, data: { id: NOTE_ID, statut: 'brouillon' } }),
    soumettre: vi.fn().mockResolvedValue({ ok: true, data: { id: NOTE_ID, statut: 'soumise' } }),
  };
}

function rendre(props: Partial<Parameters<typeof NoteFraisDialog>[0]> = {}) {
  const actions = props.actions ?? actionsOk();
  render(
    <NoteFraisDialog
      open
      onOpenChange={vi.fn()}
      note={null}
      employeFixe={{ id: EMPLOYE, label: 'Marc Dubois' }}
      chantiers={[]}
      today={TODAY}
      actions={actions}
      {...props}
    />,
  );
  return actions;
}

describe('valeursNoteFraisParDefaut', () => {
  it('crée une dépense du jour pour l’employé imposé', () => {
    const v = valeursNoteFraisParDefaut(null, EMPLOYE, TODAY);
    expect(v).toMatchObject({
      employeId: EMPLOYE,
      dateDepense: TODAY,
      nature: 'depense',
      montantTtc: null,
      vehiculeElectrique: false,
    });
  });

  it('reprend une note d’IK électrique existante', () => {
    const note: NoteFraisEditable = {
      id: NOTE_ID,
      employeId: EMPLOYE,
      dateDepense: '2026-10-02',
      nature: 'indemnite_km',
      categorie: 'transport',
      libelle: 'Dépôt → chantier',
      montantTtc: 76.3,
      montantTva: null,
      distanceKm: 100,
      puissanceFiscale: 5,
      tauxKm: 0.763,
      nbForfaits: null,
      montantUnitaire: null,
      chantierId: null,
      justificatifDocumentId: null,
      justificatifTitre: null,
    };
    expect(valeursNoteFraisParDefaut(note, null, TODAY)).toMatchObject({
      id: NOTE_ID,
      montantTtc: null,
      distanceKm: '100',
      tauxKm: '0.763',
      vehiculeElectrique: true,
    });
  });
});

/** Note d'IK existante (5 CV, 100 km) au taux donné. */
function noteIk(tauxKm: number, id = NOTE_ID): NoteFraisEditable {
  return {
    id,
    employeId: EMPLOYE,
    dateDepense: '2026-10-02',
    nature: 'indemnite_km',
    categorie: 'transport',
    libelle: 'Dépôt → chantier',
    montantTtc: 100 * tauxKm,
    montantTva: null,
    distanceKm: 100,
    puissanceFiscale: 5,
    tauxKm,
    nbForfaits: null,
    montantUnitaire: null,
    chantierId: null,
    justificatifDocumentId: null,
    justificatifTitre: null,
  };
}

describe('NoteFraisDialog — taux kilométrique personnalisé', () => {
  it('conserve un taux saisi à la main, puis revient au barème sur demande', async () => {
    rendre({ note: noteIk(0.5) });
    const taux = screen.getByLabelText(/taux/i);
    expect(taux).toHaveValue('0.500');
    fireEvent.change(screen.getByLabelText(/puissance fiscale/i), { target: { value: '6' } });
    expect(taux).toHaveValue('0.500');
    fireEvent.click(screen.getByRole('button', { name: 'Revenir au barème' }));
    await waitFor(() => expect(taux).toHaveValue('0.665'));
  });

  it('à la réouverture sur une autre note, ne remplace pas son taux personnalisé', async () => {
    const actions = actionsOk();
    const props = {
      onOpenChange: vi.fn(),
      employeFixe: { id: EMPLOYE, label: 'Marc Dubois' },
      chantiers: [],
      today: TODAY,
      actions,
    };
    const { rerender } = render(<NoteFraisDialog {...props} open note={noteIk(0.636)} />);
    expect(screen.getByLabelText(/taux/i)).toHaveValue('0.636');
    rerender(<NoteFraisDialog {...props} open={false} note={noteIk(0.636)} />);
    const autre = noteIk(0.45, '5c8e1a2b-3d4f-4a6b-9c7d-8e9f0a1b2c3d');
    rerender(<NoteFraisDialog {...props} open note={autre} />);
    await waitFor(() => expect(screen.getByLabelText(/taux/i)).toHaveValue('0.450'));
    fireEvent.click(screen.getByRole('button', { name: /enregistrer en brouillon/i }));
    await waitFor(() =>
      expect(actions.enregistrerBrouillon).toHaveBeenCalledWith(
        expect.objectContaining({ id: autre.id, tauxKm: '0.450' }),
      ),
    );
  });
});

describe('NoteFraisDialog', () => {
  it('soumet une dépense avec montants normalisés', async () => {
    const actions = rendre();
    expect(screen.getByText('Marc Dubois')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Libellé'), {
      target: { value: 'Déjeuner chantier' },
    });
    fireEvent.change(screen.getByLabelText(/montant ttc/i), { target: { value: '25,30' } });
    fireEvent.click(screen.getByRole('button', { name: '20 %' }));
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }));
    await waitFor(() =>
      expect(actions.soumettre).toHaveBeenCalledWith(
        expect.objectContaining({
          employeId: EMPLOYE,
          nature: 'depense',
          libelle: 'Déjeuner chantier',
          montantTtc: '25.30',
          montantTva: '4.22',
        }),
      ),
    );
    expect(actions.enregistrerBrouillon).not.toHaveBeenCalled();
  });

  it('enregistre un brouillon d’indemnités kilométriques au taux du barème', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: /kilomètres/i }));
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Dépôt → chantier' } });
    fireEvent.change(screen.getByLabelText(/distance/i), { target: { value: '42' } });
    fireEvent.change(screen.getByLabelText(/puissance fiscale/i), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByLabelText(/taux/i)).toHaveValue('0.636'));
    expect(screen.getByTestId('montant-calcule')).toHaveTextContent('26,71 €');
    fireEvent.click(screen.getByRole('button', { name: /enregistrer en brouillon/i }));
    await waitFor(() =>
      expect(actions.enregistrerBrouillon).toHaveBeenCalledWith(
        expect.objectContaining({
          nature: 'indemnite_km',
          categorie: 'transport',
          distanceKm: '42.0',
          puissanceFiscale: 5,
          tauxKm: '0.636',
        }),
      ),
    );
  });

  it('majore le taux de 20 % pour un véhicule électrique', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /kilomètres/i }));
    fireEvent.change(screen.getByLabelText(/puissance fiscale/i), { target: { value: '5' } });
    await waitFor(() => expect(screen.getByLabelText(/taux/i)).toHaveValue('0.636'));
    fireEvent.click(screen.getByRole('switch'));
    await waitFor(() => expect(screen.getByLabelText(/taux/i)).toHaveValue('0.763'));
  });

  it('calcule un forfait (nombre × unitaire)', async () => {
    rendre();
    fireEvent.click(screen.getByRole('button', { name: /forfait/i }));
    fireEvent.change(screen.getByLabelText(/nombre de forfaits/i), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText(/montant unitaire/i), { target: { value: '10,40' } });
    await waitFor(() => expect(screen.getByTestId('montant-calcule')).toHaveTextContent('52,00 €'));
  });

  it('bloque la soumission sans libellé ni montant', async () => {
    const actions = rendre();
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }));
    await waitFor(() => expect(screen.getByText('Libellé requis.')).toBeInTheDocument());
    expect(screen.getByText(/montant ttc requis/i)).toBeInTheDocument();
    expect(actions.soumettre).not.toHaveBeenCalled();
  });

  it('affiche l’erreur renvoyée par le serveur', async () => {
    const actions = {
      enregistrerBrouillon: vi.fn(),
      soumettre: vi.fn().mockResolvedValue({
        ok: false,
        error: 'La date de la dépense ne peut pas être dans le futur.',
        fieldErrors: { dateDepense: ['Date dans le futur.'] },
      }),
    };
    rendre({ actions });
    fireEvent.change(screen.getByLabelText('Libellé'), { target: { value: 'Péage A7' } });
    fireEvent.change(screen.getByLabelText(/montant ttc/i), { target: { value: '12' } });
    fireEvent.click(screen.getByRole('button', { name: 'Soumettre' }));
    await waitFor(() =>
      expect(
        screen.getByText('La date de la dépense ne peut pas être dans le futur.'),
      ).toBeInTheDocument(),
    );
    expect(screen.getByText('Date dans le futur.')).toBeInTheDocument();
  });

  it('propose le justificatif quand le téléversement est fourni', () => {
    rendre({
      actions: {
        ...actionsOk(),
        televersement: { preparerUpload: vi.fn(), creerDocument: vi.fn() },
      },
    });
    expect(screen.getByRole('button', { name: /joindre le justificatif/i })).toBeInTheDocument();
  });
});
