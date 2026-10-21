import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { EmbaucheDialog } from '@/components/test-sirh/recrutement/embauche-dialog';
import type { TypeContratSirh } from '@/lib/validation/test-sirh/enums';

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh, prefetch: vi.fn() }),
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

const BASE = '/acme/test-sirh';
const CANDIDATURE = 'c3333333-3333-4333-8333-333333333333';

function rendre(typeContratDefaut: TypeContratSirh, onSubmit = vi.fn()) {
  render(
    <EmbaucheDialog
      open
      onOpenChange={vi.fn()}
      candidature={{ id: CANDIDATURE, nom: 'Petit', prenom: 'Inès' }}
      typeContratDefaut={typeContratDefaut}
      today="2026-10-19"
      base={BASE}
      onSubmit={onSubmit}
    />,
  );
  return onSubmit;
}

describe('EmbaucheDialog', () => {
  it('propose le contrat de l’offre et affiche le type RH correspondant', () => {
    rendre('cdd');
    expect(screen.getByText('Embaucher Inès Petit')).toBeInTheDocument();
    expect(screen.getByLabelText('Date d’entrée')).toHaveValue('2026-10-19');
    expect(screen.getByText('CDD', { selector: 'span.font-medium' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Société d’intérim')).not.toBeInTheDocument();
  });

  it('apprentissage → contrat RH ALT', () => {
    rendre('apprentissage');
    expect(screen.getByText('ALT', { selector: 'span.font-medium' })).toBeInTheDocument();
  });

  it('intérim : société d’intérim obligatoire (CHECK employes)', async () => {
    const onSubmit = rendre('interim');
    expect(screen.getByText('INT', { selector: 'span.font-medium' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’embauche' }));
    await waitFor(() =>
      expect(
        screen.getByText('Société d’intérim requise pour un contrat d’intérim.'),
      ).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('confirme l’embauche puis propose le dossier collaborateur et l’onboarding', async () => {
    const onSubmit = vi
      .fn()
      .mockResolvedValue({ ok: true, data: { employeId: 'emp-9', offrePourvue: true } });
    rendre('interim', onSubmit);
    fireEvent.change(screen.getByLabelText('Société d’intérim'), {
      target: { value: 'Intérim BTP Rhône' },
    });
    fireEvent.change(screen.getByLabelText('Date d’entrée'), { target: { value: '2026-11-02' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’embauche' }));

    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        candidatureId: CANDIDATURE,
        dateEntree: '2026-11-02',
        typeContrat: 'interim',
        societeInterim: 'Intérim BTP Rhône',
      }),
    );
    expect(await screen.findByText(/fiche collaborateur créée/)).toBeInTheDocument();
    expect(screen.getByText(/l’offre passe « Pourvue »/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir le dossier collaborateur' })).toHaveAttribute(
      'href',
      `${BASE}/collaborateurs/emp-9`,
    );
    expect(screen.getByRole('link', { name: 'Lancer l’onboarding' })).toHaveAttribute(
      'href',
      `${BASE}/onboarding`,
    );
    // La server action revalide la page : pas de second rendu via router.refresh().
    expect(refresh).not.toHaveBeenCalled();
  });

  it('affiche le refus du serveur', async () => {
    const onSubmit = vi.fn().mockResolvedValue({
      ok: false,
      error: 'Ce candidat a déjà été embauché : sa fiche collaborateur existe.',
    });
    rendre('cdi', onSubmit);
    fireEvent.click(screen.getByRole('button', { name: 'Confirmer l’embauche' }));
    expect(
      await screen.findByText('Ce candidat a déjà été embauché : sa fiche collaborateur existe.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /dossier collaborateur/ })).not.toBeInTheDocument();
  });
});
