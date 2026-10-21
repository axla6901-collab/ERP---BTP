'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, type OptionListe } from '@/components/test-sirh/option-select';
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
import { droitsParDefaut } from '@/lib/test-sirh/absences/soldes';
import type { CompteurLigne, TypeAbsenceSolde } from '@/lib/test-sirh/absences/types';
import { periodeReference } from '@/lib/test-sirh/calendrier';
import { compteurSchema, type CompteurInput } from '@/lib/validation/test-sirh/absences';
import { LIBELLES_UNITE_DECOMPTE } from '@/lib/validation/test-sirh/enums';

/** Valeurs initiales (toutes les clés) : période de référence BTP avril → mars par défaut. */
export function valeursCompteurParDefaut(
  compteur: CompteurLigne | null,
  types: readonly TypeAbsenceSolde[],
  today: string,
): CompteurInput {
  const periode = periodeReference(today);
  const type = types[0];
  return {
    id: compteur?.id,
    employeId: compteur?.employeId ?? '',
    typeAbsenceId: compteur?.typeAbsenceId ?? type?.id ?? '',
    periodeDebut: compteur?.periodeDebut ?? periode.debut,
    periodeFin: compteur?.periodeFin ?? periode.fin,
    droitsAcquis: String(compteur ? compteur.droitsAcquis : type ? droitsParDefaut(type) : 0),
    report: String(compteur ? compteur.report : 0),
    notes: compteur?.notes ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Compteur à modifier ; `null` = création. */
  compteur: CompteurLigne | null;
  employes: readonly OptionListe[];
  types: readonly TypeAbsenceSolde[];
  today: string;
  onSubmit: (values: CompteurInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création / modification d'un compteur de droits (Factorial Allowance). */
export function CompteurDialog({
  open,
  onOpenChange,
  compteur,
  employes,
  types,
  today,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const enEdition = compteur !== null;
  const defauts = useMemo(
    () => valeursCompteurParDefaut(compteur, types, today),
    [compteur, types, today],
  );

  const form = useForm<CompteurInput>({
    resolver: typedZodResolver(compteurSchema),
    defaultValues: defauts,
  });

  useEffect(() => {
    if (open) {
      form.reset(defauts);
      setErreur(null);
    }
  }, [open, defauts, form]);

  const typeId = form.watch('typeAbsenceId');
  const unite = types.find((t) => t.id === typeId)?.uniteDecompte;

  async function handleSubmit(values: CompteurInput) {
    setErreur(null);
    const result = await onSubmit(values);
    if (!result.ok) {
      setErreur(result.error);
      if (result.fieldErrors) {
        for (const [field, msgs] of Object.entries(result.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    toast.success(enEdition ? 'Compteur mis à jour' : 'Compteur créé');
    onOpenChange(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le compteur' : 'Nouveau compteur'}</DialogTitle>
          <DialogDescription>
            Droits d’un collaborateur pour un type d’absence sur une période de référence (BTP : 1er
            avril → 31 mars).
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
              name="employeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Collaborateur</FormLabel>
                  <OptionSelect
                    options={employes}
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? '')}
                    libelleAucune="Choisir un collaborateur…"
                    aria-label="Collaborateur"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="typeAbsenceId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type d’absence</FormLabel>
                  <OptionSelect
                    options={types}
                    value={field.value || null}
                    onChange={(v) => {
                      field.onChange(v ?? '');
                      const nouveau = types.find((t) => t.id === v);
                      if (!enEdition && nouveau) {
                        form.setValue('droitsAcquis', String(droitsParDefaut(nouveau)));
                      }
                    }}
                    autoriserAucune={false}
                    aria-label="Type d’absence"
                  />
                  {unite && (
                    <p className="text-xs text-muted-foreground">
                      Unité : {LIBELLES_UNITE_DECOMPTE[unite]}
                    </p>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="periodeDebut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Début de période</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="periodeFin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin de période</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="droitsAcquis"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Droits acquis</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="report"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Report (période précédente)</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={enCours}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={enCours}>
                {enCours ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le compteur'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
