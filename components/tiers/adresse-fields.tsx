'use client';

import { type Control, type FieldValues, type Path } from 'react-hook-form';

import { CommuneAutocompleteFields } from '@/components/geo/commune-autocomplete-fields';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';

type Props<T extends FieldValues> = {
  control: Control<T>;
};

/**
 * Section "Adresse postale" partagée entre les formulaires fournisseur et
 * sous-traitant. Toutes les colonnes sont optionnelles (sauf `pays` qui a un
 * default applicatif 'France').
 */
export function AdresseFields<T extends FieldValues>({ control }: Props<T>) {
  return (
    <div className="space-y-4">
      <FormField
        control={control}
        name={'adresseLigne1' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Adresse ligne 1</FormLabel>
            <FormControl>
              <Input
                maxLength={200}
                placeholder="12 rue de la République"
                {...field}
                value={(field.value as string | null) ?? ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={control}
        name={'adresseLigne2' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Adresse ligne 2</FormLabel>
            <FormControl>
              <Input
                maxLength={200}
                placeholder="Bât. B — 2e étage"
                {...field}
                value={(field.value as string | null) ?? ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <CommuneAutocompleteFields control={control} />
      <FormField
        control={control}
        name={'pays' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Pays</FormLabel>
            <FormControl>
              <Input maxLength={100} {...field} value={(field.value as string) ?? 'France'} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
