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
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import type { JourFerieLigne } from '@/lib/test-sirh/absences/types';
import { jourFerieSchema, type JourFerieInput } from '@/lib/validation/test-sirh/absences';

/** Valeurs initiales (toutes les clés) ; date par défaut = 1er janvier de l'année affichée. */
export function valeursJourFerieParDefaut(
  ferie: JourFerieLigne | null,
  annee: number,
): JourFerieInput {
  return {
    id: ferie?.id,
    dateFerie: ferie?.dateFerie ?? `${annee}-01-01`,
    libelle: ferie?.libelle ?? '',
    siteId: ferie?.siteId ?? null,
    chome: ferie?.chome ?? true,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Jour férié à modifier ; `null` = création. */
  ferie: JourFerieLigne | null;
  annee: number;
  sites: readonly OptionListe[];
  onSubmit: (values: JourFerieInput) => Promise<ActionResult<{ id: string }>>;
};

/** Ajout / modification d'un jour férié (global ou propre à un site). */
export function JourFerieDialog({ open, onOpenChange, ferie, annee, sites, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const enEdition = ferie !== null;
  const defauts = useMemo(() => valeursJourFerieParDefaut(ferie, annee), [ferie, annee]);

  const form = useForm<JourFerieInput>({
    resolver: typedZodResolver(jourFerieSchema),
    defaultValues: defauts,
  });

  useEffect(() => {
    if (open) {
      form.reset(defauts);
      setErreur(null);
    }
  }, [open, defauts, form]);

  async function handleSubmit(values: JourFerieInput) {
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
    toast.success(enEdition ? 'Jour férié mis à jour' : 'Jour férié ajouté');
    onOpenChange(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {enEdition ? 'Modifier le jour férié' : 'Ajouter un jour férié'}
          </DialogTitle>
          <DialogDescription>
            Un jour férié chômé est exclu du décompte des absences (jours ouvrés / ouvrables).
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateFerie"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="libelle"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Libellé</FormLabel>
                    <FormControl>
                      <Input maxLength={120} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Site</FormLabel>
                  <OptionSelect
                    options={sites}
                    value={field.value}
                    onChange={field.onChange}
                    libelleAucune="Tous les sites"
                    aria-label="Site"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="chome"
              render={({ field }) => (
                <FormItem className="flex items-start gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="grid gap-0.5">
                    <FormLabel className="!mt-0">Chômé</FormLabel>
                    <span className="text-xs text-muted-foreground">
                      Décochez pour un férié travaillé (ex. journée de solidarité).
                    </span>
                  </div>
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
                {enCours ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
