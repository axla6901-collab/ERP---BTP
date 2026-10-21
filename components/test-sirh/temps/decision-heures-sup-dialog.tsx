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
import { decisionSchema, type DecisionInput } from '@/lib/validation/test-sirh/commun';

export type DemandeADecider = {
  id: string;
  decision: DecisionInput['decision'];
  /** Résumé affiché (collaborateur, date, durée, majoration). */
  resume: string;
};

type Props = {
  demande: DemandeADecider | null;
  onOpenChange: (open: boolean) => void;
  onDecider: (input: DecisionInput) => Promise<ActionResult>;
};

/** Modale de décision sur une demande d'heures sup. (commentaire optionnel). */
export function DecisionHeuresSupDialog({ demande, onOpenChange, onDecider }: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const approuver = demande?.decision === 'approuver';

  const form = useForm<DecisionInput>({
    resolver: typedZodResolver(decisionSchema),
    defaultValues: {
      id: demande?.id ?? '',
      decision: demande?.decision ?? 'approuver',
      commentaire: null,
    },
  });

  useEffect(() => {
    if (demande) {
      form.reset({ id: demande.id, decision: demande.decision, commentaire: null });
      setErreur(null);
    }
  }, [demande, form]);

  async function handleSubmit(values: DecisionInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onDecider(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      return;
    }
    toast.success(values.decision === 'approuver' ? 'Demande approuvée' : 'Demande refusée');
    onOpenChange(false);
  }

  return (
    <Dialog open={demande !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{approuver ? 'Approuver la demande' : 'Refuser la demande'}</DialogTitle>
          <DialogDescription>{demande?.resume}</DialogDescription>
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
              name="commentaire"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{approuver ? 'Commentaire (optionnel)' : 'Motif du refus'}</FormLabel>
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
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button
                type="submit"
                variant={approuver ? 'default' : 'destructive'}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Enregistrement…' : approuver ? 'Approuver' : 'Refuser'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
