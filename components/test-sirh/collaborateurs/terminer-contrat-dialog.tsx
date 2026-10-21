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
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { motifFinSuggere } from '@/lib/test-sirh/collaborateurs/contrats';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  terminerContratSchema,
  type TerminerContratInput,
} from '@/lib/validation/test-sirh/collaborateurs';
import {
  LIBELLES_MOTIF_FIN_CONTRAT,
  MOTIFS_FIN_CONTRAT,
  type MotifFinContrat,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

const OPTIONS_MOTIF_FIN = optionsDepuisEnum(MOTIFS_FIN_CONTRAT, LIBELLES_MOTIF_FIN_CONTRAT);

export type ContratATerminer = {
  id: string;
  typeContrat: TypeContratSirh;
  dateDebut: string;
  dateFin: string | null;
};

function valeursTerminaison(contrat: ContratATerminer | null, today: string): TerminerContratInput {
  return {
    id: contrat?.id ?? '',
    dateFin: contrat?.dateFin ?? today,
    motifFin: motifFinSuggere(contrat?.typeContrat ?? 'cdi'),
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrat: ContratATerminer | null;
  today: string;
  onSubmit: (values: TerminerContratInput) => Promise<ActionResult>;
};

/** « Terminer le contrat » : date de fin effective + motif de fin. */
export function TerminerContratDialog({ open, onOpenChange, contrat, today, onSubmit }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<TerminerContratInput>({
    resolver: typedZodResolver(terminerContratSchema),
    defaultValues: valeursTerminaison(contrat, today),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursTerminaison(contrat, today));
      setErreur(null);
    }
  }, [open, contrat, today, form]);

  async function handleSubmit(values: TerminerContratInput) {
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
    toast.success('Contrat terminé');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Terminer le contrat</DialogTitle>
          <DialogDescription>
            {contrat
              ? `Contrat débuté le ${formatDateFr(contrat.dateDebut)}. La fiche RH (date de sortie) reste à mettre à jour séparément.`
              : null}
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
              name="dateFin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date de fin effective</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="motifFin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motif de fin</FormLabel>
                  <OptionSelect
                    options={OPTIONS_MOTIF_FIN}
                    value={field.value}
                    onChange={(v) => field.onChange((v as MotifFinContrat | null) ?? field.value)}
                    autoriserAucune={false}
                    aria-label="Motif de fin"
                  />
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
              <Button type="submit" variant="destructive" disabled={isSubmitting}>
                {isSubmitting ? 'Enregistrement…' : 'Terminer le contrat'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
