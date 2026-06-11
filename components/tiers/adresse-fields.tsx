'use client';

import { type Control, type FieldValues, type Path } from 'react-hook-form';

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
    <section className="space-y-4">
      <h3 className="text-sm font-medium text-muted-foreground">Adresse</h3>
      <FormField
        control={control}
        name={'adresseLigne1' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Adresse (ligne 1)</FormLabel>
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
            <FormLabel>Adresse (ligne 2)</FormLabel>
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <FormField
          control={control}
          name={'codePostal' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Code postal</FormLabel>
              <FormControl>
                <Input
                  maxLength={5}
                  inputMode="numeric"
                  placeholder="69001"
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
          name={'ville' as Path<T>}
          render={({ field }) => (
            <FormItem className="col-span-2">
              <FormLabel>Ville</FormLabel>
              <FormControl>
                <Input
                  maxLength={100}
                  placeholder="Lyon"
                  {...field}
                  value={(field.value as string | null) ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
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
    </section>
  );
}
