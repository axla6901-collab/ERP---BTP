import '@testing-library/jest-dom/vitest';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { afterEach, describe, expect, it } from 'vitest';

import { AdresseFields } from '@/components/tiers/adresse-fields';
import { Form } from '@/components/ui/form';

afterEach(cleanup);

function Harness({ pays = 'France' }: { pays?: string }) {
  const form = useForm({
    defaultValues: { adresseLigne1: '', adresseLigne2: '', codePostal: '', ville: '', pays },
  });
  return (
    <Form {...form}>
      <AdresseFields control={form.control} />
    </Form>
  );
}

describe('AdresseFields — code postal selon le pays', () => {
  it('saisit le pays avant le code postal', () => {
    render(<Harness />);
    const pays = screen.getByLabelText('Pays');
    const cp = screen.getByLabelText('Code postal');
    expect(pays.compareDocumentPosition(cp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('impose 5 chiffres pour une adresse en France', () => {
    render(<Harness />);
    expect(screen.getByLabelText('Code postal')).toHaveAttribute('maxLength', '5');
  });

  it('libère le code postal dès que le pays n’est plus la France', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('Pays'), { target: { value: 'Suisse' } });
    expect(screen.getByLabelText('Code postal')).toHaveAttribute('maxLength', '10');
  });

  it('ouvre une fiche étrangère existante directement en saisie libre', () => {
    render(<Harness pays="Royaume-Uni" />);
    expect(screen.getByLabelText('Code postal')).toHaveAttribute('maxLength', '10');
  });
});
