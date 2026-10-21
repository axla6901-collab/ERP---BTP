'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { libellePlage } from '@/lib/test-sirh/absences/regles';
import { formatDuree } from '@/lib/test-sirh/absences/soldes';
import type { AbsenceLigne, ResultatDecisionAbsence } from '@/lib/test-sirh/absences/types';
import { decisionSchema, type DecisionInput } from '@/lib/validation/test-sirh/commun';

import { TypeAbsenceLibelle } from './elements';

/** Server action de décision (cf. `deciderAbsence`). */
export type ActionDecisionAbsence = (
  input: DecisionInput,
) => Promise<ActionResult<ResultatDecisionAbsence>>;

export type AbsenceADecider = Pick<
  AbsenceLigne,
  | 'id'
  | 'employe'
  | 'typeLibelle'
  | 'couleur'
  | 'dateDebut'
  | 'dateFin'
  | 'demiJourneeDebut'
  | 'demiJourneeFin'
  | 'duree'
  | 'unite'
  | 'motif'
>;

type Props = {
  absence: AbsenceADecider | null;
  decision: 'approuver' | 'refuser';
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDecider: ActionDecisionAbsence;
};

/** Approuver / refuser une demande d'absence, avec un commentaire optionnel. */
export function DecisionAbsenceDialog({ absence, decision, open, onOpenChange, onDecider }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const approuver = decision === 'approuver';

  const form = useForm<DecisionInput>({
    resolver: typedZodResolver(decisionSchema),
    defaultValues: { id: absence?.id ?? '', decision, commentaire: null },
  });

  useEffect(() => {
    if (open) {
      form.reset({ id: absence?.id ?? '', decision, commentaire: null });
      setErreur(null);
    }
  }, [open, absence?.id, decision, form]);

  async function handleSubmit(values: DecisionInput) {
    setErreur(null);
    const result = await onDecider(values);
    if (!result.ok) {
      setErreur(result.error);
      return;
    }
    toast.success(result.data.statut === 'approuvee' ? 'Demande approuvée' : 'Demande refusée');
    if (result.data.avertissement) toast.warning(result.data.avertissement);
    onOpenChange(false);
  }

  const enCours = form.formState.isSubmitting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{approuver ? 'Approuver la demande' : 'Refuser la demande'}</DialogTitle>
          <DialogDescription>
            {approuver
              ? 'L’absence sera validée et décomptée du compteur le cas échéant.'
              : 'Le collaborateur verra le motif du refus dans son espace.'}
          </DialogDescription>
        </DialogHeader>

        {absence && (
          <div className="space-y-1 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{absence.employe}</div>
            <TypeAbsenceLibelle libelle={absence.typeLibelle} couleur={absence.couleur} />
            <div className="text-muted-foreground">
              {libellePlage(absence)} · {formatDuree(absence.duree, absence.unite)}
            </div>
            {absence.motif && <div className="text-xs italic">« {absence.motif} »</div>}
          </div>
        )}

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
              name="commentaire"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {approuver ? 'Commentaire (facultatif)' : 'Motif du refus (recommandé)'}
                  </FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={1000} {...field} value={field.value ?? ''} />
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
              <Button
                type="submit"
                variant={approuver ? 'default' : 'destructive-solid'}
                disabled={enCours || !absence}
              >
                {enCours ? 'Enregistrement…' : approuver ? 'Approuver' : 'Refuser'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
