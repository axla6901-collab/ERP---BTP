import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';

import { WorkflowDevis } from '@/components/commercial/workflow-devis';
import type { StatutDevis } from '@/lib/validation/commercial';

const routerRefresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: routerRefresh,
    push: vi.fn(),
    back: vi.fn(),
    replace: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

describe('WorkflowDevis', () => {
  let action: ReturnType<typeof vi.fn>;
  let confirmSpy: MockInstance<(message?: string) => boolean>;

  beforeEach(() => {
    action = vi.fn().mockResolvedValue({ ok: true });
    vi.clearAllMocks();
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  afterEach(() => {
    cleanup();
    confirmSpy.mockRestore();
  });

  function renderAvec(
    statut: StatutDevis,
    opts: {
      readOnly?: boolean;
      devisId?: string | undefined;
      numero?: string | undefined;
      sansAction?: boolean;
      enregistrerLabel?: string;
      enregistrerDisabled?: boolean;
      onImporterDpgf?: () => void;
      onDupliquer?: () => void;
    } = {},
  ) {
    return render(
      <WorkflowDevis
        devisId={opts.devisId ?? 'devis-1'}
        numero={opts.numero}
        statutCourant={statut}
        readOnly={opts.readOnly ?? false}
        action={opts.sansAction ? undefined : action}
        enregistrerLabel={opts.enregistrerLabel}
        enregistrerDisabled={opts.enregistrerDisabled}
        onImporterDpgf={opts.onImporterDpgf}
        onDupliquer={opts.onDupliquer}
      />,
    );
  }

  // ─── Rendu des étapes (4 fixes + 1 dynamique, sans Refusé) ──────────

  describe('rendu des étapes', () => {
    it('affiche les 4 étapes fixes + sous-libellés Gagné/Perdu, SANS Refusé', () => {
      renderAvec('brouillon');
      expect(screen.getByText('Brouillon')).toBeInTheDocument();
      expect(screen.getByText('En validation')).toBeInTheDocument();
      expect(screen.getByText('Validé')).toBeInTheDocument();
      expect(screen.getByText('Envoyé')).toBeInTheDocument();
      expect(screen.getByText('Gagné')).toBeInTheDocument();
      expect(screen.getByText('Perdu')).toBeInTheDocument();
      expect(screen.queryByText('Refusé')).not.toBeInTheDocument();
    });

    it('Brouillon est courante quand statut=brouillon', () => {
      renderAvec('brouillon');
      expect(screen.getByRole('button', { name: 'Brouillon' })).toHaveAttribute(
        'aria-current',
        'step',
      );
    });

    it('Brouillon est courante quand statut=refuse (legacy)', () => {
      renderAvec('refuse');
      expect(screen.getByRole('button', { name: 'Brouillon' })).toHaveAttribute(
        'aria-current',
        'step',
      );
    });

    it('5e étape : « Gagné » quand statut=gagne', () => {
      renderAvec('gagne');
      expect(screen.getByText('Gagné')).toBeInTheDocument();
      expect(screen.queryByText('Perdu')).not.toBeInTheDocument();
    });

    it('5e étape : « Perdu » quand statut=perdu', () => {
      renderAvec('perdu');
      expect(screen.getByText('Perdu')).toBeInTheDocument();
      expect(screen.queryByText('Gagné')).not.toBeInTheDocument();
    });

    it('badge « Annulé » quand statut=annule', () => {
      renderAvec('annule');
      const badge = screen.getByText('Annulé');
      expect(badge.tagName).toBe('SPAN');
    });
  });

  // ─── Affichage du numéro de devis ───────────────────────────────────

  describe('affichage du numéro', () => {
    it('affiche le numéro dans la barre sticky quand fourni', () => {
      renderAvec('brouillon', { numero: 'DEV-2026-00042' });
      expect(screen.getByText('DEV-2026-00042')).toBeInTheDocument();
    });

    it("n'affiche pas de bloc numéro quand non fourni (création)", () => {
      const { container } = renderAvec('brouillon');
      // Pas de texte commençant par "Devis " (le titre H2 est hors composant)
      expect(container.textContent).not.toMatch(/^Devis\s/);
    });
  });

  // ─── Cliquabilité des libellés d'étape ──────────────────────────────

  describe("cliquabilité des libellés d'étape", () => {
    it('depuis brouillon : seul En validation cliquable', () => {
      renderAvec('brouillon');
      expect(screen.getByRole('button', { name: 'En validation' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Brouillon' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Validé' })).toBeDisabled();
    });

    it('depuis en_validation : Validé cliquable, Brouillon NON (refus via bouton dédié)', () => {
      renderAvec('en_validation');
      expect(screen.getByRole('button', { name: 'Validé' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Brouillon' })).toBeDisabled();
    });

    it('depuis envoye : Gagné et Perdu cliquables', () => {
      renderAvec('envoye');
      expect(screen.getByRole('button', { name: 'Gagné' })).not.toBeDisabled();
      expect(screen.getByRole('button', { name: 'Perdu' })).not.toBeDisabled();
    });

    it('depuis gagne : aucun libellé cliquable', () => {
      renderAvec('gagne');
      expect(screen.getByRole('button', { name: 'Brouillon' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Envoyé' })).toBeDisabled();
    });
  });

  // ─── Bouton « Refuser » avec confirmation ───────────────────────────

  describe('bouton Refuser', () => {
    it('absent depuis brouillon', () => {
      renderAvec('brouillon');
      expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    });

    it('présent depuis en_validation', () => {
      renderAvec('en_validation');
      expect(screen.getByRole('button', { name: 'Refuser' })).toBeInTheDocument();
    });

    it('clic + confirmation → action("devis-1", "brouillon")', async () => {
      confirmSpy.mockReturnValue(true);
      renderAvec('en_validation');
      fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
      expect(confirmSpy).toHaveBeenCalled();
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('devis-1', 'brouillon');
      });
    });

    it('clic + annulation → action NON appelée', () => {
      confirmSpy.mockReturnValue(false);
      renderAvec('en_validation');
      fireEvent.click(screen.getByRole('button', { name: 'Refuser' }));
      expect(action).not.toHaveBeenCalled();
    });

    it('readOnly → bouton absent', () => {
      renderAvec('en_validation', { readOnly: true });
      expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    });
  });

  // ─── Bouton « Annulé » (transition statut) ──────────────────────────

  describe('bouton Annulé (statut)', () => {
    it.each(['brouillon', 'en_validation', 'refuse', 'valide', 'envoye'] as const)(
      'visible depuis %s',
      (statut) => {
        renderAvec(statut);
        expect(screen.getByRole('button', { name: 'Annulé' })).toBeInTheDocument();
      },
    );

    it.each(['gagne', 'perdu', 'annule'] as const)('absent depuis %s', (statut) => {
      renderAvec(statut);
      expect(screen.queryByRole('button', { name: 'Annulé' })).not.toBeInTheDocument();
    });

    it('clic → action("devis-1", "annule")', async () => {
      renderAvec('brouillon');
      fireEvent.click(screen.getByRole('button', { name: 'Annulé' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('devis-1', 'annule');
      });
    });
  });

  // ─── Bouton « Enregistrer » (submit du form parent) ─────────────────

  describe('bouton Enregistrer', () => {
    it('absent si enregistrerLabel non fourni', () => {
      renderAvec('brouillon');
      expect(
        screen.queryByRole('button', { name: 'Enregistrer le devis' }),
      ).not.toBeInTheDocument();
    });

    it('rendu avec le libellé fourni et type="submit"', () => {
      renderAvec('brouillon', { enregistrerLabel: 'Enregistrer le devis' });
      const btn = screen.getByRole('button', { name: 'Enregistrer le devis' });
      expect(btn).toHaveAttribute('type', 'submit');
    });

    it('disabled quand enregistrerDisabled=true', () => {
      renderAvec('brouillon', { enregistrerLabel: 'Enregistrer', enregistrerDisabled: true });
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
    });
  });

  // ─── Bouton « Importer DPGF » ───────────────────────────────────────

  describe('bouton Importer DPGF', () => {
    it('absent si onImporterDpgf non fourni', () => {
      renderAvec('brouillon');
      expect(screen.queryByRole('button', { name: 'Importer DPGF' })).not.toBeInTheDocument();
    });

    it('clic appelle le callback onImporterDpgf', () => {
      const onImporterDpgf = vi.fn();
      renderAvec('brouillon', { onImporterDpgf });
      fireEvent.click(screen.getByRole('button', { name: 'Importer DPGF' }));
      expect(onImporterDpgf).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Bouton « Dupliquer » ───────────────────────────────────────────

  describe('bouton Dupliquer', () => {
    it('absent si onDupliquer non fourni', () => {
      renderAvec('brouillon');
      expect(screen.queryByRole('button', { name: 'Dupliquer' })).not.toBeInTheDocument();
    });

    it('clic appelle le callback onDupliquer', () => {
      const onDupliquer = vi.fn();
      renderAvec('brouillon', { onDupliquer });
      fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
      expect(onDupliquer).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Interactions de transition standard ────────────────────────────

  describe('transitions standard', () => {
    it('clic sur En validation depuis brouillon → action("devis-1", "en_validation")', async () => {
      renderAvec('brouillon');
      fireEvent.click(screen.getByRole('button', { name: 'En validation' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('devis-1', 'en_validation');
      });
    });

    it('clic sur Validé depuis en_validation → action("devis-1", "valide")', async () => {
      renderAvec('en_validation');
      fireEvent.click(screen.getByRole('button', { name: 'Validé' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('devis-1', 'valide');
      });
    });

    it('clic sur Gagné depuis envoye → action("devis-1", "gagne")', async () => {
      renderAvec('envoye');
      fireEvent.click(screen.getByRole('button', { name: 'Gagné' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('devis-1', 'gagne');
      });
    });

    it('clic sur Perdu depuis envoye → action("devis-1", "perdu")', async () => {
      renderAvec('envoye');
      fireEvent.click(screen.getByRole('button', { name: 'Perdu' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('devis-1', 'perdu');
      });
    });

    it('action.ok=true → toast.success + router.refresh', async () => {
      renderAvec('brouillon');
      fireEvent.click(screen.getByRole('button', { name: 'En validation' }));
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
        expect(routerRefresh).toHaveBeenCalled();
      });
    });

    it('action.ok=false → toast.error sans refresh', async () => {
      action.mockResolvedValueOnce({ ok: false, error: 'Permission refusée' });
      renderAvec('brouillon');
      fireEvent.click(screen.getByRole('button', { name: 'En validation' }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Permission refusée');
      });
      expect(routerRefresh).not.toHaveBeenCalled();
    });
  });

  // ─── Mode readOnly ───────────────────────────────────────────────────

  describe('mode readOnly', () => {
    it("aucun libellé d'étape cliquable", () => {
      renderAvec('brouillon', { readOnly: true });
      expect(screen.getByRole('button', { name: 'En validation' })).toBeDisabled();
      expect(screen.getByRole('button', { name: 'Validé' })).toBeDisabled();
    });

    it('aucun bouton de transition statut rendu (Refuser, Annulé)', () => {
      renderAvec('envoye', { readOnly: true });
      expect(screen.queryByRole('button', { name: 'Annulé' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Refuser' })).not.toBeInTheDocument();
    });

    it('Enregistrer/Importer DPGF restent rendus si fournis (indépendants du readOnly statut)', () => {
      renderAvec('brouillon', {
        readOnly: true,
        enregistrerLabel: 'Enregistrer',
        onImporterDpgf: vi.fn(),
      });
      expect(screen.getByRole('button', { name: 'Enregistrer' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Importer DPGF' })).toBeInTheDocument();
    });

    it('sans devisId ni action, render sans crash', () => {
      render(<WorkflowDevis statutCourant="brouillon" readOnly />);
      expect(screen.getByText('Brouillon')).toBeInTheDocument();
    });
  });
});
