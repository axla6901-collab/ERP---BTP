'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatHeures, versNombre } from '@/lib/test-sirh/format';
import {
  CLES_HEURES_JOURS,
  horaireSchema,
  LIBELLES_JOURS_HORAIRE,
  type HoraireInput,
} from '@/lib/validation/test-sirh/temps';

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursHoraireParDefaut(h?: Partial<HoraireInput> | null): HoraireInput {
  return {
    id: h?.id,
    nom: h?.nom ?? '',
    description: h?.description ?? null,
    heuresLundi: h?.heuresLundi ?? '7',
    heuresMardi: h?.heuresMardi ?? '7',
    heuresMercredi: h?.heuresMercredi ?? '7',
    heuresJeudi: h?.heuresJeudi ?? '7',
    heuresVendredi: h?.heuresVendredi ?? '7',
    heuresSamedi: h?.heuresSamedi ?? '0',
    heuresDimanche: h?.heuresDimanche ?? '0',
    parDefaut: h?.parDefaut ?? false,
    actif: h?.actif ?? true,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Horaire à modifier ; `null` = création. */
  horaire: Partial<HoraireInput> | null;
  onSubmit: (values: HoraireInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'un horaire hebdomadaire (RHF + Zod). */
export function HoraireDialog({ open, onOpenChange, horaire, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(horaire?.id);

  const form = useForm<HoraireInput>({
    resolver: typedZodResolver(horaireSchema),
    defaultValues: valeursHoraireParDefaut(horaire),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursHoraireParDefaut(horaire));
      setErreur(null);
    }
  }, [open, horaire, form]);

  const heures = useWatch({ control: form.control, name: [...CLES_HEURES_JOURS] });
  const totalHebdo = heures.reduce((s, h) => s + (versNombre(h) ?? 0), 0);

  async function handleSubmit(values: HoraireInput) {
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
    toast.success(enEdition ? 'Horaire mis à jour' : 'Horaire créé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier l’horaire' : 'Nouvel horaire'}</DialogTitle>
          <DialogDescription>
            Heures théoriques par jour : base du calcul des écarts de la feuille de temps.
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
              name="nom"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nom</FormLabel>
                  <FormControl>
                    <Input maxLength={120} placeholder="ex. 39 h — BTP" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <fieldset className="grid gap-2">
              <legend className="mb-2 text-sm font-medium">Heures par jour</legend>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 lg:grid-cols-7">
                {CLES_HEURES_JOURS.map((cle) => (
                  <FormField
                    key={cle}
                    control={form.control}
                    name={cle}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-xs">{LIBELLES_JOURS_HORAIRE[cle]}</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" className="tabular-nums" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                ))}
              </div>
              <p className="text-sm text-muted-foreground" aria-live="polite">
                Total hebdomadaire :{' '}
                <span className="font-medium tabular-nums text-foreground">
                  {formatHeures(Math.round(totalHebdo * 100) / 100)}
                </span>
              </p>
            </fieldset>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={500} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="parDefaut"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Horaire par défaut</FormLabel>
                    </div>
                    <FormDescription className="text-xs">
                      Appliqué aux collaborateurs sans horaire ; remplace l’actuel.
                    </FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="actif"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Horaire actif</FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer l’horaire'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
