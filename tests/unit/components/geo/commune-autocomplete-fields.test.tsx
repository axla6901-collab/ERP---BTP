import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CommuneAutocompleteFields } from '@/components/geo/commune-autocomplete-fields';
import { Form } from '@/components/ui/form';
import type { CommuneSuggestion } from '@/lib/geo/codes-postaux';

const LYON: CommuneSuggestion = {
  codePostal: '69001',
  commune: 'LYON',
  codeInsee: '69381',
  departement: '69',
  latitude: 45.767,
  longitude: 4.834,
};

function Harness() {
  const form = useForm({ defaultValues: { codePostal: '', ville: '', codeInsee: '' } });
  return (
    <Form {...form}>
      <CommuneAutocompleteFields control={form.control} codeInseeName="codeInsee" />
      <output data-testid="cp">{form.watch('codePostal')}</output>
      <output data-testid="ville">{form.watch('ville')}</output>
      <output data-testid="insee">{form.watch('codeInsee')}</output>
    </Form>
  );
}

function mockFetch(resultats: CommuneSuggestion[]) {
  return vi.fn(async () => ({
    ok: true,
    json: async () => ({ resultats }),
  })) as unknown as typeof fetch;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch([LYON]));
});

describe('CommuneAutocompleteFields', () => {
  it('affiche les deux champs Code postal et Ville', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Code postal')).toBeInTheDocument();
    expect(screen.getByLabelText('Ville')).toBeInTheDocument();
  });

  it('propose des communes après saisie du code postal et remplit les deux champs à la sélection', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Code postal'), { target: { value: '690' } });

    const option = await waitFor(() => screen.getByText('69001 — LYON'));
    fireEvent.mouseDown(option);

    expect(screen.getByTestId('cp')).toHaveTextContent('69001');
    expect(screen.getByTestId('ville')).toHaveTextContent('LYON');
    expect(screen.getByTestId('insee')).toHaveTextContent('69381');
  });

  it('propose des communes après saisie du nom de ville', async () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Ville'), { target: { value: 'lyo' } });

    const option = await waitFor(() => screen.getByText('LYON (69001)'));
    fireEvent.mouseDown(option);

    expect(screen.getByTestId('cp')).toHaveTextContent('69001');
    expect(screen.getByTestId('ville')).toHaveTextContent('LYON');
  });

  it('ne déclenche aucune recherche sous 2 caractères', async () => {
    const f = mockFetch([LYON]);
    vi.stubGlobal('fetch', f);
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Code postal'), { target: { value: '6' } });
    // Laisse passer le délai de debounce.
    await new Promise((r) => setTimeout(r, 350));
    expect(f).not.toHaveBeenCalled();
  });
});
