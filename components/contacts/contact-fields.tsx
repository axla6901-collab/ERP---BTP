'use client';

import {
  type Control,
  type FieldValues,
  type Path,
  useFormContext,
  useWatch,
} from 'react-hook-form';

import { FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';

type Props<T extends FieldValues> = {
  control: Control<T>;
};

/**
 * Champs d'un contact (nom, prénom, fonction, coordonnées, notes, actif,
 * principal), partagés par toutes les frames de saisie de contact :
 * `ContactCreateDialog` (annuaire) et `ContactDialog` (fiche d'un tiers).
 *
 * Générique sur le type du formulaire : les noms de champs (`nom`, `prenom`…)
 * sont communs à `contactSchema` et `creerContactSchema`. La règle métier
 * « un contact inactif ne peut pas être principal » est appliquée ici (le
 * switch principal est désactivé et remis à false quand `actif` passe à false).
 */
export function ContactFields<T extends FieldValues>({ control }: Props<T>) {
  const form = useFormContext<T>();
  const actif = useWatch({ control, name: 'actif' as Path<T> }) as boolean | undefined;

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={'nom' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Nom *</FormLabel>
              <FormControl>
                <Input maxLength={100} {...field} value={(field.value as string) ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={'prenom' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Prénom</FormLabel>
              <FormControl>
                <Input maxLength={100} {...field} value={(field.value as string | null) ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={'fonction' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Fonction</FormLabel>
            <FormControl>
              <Input
                maxLength={100}
                placeholder="Chargé d'affaires, Comptable, Conducteur de travaux…"
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
        name={'email' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Email</FormLabel>
            <FormControl>
              <Input
                type="email"
                maxLength={200}
                {...field}
                value={(field.value as string | null) ?? ''}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name={'telephoneMobile' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Mobile</FormLabel>
              <FormControl>
                <Input maxLength={30} {...field} value={(field.value as string | null) ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={'telephoneFixe' as Path<T>}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Fixe</FormLabel>
              <FormControl>
                <Input maxLength={30} {...field} value={(field.value as string | null) ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={'notes' as Path<T>}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Notes</FormLabel>
            <FormControl>
              <Textarea maxLength={1000} {...field} value={(field.value as string | null) ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex flex-wrap items-center gap-6">
        <FormField
          control={control}
          name={'actif' as Path<T>}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Switch
                  checked={field.value as boolean}
                  onCheckedChange={(v) => {
                    field.onChange(v);
                    // Un contact inactif ne peut pas être principal.
                    if (!v)
                      form.setValue('principal' as Path<T>, false as never, { shouldDirty: true });
                  }}
                />
              </FormControl>
              <FormLabel className="!mt-0">Actif</FormLabel>
            </FormItem>
          )}
        />
        <FormField
          control={control}
          name={'principal' as Path<T>}
          render={({ field }) => (
            <FormItem className="flex items-center gap-2">
              <FormControl>
                <Switch
                  checked={field.value as boolean}
                  disabled={!actif}
                  onCheckedChange={field.onChange}
                />
              </FormControl>
              <FormLabel className="!mt-0">Contact principal</FormLabel>
            </FormItem>
          )}
        />
      </div>
    </>
  );
}
