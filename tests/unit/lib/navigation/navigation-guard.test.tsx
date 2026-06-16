import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  NavigationGuardProvider,
  useNavigationGuard,
  useUnsavedChangesGuard,
} from '@/lib/hooks/navigation-guard';

// La garde n'utilise useRouter que dans useGuardedRouter (non testé ici), mais
// l'import de next/navigation doit être mockable dans l'environnement jsdom.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    refresh: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

// jsdom n'implémente pas showModal()/close() : polyfill minimal qui bascule
// l'attribut `open` et émet l'événement `close` attendu par le provider.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close() {
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
});

function Harness({
  isDirty,
  onSave,
  action,
}: {
  isDirty: boolean;
  onSave?: () => Promise<boolean>;
  action: () => void;
}) {
  const { tryNavigate } = useNavigationGuard();
  useUnsavedChangesGuard(onSave ? { isDirty, onSave } : { isDirty });
  return (
    <button type="button" onClick={() => tryNavigate(action)}>
      naviguer
    </button>
  );
}

function setup(props: { isDirty: boolean; onSave?: () => Promise<boolean>; action: () => void }) {
  render(
    <NavigationGuardProvider>
      <Harness {...props} />
    </NavigationGuardProvider>,
  );
}

const dialog = () => document.querySelector('dialog');

describe('NavigationGuardProvider', () => {
  afterEach(() => cleanup());

  it('navigue immédiatement si aucun formulaire dirty', () => {
    const action = vi.fn();
    setup({ isDirty: false, action });

    fireEvent.click(screen.getByText('naviguer'));

    expect(action).toHaveBeenCalledTimes(1);
    expect(dialog()?.open).toBe(false);
  });

  it('ouvre la dialog sans naviguer si un formulaire est dirty', () => {
    const action = vi.fn();
    setup({ isDirty: true, onSave: vi.fn().mockResolvedValue(true), action });

    fireEvent.click(screen.getByText('naviguer'));

    expect(action).not.toHaveBeenCalled();
    expect(dialog()?.open).toBe(true);
    expect(screen.getByText('Enregistrer et quitter')).toBeInTheDocument();
  });

  it('« Enregistrer et quitter » : succès → exécute l’action et ferme la dialog', async () => {
    const action = vi.fn();
    const onSave = vi.fn().mockResolvedValue(true);
    setup({ isDirty: true, onSave, action });

    fireEvent.click(screen.getByText('naviguer'));
    fireEvent.click(screen.getByText('Enregistrer et quitter'));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(dialog()?.open).toBe(false));
  });

  it('« Enregistrer et quitter » : échec → ferme la dialog et ne navigue pas (régression : ne restait pas silencieux)', async () => {
    const action = vi.fn();
    const onSave = vi.fn().mockResolvedValue(false);
    setup({ isDirty: true, onSave, action });

    fireEvent.click(screen.getByText('naviguer'));
    expect(dialog()?.open).toBe(true);

    fireEvent.click(screen.getByText('Enregistrer et quitter'));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    // La dialog se ferme pour révéler le feedback d'erreur du formulaire…
    await waitFor(() => expect(dialog()?.open).toBe(false));
    // …et la navigation n'a PAS eu lieu (l'utilisateur reste pour corriger).
    expect(action).not.toHaveBeenCalled();
  });

  it('« Quitter sans enregistrer » : navigue sans appeler onSave', () => {
    const action = vi.fn();
    const onSave = vi.fn().mockResolvedValue(true);
    setup({ isDirty: true, onSave, action });

    fireEvent.click(screen.getByText('naviguer'));
    fireEvent.click(screen.getByText('Quitter sans enregistrer'));

    expect(onSave).not.toHaveBeenCalled();
    expect(action).toHaveBeenCalledTimes(1);
  });

  it('« Annuler » : ferme la dialog sans naviguer', () => {
    const action = vi.fn();
    setup({ isDirty: true, onSave: vi.fn().mockResolvedValue(true), action });

    fireEvent.click(screen.getByText('naviguer'));
    fireEvent.click(screen.getByText('Annuler'));

    expect(action).not.toHaveBeenCalled();
    expect(dialog()?.open).toBe(false);
  });

  it('masque « Enregistrer et quitter » si le formulaire dirty n’a pas de onSave', () => {
    const action = vi.fn();
    setup({ isDirty: true, action });

    fireEvent.click(screen.getByText('naviguer'));

    expect(dialog()?.open).toBe(true);
    expect(screen.queryByText('Enregistrer et quitter')).not.toBeInTheDocument();
    expect(screen.getByText('Quitter sans enregistrer')).toBeInTheDocument();
  });
});
