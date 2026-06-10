import '@testing-library/jest-dom/vitest';

import { cleanup, render } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';

import { PostesInternesEditor } from '@/components/commercial/postes-internes-editor';
import type { DevisInput } from '@/lib/validation/commercial';

/** Wrapper qui fournit un form RHF minimaliste avec lignes/postesInternes. */
function Harness({
  defaultPostesCount = 0,
  forcerAffichage = false,
}: {
  defaultPostesCount?: number;
  forcerAffichage?: boolean;
}) {
  const form = useForm<DevisInput>({
    defaultValues: {
      clientId: '',
      dateDevis: '2026-01-01',
      dateValidite: '2026-01-31',
      objet: '',
      conditionsGenerales: '',
      notes: '',
      lignes: [],
      postesInternes: Array.from({ length: defaultPostesCount }, () => ({
        portee: 'devis' as const,
        chapitreOrdre: null,
        libelle: 'Frais',
        montantHt: '0',
        notes: null,
        repartitions: [],
      })),
    },
  });
  return <PostesInternesEditor form={form} forcerAffichage={forcerAffichage} />;
}

describe('PostesInternesEditor', () => {
  afterEach(() => cleanup());

  it('ne rend rien quand aucun poste interne n’est défini et `forcerAffichage` est faux', () => {
    const { container, queryByText } = render(<Harness />);
    expect(container.firstChild).toBeNull();
    expect(queryByText(/Postes internes ventilés/)).toBeNull();
  });

  it('affiche l’encart dès qu’un poste existe (via defaultValues)', () => {
    const { getByText } = render(<Harness defaultPostesCount={1} />);
    expect(getByText(/Postes internes ventilés/)).toBeInTheDocument();
  });

  it('affiche l’encart vide quand `forcerAffichage` est vrai (ex. import DPGF)', () => {
    const { getByText } = render(<Harness forcerAffichage />);
    expect(getByText(/Postes internes ventilés/)).toBeInTheDocument();
    expect(getByText(/Aucun poste interne/)).toBeInTheDocument();
  });
});
