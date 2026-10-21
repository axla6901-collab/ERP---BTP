'use client';

import { useEffect, useState } from 'react';
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
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { joursFeriesFrance } from '@/lib/test-sirh/calendrier';
import { formatJourCourt } from '@/lib/test-sirh/format';
import {
  generationFeriesSchema,
  type GenerationFeriesInput,
} from '@/lib/validation/test-sirh/absences';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  annee: number;
  sites: readonly OptionListe[];
  onGenerer: (
    input: GenerationFeriesInput,
  ) => Promise<ActionResult<{ crees: number; ignores: number }>>;
};

/**
 * « Générer l'année N » : jours fériés légaux français (11, + 2 en Alsace-Moselle),
 * aperçu de la liste, dates déjà présentes ignorées.
 */
export function GenererFeriesDialog({ open, onOpenChange, annee, sites, onGenerer }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);

  const form = useForm<GenerationFeriesInput>({
    resolver: typedZodResolver(generationFeriesSchema),
    defaultValues: { annee, alsaceMoselle: false, siteId: null },
  });

  useEffect(() => {
    if (open) {
      form.reset({ annee, alsaceMoselle: false, siteId: null });
      setErreur(null);
    }
  }, [open, annee, form]);

  const alsaceMoselle = form.watch('alsaceMoselle');
  const apercu = joursFeriesFrance(annee, { alsaceMoselle });

  async function handleSubmit(values: GenerationFeriesInput) {
    setErreur(null);
    const result = await onGenerer(values);
    if (!result.ok) {
      setErreur(result.error);
      return;
    }
    const { crees, ignores } = result.data;
    toast.success(
      `${crees} jour${crees > 1 ? 's' : ''} férié${crees > 1 ? 's' : ''} ajouté${crees > 1 ? 's' : ''}` +
        (ignores > 0 ? ` · ${ignores} déjà présent${ignores > 1 ? 's' : ''}` : ''),
    );
    onOpenChange(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Générer les jours fériés {annee}</DialogTitle>
          <DialogDescription>
            Fériés légaux (art. L3133-1 du Code du travail). Les dates déjà saisies sont ignorées.
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
              name="alsaceMoselle"
              render={({ field }) => (
                <FormItem className="flex items-start gap-2">
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
                  <div className="grid gap-0.5">
                    <FormLabel className="!mt-0">Alsace-Moselle</FormLabel>
                    <span className="text-xs text-muted-foreground">
                      Ajoute le Vendredi saint et la Saint-Étienne (26 décembre).
                    </span>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="siteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rattacher au site</FormLabel>
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
            <ul
              className="grid grid-cols-1 gap-x-4 gap-y-0.5 rounded-lg border bg-muted/30 px-3 py-2 text-xs sm:grid-cols-2"
              aria-label="Aperçu des jours fériés"
            >
              {apercu.map((f) => (
                <li key={f.date} className="flex justify-between gap-2">
                  <span className="tabular-nums text-muted-foreground">
                    {formatJourCourt(f.date)}
                  </span>
                  <span className="truncate">{f.libelle}</span>
                </li>
              ))}
            </ul>
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
                {enCours ? 'Génération…' : `Générer ${apercu.length} jours`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
