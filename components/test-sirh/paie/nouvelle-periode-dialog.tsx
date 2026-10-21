'use client';

import { useRouter } from 'next/navigation';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatMois } from '@/lib/test-sirh/format';
import type { MoisPaie } from '@/lib/test-sirh/paie/periodes';
import { periodePaieSchema, type PeriodePaieInput } from '@/lib/validation/test-sirh/paie';

const OPTIONS_MOIS: OptionListe[] = Array.from({ length: 12 }, (_, i) => {
  const libelle = formatMois(2000, i + 1).replace(' 2000', '');
  return { id: String(i + 1), label: libelle.charAt(0).toUpperCase() + libelle.slice(1) };
});

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mois proposé (mois courant ou premier mois suivant non créé). */
  proposition: MoisPaie;
  /** Chemin de la rubrique Paie (`/<slug>/test-sirh/paie`) : redirection vers la période créée. */
  cheminPaie: string;
  onSubmit: (input: PeriodePaieInput) => Promise<ActionResult<{ id: string }>>;
};

/** Création de la période de paie d'un mois. */
export function NouvellePeriodeDialog({
  open,
  onOpenChange,
  proposition,
  cheminPaie,
  onSubmit,
}: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PeriodePaieInput>({
    resolver: typedZodResolver(periodePaieSchema),
    defaultValues: { annee: proposition.annee, mois: proposition.mois, notes: null },
  });

  useEffect(() => {
    if (open) {
      form.reset({ annee: proposition.annee, mois: proposition.mois, notes: null });
      setErreur(null);
    }
  }, [open, proposition.annee, proposition.mois, form]);

  async function handleSubmit(values: PeriodePaieInput) {
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
    toast.success('Période de paie créée');
    onOpenChange(false);
    router.push(`${cheminPaie}/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle période de paie</DialogTitle>
          <DialogDescription>
            Une période par mois : les variables y sont saisies ou importées jusqu’à la clôture.
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
                name="mois"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mois</FormLabel>
                    <OptionSelect
                      options={OPTIONS_MOIS}
                      value={String(field.value)}
                      onChange={(v) => field.onChange(Number(v ?? proposition.mois))}
                      autoriserAucune={false}
                      aria-label="Mois"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="annee"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Année</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="numeric" min={2000} max={2100} {...field} />
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
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Création…' : 'Créer la période'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
