'use client';

import { useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';

import { CommuneAutocompleteFields } from '@/components/geo/commune-autocomplete-fields';
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { estPaysFrance } from '@/lib/geo/pays';

type Props<T extends FieldValues> = {
  control: Control<T>;
};

/**
 * Section "Adresse postale" partagée entre les formulaires fournisseur et
 * sous-traitant. Toutes les colonnes sont optionnelles (sauf `pays` qui a un
 * default applicatif 'France'). Le pays est saisi AVANT le code postal : hors de
 * France, le code postal devient libre (pas de format 5 chiffres ni de
 * suggestions de communes françaises).
 */
export function AdresseFields<T extends FieldValues>({ control }: Props<T>) {
  const pays = useWatch({ control, name: 'pays' as Path<T> }) as string | null | undefined;

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
      <CommuneAutocompleteFields control={control} horsFrance={!estPaysFrance(pays)} />
    </div>
  );
}
