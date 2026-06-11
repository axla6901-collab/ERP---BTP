import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { FormSection, FormSubCard, SectionTotal } from '@/components/ui/form-section';

const STORAGE_KEY = 'form-section:devis:affaire-client';

beforeAll(() => {
  const store = new Map<string, string>();
  const memoryStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    key(index) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key) {
      store.delete(key);
    },
    setItem(key, value) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: memoryStorage,
  });
});

describe('FormSection', () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it('affiche le numéro et le titre', () => {
    render(
      <FormSection number={1} title="Affaire / Client">
        <p>contenu</p>
      </FormSection>,
    );

    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('1.Affaire / Client');
    expect(screen.getByText('contenu')).toBeVisible();
  });

  it('rend le slot droit (rightSlot)', () => {
    render(
      <FormSection
        number={2}
        title="Matériel"
        rightSlot={<SectionTotal label="Total matériel" value="10,04 €" />}
      >
        <p>lignes</p>
      </FormSection>,
    );

    expect(screen.getByText('Total matériel')).toBeInTheDocument();
    expect(screen.getByText('10,04 €')).toBeInTheDocument();
  });

  it('se replie et se déplie au clic sur l’en-tête', () => {
    render(
      <FormSection title="Section">
        <p>corps</p>
      </FormSection>,
    );

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('corps')).toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('corps')).not.toBeVisible();

    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('corps')).toBeVisible();
  });

  it('respecte defaultOpen=false', () => {
    render(
      <FormSection title="Section" defaultOpen={false}>
        <p>corps</p>
      </FormSection>,
    );

    expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.getByText('corps')).not.toBeVisible();
  });

  it('désactive le bouton et masque le chevron si collapsible=false', () => {
    render(
      <FormSection title="Section" collapsible={false}>
        <p>corps</p>
      </FormSection>,
    );

    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
  });

  describe('persistance localStorage', () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it('persiste l’état replié sous storageKey', () => {
      render(
        <FormSection title="Affaire" storageKey="devis:affaire-client">
          <p>corps</p>
        </FormSection>,
      );

      fireEvent.click(screen.getByRole('button'));
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('closed');

      fireEvent.click(screen.getByRole('button'));
      expect(window.localStorage.getItem(STORAGE_KEY)).toBe('open');
    });

    it('restaure l’état "closed" au montage', () => {
      window.localStorage.setItem(STORAGE_KEY, 'closed');

      render(
        <FormSection title="Affaire" storageKey="devis:affaire-client">
          <p>corps</p>
        </FormSection>,
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    });

    it('restaure l’état "open" même si defaultOpen=false', () => {
      window.localStorage.setItem(STORAGE_KEY, 'open');

      render(
        <FormSection title="Affaire" storageKey="devis:affaire-client" defaultOpen={false}>
          <p>corps</p>
        </FormSection>,
      );

      expect(screen.getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    });
  });
});

describe('FormSubCard', () => {
  afterEach(() => cleanup());

  it('affiche le titre et le contenu', () => {
    render(
      <FormSubCard title="Affaire">
        <p>champs</p>
      </FormSubCard>,
    );

    expect(screen.getByRole('heading', { level: 3 })).toHaveTextContent('Affaire');
    expect(screen.getByText('champs')).toBeInTheDocument();
  });

  it('rend le slot action', () => {
    render(
      <FormSubCard title="Affaire" action={<span>🔒 verrouillée</span>}>
        <p>champs</p>
      </FormSubCard>,
    );

    expect(screen.getByText(/verrouillée/i)).toBeInTheDocument();
  });
});

describe('SectionTotal', () => {
  afterEach(() => cleanup());

  it('rend le libellé et la valeur', () => {
    render(<SectionTotal label="Total matériel" value="10,04 €" />);
    expect(screen.getByText('Total matériel')).toBeInTheDocument();
    expect(screen.getByText('10,04 €')).toBeInTheDocument();
  });
});
