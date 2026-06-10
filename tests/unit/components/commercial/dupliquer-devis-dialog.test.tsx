import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DupliquerDevisDialog } from '@/components/commercial/dupliquer-devis-dialog';

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { toast } from 'sonner';

describe('DupliquerDevisDialog', () => {
  let action: ReturnType<typeof vi.fn>;
  let onClose: ReturnType<typeof vi.fn>;
  let onSuccess: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    action = vi.fn().mockResolvedValue({
      ok: true,
      data: { id: 'new-devis-id', numero: 'DV-2026-0042' },
    });
    onClose = vi.fn();
    onSuccess = vi.fn();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  function renderAvec(opts: {
    open?: boolean;
    peutVersionner?: boolean;
  } = {}) {
    return render(
      <DupliquerDevisDialog
        open={opts.open ?? true}
        onClose={onClose}
        action={action}
        peutVersionner={opts.peutVersionner ?? true}
        onSuccess={onSuccess}
      />,
    );
  }

  // ─── Rendu ───────────────────────────────────────────────────────────

  describe('rendu', () => {
    it('ne rend rien si open=false', () => {
      renderAvec({ open: false });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('rend le dialog avec les 2 choix si open=true', () => {
      renderAvec();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(screen.getByText('Nouvelle version pour ce client')).toBeInTheDocument();
      expect(screen.getByText('Pour un autre client')).toBeInTheDocument();
    });

    it('avec peutVersionner=true : option « même client » sélectionnée par défaut', () => {
      renderAvec({ peutVersionner: true });
      const radioMeme = screen.getByRole('radio', { name: /Nouvelle version pour ce client/i });
      expect(radioMeme).toBeChecked();
    });

    it('avec peutVersionner=false : option « même client » désactivée, « autre client » sélectionnée par défaut', () => {
      renderAvec({ peutVersionner: false });
      const radioMeme = screen.getByRole('radio', { name: /Nouvelle version pour ce client/i });
      const radioAutre = screen.getByRole('radio', { name: /Pour un autre client/i });
      expect(radioMeme).toBeDisabled();
      expect(radioAutre).toBeChecked();
    });

    it('avec peutVersionner=false : message d\'erreur de droit visible', () => {
      renderAvec({ peutVersionner: false });
      expect(screen.getByText(/Droit manquant/)).toBeInTheDocument();
    });
  });

  // ─── Sélection mode ─────────────────────────────────────────────────

  describe('changement de mode', () => {
    it('clic sur « autre client » coche cette option', () => {
      renderAvec({ peutVersionner: true });
      const radioAutre = screen.getByRole('radio', { name: /Pour un autre client/i });
      fireEvent.click(radioAutre);
      expect(radioAutre).toBeChecked();
    });
  });

  // ─── Confirmation ───────────────────────────────────────────────────

  describe('clic Dupliquer', () => {
    it('mode=meme_client appelle action("meme_client")', async () => {
      renderAvec({ peutVersionner: true });
      fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('meme_client');
      });
    });

    it('mode=autre_client appelle action("autre_client") après sélection', async () => {
      renderAvec({ peutVersionner: true });
      fireEvent.click(screen.getByRole('radio', { name: /Pour un autre client/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
      await waitFor(() => {
        expect(action).toHaveBeenCalledWith('autre_client');
      });
    });

    it('succès → toast + onSuccess(id, numero) + onClose', async () => {
      renderAvec();
      fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
      await waitFor(() => {
        expect(toast.success).toHaveBeenCalled();
        expect(onSuccess).toHaveBeenCalledWith('new-devis-id', 'DV-2026-0042');
        expect(onClose).toHaveBeenCalled();
      });
    });

    it('échec → toast.error sans onSuccess ni onClose', async () => {
      action.mockResolvedValueOnce({ ok: false, error: 'Permission refusée' });
      renderAvec();
      fireEvent.click(screen.getByRole('button', { name: 'Dupliquer' }));
      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Permission refusée');
      });
      expect(onSuccess).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  // ─── Fermeture ──────────────────────────────────────────────────────

  describe('fermeture', () => {
    it('clic sur « Annuler » → onClose', () => {
      renderAvec();
      fireEvent.click(screen.getByRole('button', { name: 'Annuler' }));
      expect(onClose).toHaveBeenCalled();
    });

    it('touche Échap → onClose', () => {
      renderAvec();
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(onClose).toHaveBeenCalled();
    });
  });
});
