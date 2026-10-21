'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, optionsDepuisEnum } from '@/components/test-sirh/option-select';
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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { objectifSchema, type ObjectifInput } from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_STATUT_OBJECTIF, STATUTS_OBJECTIF } from '@/lib/validation/test-sirh/enums';

const OPTIONS_STATUT = optionsDepuisEnum(STATUTS_OBJECTIF, LIBELLES_STATUT_OBJECTIF);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursObjectifParDefaut(
  employeId: string,
  o?: Partial<ObjectifInput> | null,
): ObjectifInput {
  return {
    id: o?.id,
    employeId: o?.employeId ?? employeId,
    entretienId: o?.entretienId ?? null,
    libelle: o?.libelle ?? '',
    description: o?.description ?? null,
    dateEcheance: o?.dateEcheance ?? null,
    poids: o?.poids ?? null,
    progression: o?.progression ?? 0,
    statut: o?.statut ?? 'en_cours',
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeId: string;
  /** Entretien de la page (rattachement proposé) ; null hors entretien. */
  entretienId: string | null;
  /** Objectif à modifier ; `null` = création (rattaché à l'entretien par défaut). */
  objectif: Partial<ObjectifInput> | null;
  /** L'évaluateur (non RH) ne gère que les objectifs rattachés à son entretien. */
  rattachementImpose: boolean;
  onSubmit: (values: ObjectifInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création / modification d'un objectif individuel (RHF + Zod). */
export function ObjectifDialog({
  open,
  onOpenChange,
  employeId,
  entretienId,
  objectif,
  rattachementImpose,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(objectif?.id);

  const initiales = (): ObjectifInput =>
    valeursObjectifParDefaut(employeId, objectif ?? { entretienId });

  const form = useForm<ObjectifInput>({
    resolver: typedZodResolver(objectifSchema),
    defaultValues: initiales(),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursObjectifParDefaut(employeId, objectif ?? { entretienId }));
      setErreur(null);
    }
  }, [open, objectif, employeId, entretienId, form]);

  async function handleSubmit(values: ObjectifInput) {
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
    toast.success(enEdition ? 'Objectif mis à jour' : 'Objectif créé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier l’objectif' : 'Nouvel objectif'}</DialogTitle>
          <DialogDescription>
            Objectif individuel : échéance, poids dans l’évaluation et avancement.
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
                  <FormLabel>Description / indicateur de réussite</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="dateEcheance"
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
              <FormField
                control={form.control}
                name="statut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statut</FormLabel>
                    <OptionSelect
                      options={OPTIONS_STATUT}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v ?? 'en_cours');
                        if (v === 'atteint') form.setValue('progression', 100);
                      }}
                      autoriserAucune={false}
                      aria-label="Statut de l’objectif"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="poids"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Poids (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="progression"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Progression (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={100}
                        {...field}
                        value={field.value ?? ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {entretienId && (
              <FormField
                control={form.control}
                name="entretienId"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2">
                    <FormControl>
                      <Switch
                        checked={field.value === entretienId}
                        onCheckedChange={(coche) => field.onChange(coche ? entretienId : null)}
                        disabled={rattachementImpose}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Rattacher à cet entretien</FormLabel>
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer l’objectif'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
