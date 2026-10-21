import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AffectationSection,
  type AffectationAffichee,
} from '@/components/test-sirh/collaborateurs/affectation-section';
import { CompteUtilisateurSection } from '@/components/test-sirh/collaborateurs/compte-utilisateur-section';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const TODAY = '2026-10-19';
const EMPLOYE = '3f2b8c1e-6d4a-4e7b-9a1c-2b3c4d5e6f70';

// UUID v4 valides : le formulaire revalide les identifiants côté client (zod v4).
const affectation: AffectationAffichee = {
  posteId: '5b6c7d8e-9f0a-4b1c-8d2e-3f4a5b6c7d8e',
  posteIntitule: 'Chef d’équipe',
  siteId: '1d2c3b4a-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  siteNom: 'Agence de Lyon',
  managerId: '8a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  managerNom: 'Julie Durand',
  horaireId: null,
  horaireNom: null,
  societeId: null,
  societeLibelle: null,
  emailProfessionnel: 'marc.dubois@btp.fr',
  telephoneProfessionnel: '06 12 34 56 78',
  dateAnciennete: '2015-05-01',
  notes: null,
};

const optionsVides = { postes: [], sites: [], managers: [], horaires: [], societes: [] };

describe('AffectationSection', () => {
  it('affiche l’affectation et l’ancienneté reprise', () => {
    render(
      <AffectationSection
        employeId={EMPLOYE}
        affectation={affectation}
        dateAncienneteEffective="2015-05-01"
        today={TODAY}
        peutGerer={false}
        options={optionsVides}
        onSubmit={vi.fn()}
      />,
    );
    expect(screen.getByText('Chef d’équipe')).toBeInTheDocument();
    expect(screen.getByText('Agence de Lyon')).toBeInTheDocument();
    expect(screen.getByText('Julie Durand')).toBeInTheDocument();
    expect(screen.getByText('marc.dubois@btp.fr')).toHaveAttribute(
      'href',
      'mailto:marc.dubois@btp.fr',
    );
    expect(screen.getByText(/11 ans 5 mois/)).toBeInTheDocument();
    expect(screen.getByText(/\(reprise\)/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /affectation/i })).not.toBeInTheDocument();
  });

  it('sans affectation : message et bouton « Renseigner »', async () => {
    const onSubmit = vi.fn().mockResolvedValue({ ok: true, data: { id: 'a1' } });
    render(
      <AffectationSection
        employeId={EMPLOYE}
        affectation={null}
        dateAncienneteEffective={null}
        today={TODAY}
        peutGerer
        options={optionsVides}
        onSubmit={onSubmit}
      />,
    );
    expect(screen.getByText(/aucune affectation sirh/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /renseigner l’affectation/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Email professionnel'), {
      target: { value: 'marc@btp.fr' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        employeId: EMPLOYE,
        posteId: null,
        siteId: null,
        managerId: null,
        horaireId: null,
        societeId: null,
        emailProfessionnel: 'marc@btp.fr',
        telephoneProfessionnel: null,
        dateAnciennete: null,
        notes: null,
      }),
    );
  });

  it('affiche l’erreur serveur sur le champ concerné', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error:
        'Ce manager est déjà placé sous la responsabilité de ce collaborateur (boucle hiérarchique).',
      fieldErrors: { managerId: ['Boucle hiérarchique.'] },
    });
    render(
      <AffectationSection
        employeId={EMPLOYE}
        affectation={affectation}
        dateAncienneteEffective="2015-05-01"
        today={TODAY}
        peutGerer
        options={optionsVides}
        onSubmit={onSubmit}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /modifier l’affectation/i }));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Enregistrer' }));
    expect(await within(dialog).findByText('Boucle hiérarchique.')).toBeInTheDocument();
    expect(within(dialog).getByText(/boucle hiérarchique\)/)).toBeInTheDocument();
  });
});

describe('CompteUtilisateurSection', () => {
  const actions = {
    rattacher: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
    detacher: vi.fn().mockResolvedValue({ ok: true, data: undefined }),
  };
  const utilisateurs = [
    { id: 'u1', label: 'marc@btp.fr' },
    { id: 'u2', label: 'lea@btp.fr' },
  ];

  it('compte rattaché : affiché puis détachable après confirmation', async () => {
    render(
      <CompteUtilisateurSection
        employeId={EMPLOYE}
        compte={{ utilisateurId: 'u1', email: 'marc@btp.fr' }}
        utilisateurs={utilisateurs}
        comptesRattaches={[{ utilisateurId: 'u1', employeId: EMPLOYE, employeNom: 'Marc Dubois' }]}
        actions={actions}
      />,
    );
    expect(screen.getByText('marc@btp.fr')).toBeInTheDocument();
    expect(screen.getByText('Rattacher un autre compte')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Détacher' }));
    const question = screen.getByText('Détacher ce compte ?');
    fireEvent.click(within(question.parentElement!).getByRole('button', { name: 'Détacher' }));
    await waitFor(() => expect(actions.detacher).toHaveBeenCalledWith(EMPLOYE));
  });

  it('sans compte : message, comptes déjà pris masqués, bouton désactivé sans choix', () => {
    render(
      <CompteUtilisateurSection
        employeId={EMPLOYE}
        compte={null}
        utilisateurs={utilisateurs}
        comptesRattaches={[{ utilisateurId: 'u2', employeId: 'autre', employeNom: 'Léa Martin' }]}
        actions={actions}
      />,
    );
    expect(screen.getByText(/aucun compte rattaché/i)).toBeInTheDocument();
    expect(
      screen.getByText(/1 compte déjà rattaché à d’autres collaborateurs est masqué/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /rattacher/i })).toBeDisabled();
  });
});
