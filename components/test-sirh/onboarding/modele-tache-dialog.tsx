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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatDelai } from '@/lib/test-sirh/onboarding/planification';
import { LIBELLES_RESPONSABLE_TACHE, RESPONSABLES_TACHE } from '@/lib/validation/test-sirh/enums';
import { modeleTacheSchema, type ModeleTacheInput } from '@/lib/validation/test-sirh/onboarding';

const OPTIONS_RESPONSABLE = optionsDepuisEnum(RESPONSABLES_TACHE, LIBELLES_RESPONSABLE_TACHE);

/** Valeurs initiales : TOUTES les clés sont présentes. */
export function valeursModeleTacheParDefaut(
  modeleId: string,
  tache?: Partial<ModeleTacheInput> | null,
): ModeleTacheInput {
  return {
    id: tache?.id,
    modeleId: tache?.modeleId ?? modeleId,
    libelle: tache?.libelle ?? '',
    description: tache?.description ?? null,
    responsable: tache?.responsable ?? 'rh',
    delaiJours: tache?.delaiJours ?? 0,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modeleId: string;
  /** Tâche à modifier ; `null` = ajout en fin de liste. */
  tache: Partial<ModeleTacheInput> | null;
  onSubmit: (values: ModeleTacheInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale d'ajout / modification d'une tâche de modèle (délai relatif en jours). */
export function ModeleTacheDialog({ open, onOpenChange, modeleId, tache, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(tache?.id);

  const form = useForm<ModeleTacheInput>({
    resolver: typedZodResolver(modeleTacheSchema),
    defaultValues: valeursModeleTacheParDefaut(modeleId, tache),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursModeleTacheParDefaut(modeleId, tache));
      setErreur(null);
    }
  }, [open, modeleId, tache, form]);

  // La saisie arrive en chaîne depuis le champ number (convertie par le schéma).
  const delaiBrut = String(form.watch('delaiJours') ?? '').trim();
  const delaiSaisi = delaiBrut === '' ? Number.NaN : Number(delaiBrut);

  async function handleSubmit(values: ModeleTacheInput) {
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
    toast.success(enEdition ? 'Tâche mise à jour' : 'Tâche ajoutée au modèle');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier la tâche' : 'Nouvelle tâche du modèle'}</DialogTitle>
          <DialogDescription>
            L’échéance est calculée à partir de la date de référence du processus (arrivée,
            départ…).
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

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                name="delaiJours"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Délai (jours)</FormLabel>
                    <FormControl>
                      <Input type="number" step={1} min={-365} max={365} {...field} />
                    </FormControl>
                    <FormDescription className="text-xs">
                      {Number.isInteger(delaiSaisi)
                        ? `${formatDelai(delaiSaisi)} — négatif = avant la date de référence.`
                        : 'Négatif = avant la date de référence.'}
                    </FormDescription>
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Ajouter la tâche'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
