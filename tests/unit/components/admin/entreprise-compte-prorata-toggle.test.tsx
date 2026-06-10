import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// jsdom n'implémente pas PointerEvent ; base-ui (Switch) en construit un au clic.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    // @ts-expect-error polyfill minimal pour jsdom
    window.PointerEvent = class extends MouseEvent {};
    // @ts-expect-error idem côté global
    globalThis.PointerEvent = window.PointerEvent;
  }
});

const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    success: (...a: unknown[]) => toastSuccess(...a),
    error: (...a: unknown[]) => toastError(...a),
  },
}));

import { EntrepriseCompteProrataToggle } from '@/components/admin/entreprise-compte-prorata-toggle';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('EntrepriseCompteProrataToggle', () => {
  it('bascule en optimistic puis confirme au succès', async () => {
    const onToggle = vi.fn().mockResolvedValue({ ok: true });
    render(<EntrepriseCompteProrataToggle initialActif={false} onToggle={onToggle} />);
    const sw = screen.getByRole('switch');
    expect(sw).not.toBeChecked();
    fireEvent.click(sw);
    await waitFor(() => expect(onToggle).toHaveBeenCalledWith(true));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    expect(sw).toBeChecked();
  });

  it('rollback de l’état visuel si la server action échoue', async () => {
    const onToggle = vi.fn().mockResolvedValue({ ok: false, error: 'Refusé' });
    render(<EntrepriseCompteProrataToggle initialActif={false} onToggle={onToggle} />);
    const sw = screen.getByRole('switch');
    fireEvent.click(sw);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Refusé'));
    await waitFor(() => expect(sw).not.toBeChecked());
  });
});
