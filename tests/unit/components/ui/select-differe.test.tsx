import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SelectItem } from '@/components/ui/select';
import { SelectDiffere } from '@/components/ui/select-differe';

afterEach(cleanup);

function rendre(onValueChange = vi.fn(), value = 'u') {
  render(
    <SelectDiffere
      value={value}
      libelle={value || 'Unité'}
      onValueChange={onValueChange}
      aria-label="Unité"
      className="w-full"
    >
      <SelectItem value="u">u — unité</SelectItem>
      <SelectItem value="m2">m2 — mètre carré</SelectItem>
    </SelectDiffere>,
  );
  return onValueChange;
}

describe('SelectDiffere', () => {
  it('rend un déclencheur léger, sans monter la liste ni ses options', () => {
    rendre();
    const declencheur = screen.getByRole('combobox', { name: 'Unité' });
    expect(declencheur).toHaveTextContent('u');
    expect(declencheur).toHaveAttribute('aria-expanded', 'false');
    expect(declencheur).toHaveClass('w-full');
    expect(declencheur).not.toHaveAttribute('data-placeholder');
    expect(screen.queryByRole('option')).toBeNull();
  });

  it('marque l’invite quand aucune valeur n’est choisie', () => {
    rendre(vi.fn(), '');
    const declencheur = screen.getByRole('combobox', { name: 'Unité' });
    expect(declencheur).toHaveAttribute('data-placeholder', '');
    expect(declencheur).toHaveTextContent('Unité');
  });

  it('monte et ouvre la vraie liste au premier clic, puis transmet le choix', async () => {
    const onValueChange = rendre();
    fireEvent.click(screen.getByRole('combobox', { name: 'Unité' }));

    const option = await screen.findByRole('option', { name: 'm2 — mètre carré' });
    // Le vrai déclencheur a pris le focus (la liste le lui rendra à la fermeture).
    expect(screen.getByRole('combobox', { name: 'Unité' })).toHaveAttribute(
      'data-slot',
      'select-trigger',
    );
    option.focus();
    fireEvent.keyDown(option, { key: 'Enter' });
    expect(onValueChange).toHaveBeenCalledWith('m2');
  });

  it('s’ouvre aussi au clavier (flèche bas)', async () => {
    rendre();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Unité' }), { key: 'ArrowDown' });
    expect(await screen.findByRole('option', { name: 'u — unité' })).toBeInTheDocument();
  });
});
