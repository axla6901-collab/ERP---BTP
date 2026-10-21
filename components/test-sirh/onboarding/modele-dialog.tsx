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
import { LIBELLES_TYPE_PROCESSUS, TYPES_PROCESSUS } from '@/lib/validation/test-sirh/enums';
import {
  modeleProcessusSchema,
  type ModeleProcessusInput,
} from '@/lib/validation/test-sirh/onboarding';

const OPTIONS_TYPE = optionsDepuisEnum(TYPES_PROCESSUS, LIBELLES_TYPE_PROCESSUS);

/** Valeurs initiales : TOUTES les clés sont présentes. */
export function valeursModeleParDefaut(
  modele?: Partial<ModeleProcessusInput> | null,
): ModeleProcessusInput {
  return {
    id: modele?.id,
    nom: modele?.nom ?? '',
    typeProcessus: modele?.typeProcessus ?? 'onboarding',
    description: modele?.description ?? null,
    actif: modele?.actif ?? true,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Modèle à modifier ; `null` = création. */
  modele: Partial<ModeleProcessusInput> | null;
  onSubmit: (values: ModeleProcessusInput) => Promise<ActionResult<{ id: string }>>;
};

/** Modale de création / modification d'un modèle de processus. */
export function ModeleDialog({ open, onOpenChange, modele, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(modele?.id);

  const form = useForm<ModeleProcessusInput>({
    resolver: typedZodResolver(modeleProcessusSchema),
    defaultValues: valeursModeleParDefaut(modele),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursModeleParDefaut(modele));
      setErreur(null);
    }
  }, [open, modele, form]);

  async function handleSubmit(values: ModeleProcessusInput) {
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
    toast.success(enEdition ? 'Modèle mis à jour' : 'Modèle créé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le modèle' : 'Nouveau modèle'}</DialogTitle>
          <DialogDescription>
            Parcours type (intégration, départ, mobilité…) dont les tâches sont recopiées à chaque
            lancement.
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
                    <Input maxLength={120} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="typeProcessus"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Type</FormLabel>
                  <OptionSelect
                    options={OPTIONS_TYPE}
                    value={field.value}
                    onChange={(v) => field.onChange(v ?? 'onboarding')}
                    autoriserAucune={false}
                    aria-label="Type de processus"
                  />
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
                    <Textarea rows={2} maxLength={1000} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="actif"
              render={({ field }) => (
                <FormItem className="flex items-center gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <FormLabel className="!mt-0">Modèle actif (proposé au lancement)</FormLabel>
                </FormItem>
              )}
            />

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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer le modèle'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
