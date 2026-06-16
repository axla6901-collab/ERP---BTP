import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { SousTraitantRailCreation } from '@/components/tiers/sous-traitant-rail-creation';

afterEach(() => {
  cleanup();
});

describe('SousTraitantRailCreation', () => {
  it('affiche les cartes du rail à l’état « disponible après enregistrement »', () => {
    const { getByText } = render(<SousTraitantRailCreation />);
    expect(getByText('Synthèse de conformité')).toBeInTheDocument();
    expect(getByText('Cascade & retenue de garantie')).toBeInTheDocument();
    expect(getByText('Contacts')).toBeInTheDocument();
    expect(getByText('Vigilance & pièces')).toBeInTheDocument();
    expect(getByText('loi 75-1334')).toBeInTheDocument();
    expect(getByText(/après enregistrement/i)).toBeInTheDocument();
  });
});
