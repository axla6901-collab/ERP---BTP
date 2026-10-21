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
import type { PeriodeBloqueeLigne } from '@/lib/test-sirh/absences/types';
import {
  periodeBloqueeSchema,
  type PeriodeBloqueeInput,
} from '@/lib/validation/test-sirh/absences';

/** Valeurs initiales (toutes les clés). */
export function valeursPeriodeBloqueeParDefaut(
  periode: PeriodeBloqueeLigne | null,
  today: string,
): PeriodeBloqueeInput {
  return {
    id: periode?.id,
    libelle: periode?.libelle ?? '',
    dateDebut: periode?.dateDebut ?? today,
    dateFin: periode?.dateFin ?? today,
    typeAbsenceId: periode?.typeAbsenceId ?? null,
    equipeId: periode?.equipeId ?? null,
    motif: periode?.motif ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Période à modifier ; `null` = création. */
  periode: PeriodeBloqueeLigne | null;
  types: readonly OptionListe[];
  equipes: readonly OptionListe[];
  today: string;
  onSubmit: (values: PeriodeBloqueeInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création / modification d'une période bloquée (Factorial BlockedPeriod). */
export function PeriodeBloqueeDialog({
  open,
  onOpenChange,
  periode,
  types,
  equipes,
  today,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const enEdition = periode !== null;
  const defauts = useMemo(() => valeursPeriodeBloqueeParDefaut(periode, today), [periode, today]);

  const form = useForm<PeriodeBloqueeInput>({
    resolver: typedZodResolver(periodeBloqueeSchema),
    defaultValues: defauts,
  });

  useEffect(() => {
    if (open) {
      form.reset(defauts);
      setErreur(null);
    }
  }, [open, defauts, form]);

  async function handleSubmit(values: PeriodeBloqueeInput) {
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
    toast.success(enEdition ? 'Période bloquée mise à jour' : 'Période bloquée créée');
    onOpenChange(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {enEdition ? 'Modifier la période bloquée' : 'Nouvelle période bloquée'}
          </DialogTitle>
          <DialogDescription>
            Aucune demande d’absence ne pourra chevaucher cette période. Sans type précis, seuls les
            types soumis à validation sont bloqués (les arrêts restent déclarables).
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
                    <Input maxLength={120} placeholder="ex. Livraison chantier" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateDebut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Du</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateFin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Au</FormLabel>
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
                name="typeAbsenceId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Type d’absence</FormLabel>
                    <OptionSelect
                      options={types}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Tous (soumis à validation)"
                      aria-label="Type d’absence"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="equipeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Équipe</FormLabel>
                    <OptionSelect
                      options={equipes}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Toutes les équipes"
                      aria-label="Équipe"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="motif"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motif</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={500} {...field} value={field.value ?? ''} />
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
                {enCours ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer la période'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
