'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { LIBELLES_RESPONSABLE_TACHE, RESPONSABLES_TACHE } from '@/lib/validation/test-sirh/enums';
import { tacheSchema, type TacheInput } from '@/lib/validation/test-sirh/onboarding';

const OPTIONS_RESPONSABLE = optionsDepuisEnum(RESPONSABLES_TACHE, LIBELLES_RESPONSABLE_TACHE);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursTacheParDefaut(
  tache?: Partial<TacheInput> | null,
  processusId?: string | null,
): TacheInput {
  return {
    id: tache?.id,
    processusId: tache?.processusId ?? processusId ?? null,
    employeId: tache?.employeId ?? null,
    libelle: tache?.libelle ?? '',
    description: tache?.description ?? null,
    responsable: tache?.responsable ?? 'rh',
    assigneA: tache?.assigneA ?? null,
    echeance: tache?.echeance ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tâche à modifier ; `null` = création. */
  tache: Partial<TacheInput> | null;
  /** Création dans ce processus ; absent / null = tâche autonome. */
  processusId?: string | null;
  /** Comptes assignables (`listerUtilisateursOptions`). */
  utilisateurs: readonly OptionListe[];
  /** Collaborateurs (tâche autonome uniquement). */
  employes?: readonly OptionListe[];
  onSubmit: (values: TacheInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'une tâche RH (ad hoc ou autonome). */
export function TacheDialog({
  open,
  onOpenChange,
  tache,
  processusId,
  utilisateurs,
  employes,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(tache?.id);
  // Le collaborateur n'est choisi que pour une tâche autonome (sinon : celui du processus).
  const autonome = !(tache?.processusId ?? processusId);

  const form = useForm<TacheInput>({
    resolver: typedZodResolver(tacheSchema),
    defaultValues: valeursTacheParDefaut(tache, processusId),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursTacheParDefaut(tache, processusId));
      setErreur(null);
    }
  }, [open, tache, processusId, form]);

  async function handleSubmit(values: TacheInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onSubmit(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(enEdition ? 'Tâche mise à jour' : 'Tâche ajoutée');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier la tâche' : 'Nouvelle tâche'}</DialogTitle>
          <DialogDescription>
            {autonome
              ? 'Tâche RH autonome, éventuellement rattachée à un collaborateur.'
              : 'Tâche du processus : elle concerne le collaborateur du processus.'}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="libelle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Libellé</FormLabel>
                  <FormControl>
                    <Input maxLength={200} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="responsable"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsable</FormLabel>
                    <OptionSelect
                      options={OPTIONS_RESPONSABLE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'rh')}
                      autoriserAucune={false}
                      aria-label="Responsable"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="assigneA"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assignée à</FormLabel>
                    <OptionSelect
                      options={utilisateurs}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Non assignée"
                      aria-label="Assignée à"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="echeance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Échéance</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {autonome && employes && (
              <FormField
                control={form.control}
                name="employeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Collaborateur concerné</FormLabel>
                    <OptionSelect
                      options={employes}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Aucun"
                      aria-label="Collaborateur concerné"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Ajouter la tâche'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
