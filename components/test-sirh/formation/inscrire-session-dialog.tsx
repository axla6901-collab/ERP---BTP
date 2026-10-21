'use client';

import Link from 'next/link';
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
import { Form, FormField, FormItem, FormMessage } from '@/components/ui/form';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { libelleDatesSession } from '@/lib/test-sirh/formation/validite';
import { inscriptionsSchema, type InscriptionsInput } from '@/lib/validation/test-sirh/formation';
import { cn } from '@/lib/utils';

/** Session à venir proposable (sérialisable). */
export type SessionAVenirUI = {
  id: string;
  formationId: string;
  dateDebut: string;
  dateFin: string;
  lieu: string | null;
  placesRestantes: number | null;
};

export type CibleRecyclage = {
  employeId: string;
  employeNom: string;
  formationId: string;
  formationIntitule: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cible: CibleRecyclage | null;
  /** Toutes les sessions à venir (filtrées ici sur la formation de la cible). */
  sessions: readonly SessionAVenirUI[];
  /** Préfixe `/<slug>/test-sirh` (lien vers les sessions). */
  base: string;
  inscrire: (
    input: InscriptionsInput,
  ) => Promise<ActionResult<{ inscrits: number; dejaInscrits: number }>>;
};

/** Recyclage : inscription d'un collaborateur à une session à venir de la même formation. */
export function InscrireSessionDialog({
  open,
  onOpenChange,
  cible,
  sessions,
  base,
  inscrire,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<InscriptionsInput>({
    resolver: typedZodResolver(inscriptionsSchema),
    defaultValues: { sessionId: '', employeIds: cible ? [cible.employeId] : [] },
  });

  useEffect(() => {
    if (open) {
      form.reset({ sessionId: '', employeIds: cible ? [cible.employeId] : [] });
      setErreur(null);
    }
  }, [open, cible, form]);

  const proposees = cible ? sessions.filter((s) => s.formationId === cible.formationId) : [];

  async function handleSubmit(values: InscriptionsInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await inscrire(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      return;
    }
    toast.success(
      result.data.inscrits > 0 ? 'Inscription enregistrée' : 'Collaborateur déjà inscrit',
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Inscrire à une session</DialogTitle>
          <DialogDescription>
            {cible ? `${cible.employeNom} — ${cible.formationIntitule}` : null}
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

            {proposees.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                Aucune session à venir pour cette formation.{' '}
                <Link
                  href={`${base}/formation/sessions`}
                  className="font-medium text-orange-700 underline-offset-2 hover:underline"
                >
                  Programmer une session
                </Link>
              </p>
            ) : (
              <FormField
                control={form.control}
                name="sessionId"
                render={({ field }) => (
                  <FormItem>
                    <ul className="divide-y rounded-md border" role="radiogroup">
                      {proposees.map((s) => {
                        const complet = s.placesRestantes !== null && s.placesRestantes <= 0;
                        return (
                          <li key={s.id}>
                            <label
                              className={cn(
                                'flex items-center gap-3 px-3 py-2 text-sm',
                                complet
                                  ? 'cursor-not-allowed opacity-60'
                                  : 'cursor-pointer hover:bg-muted/50',
                              )}
                            >
                              <input
                                type="radio"
                                name="session"
                                className="size-4 accent-amber-600"
                                value={s.id}
                                checked={field.value === s.id}
                                disabled={complet}
                                onChange={() => field.onChange(s.id)}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block tabular-nums">
                                  {libelleDatesSession(s.dateDebut, s.dateFin)}
                                </span>
                                {s.lieu && (
                                  <span className="block text-xs text-muted-foreground">
                                    {s.lieu}
                                  </span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground">
                                {s.placesRestantes === null
                                  ? 'Places libres'
                                  : complet
                                    ? 'Complète'
                                    : `${s.placesRestantes} place${s.placesRestantes > 1 ? 's' : ''}`}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                    <FormMessage />
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
              <Button type="submit" disabled={isSubmitting || proposees.length === 0}>
                {isSubmitting ? 'Inscription…' : 'Inscrire'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
