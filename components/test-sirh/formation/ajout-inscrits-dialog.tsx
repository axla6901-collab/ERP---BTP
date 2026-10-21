'use client';

import { SearchIcon } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
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
import { Input } from '@/components/ui/input';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { inscriptionsSchema, type InscriptionsInput } from '@/lib/validation/test-sirh/formation';

export type EmployeInscriptibleUI = { id: string; label: string; matricule: string | null };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionId: string;
  /** Collaborateurs actifs. */
  employes: readonly EmployeInscriptibleUI[];
  /** Employés déjà inscrits (masqués de la liste). */
  dejaInscrits: readonly string[];
  /** Places restantes ; `null` = pas de jauge. */
  placesRestantes: number | null;
  onInscrire: (
    input: InscriptionsInput,
  ) => Promise<ActionResult<{ inscrits: number; dejaInscrits: number }>>;
};

function normaliser(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Inscription d'un ou plusieurs collaborateurs à une session (cases à cocher + recherche). */
export function AjoutInscritsDialog({
  open,
  onOpenChange,
  sessionId,
  employes,
  dejaInscrits,
  placesRestantes,
  onInscrire,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<InscriptionsInput>({
    resolver: typedZodResolver(inscriptionsSchema),
    defaultValues: { sessionId, employeIds: [] },
  });

  useEffect(() => {
    if (open) {
      form.reset({ sessionId, employeIds: [] });
      setErreur(null);
      setRecherche('');
    }
  }, [open, sessionId, form]);

  const disponibles = useMemo(() => {
    const exclus = new Set(dejaInscrits);
    const q = normaliser(recherche.trim());
    return employes.filter(
      (e) =>
        !exclus.has(e.id) &&
        (q.length === 0 || normaliser(`${e.label} ${e.matricule ?? ''}`).includes(q)),
    );
  }, [employes, dejaInscrits, recherche]);

  const selection = form.watch('employeIds');
  const depasse = placesRestantes !== null && selection.length > placesRestantes;

  function basculer(id: string, coche: boolean) {
    const courant = form.getValues('employeIds');
    const suivant = coche ? [...courant, id] : courant.filter((x) => x !== id);
    form.setValue('employeIds', suivant, { shouldValidate: form.formState.isSubmitted });
  }

  async function handleSubmit(values: InscriptionsInput) {
    setErreur(null);
    setIsSubmitting(true);
    const result = await onInscrire(values);
    setIsSubmitting(false);
    if (!result.ok) {
      setErreur(result.error);
      return;
    }
    const { inscrits, dejaInscrits: deja } = result.data;
    toast.success(
      `${inscrits} inscription${inscrits > 1 ? 's' : ''} enregistrée${inscrits > 1 ? 's' : ''}${deja > 0 ? ` · ${deja} déjà inscrit${deja > 1 ? 's' : ''}` : ''}`,
    );
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Inscrire des collaborateurs</DialogTitle>
          <DialogDescription>
            {placesRestantes === null
              ? 'Session sans limite de places.'
              : `${placesRestantes} place${placesRestantes > 1 ? 's' : ''} restante${placesRestantes > 1 ? 's' : ''}.`}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-3">
            {erreur && (
              <Alert variant="destructive">
                <AlertTitle>Erreur</AlertTitle>
                <AlertDescription>{erreur}</AlertDescription>
              </Alert>
            )}

            <div className="relative">
              <SearchIcon
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                type="search"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher un collaborateur…"
                className="pl-8"
                aria-label="Rechercher un collaborateur"
              />
            </div>

            <FormField
              control={form.control}
              name="employeIds"
              render={() => (
                <FormItem>
                  <div className="max-h-72 overflow-y-auto rounded-md border">
                    {disponibles.length === 0 ? (
                      <p className="p-4 text-center text-sm text-muted-foreground">
                        Aucun collaborateur à inscrire.
                      </p>
                    ) : (
                      <ul className="divide-y">
                        {disponibles.map((e) => (
                          <li key={e.id}>
                            <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                              <input
                                type="checkbox"
                                className="size-4 accent-amber-600"
                                checked={selection.includes(e.id)}
                                onChange={(ev) => basculer(e.id, ev.target.checked)}
                              />
                              <span className="min-w-0 flex-1 truncate">{e.label}</span>
                              {e.matricule && (
                                <span className="text-xs text-muted-foreground">{e.matricule}</span>
                              )}
                            </label>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <p
              className={
                depasse ? 'text-sm font-medium text-rose-700' : 'text-sm text-muted-foreground'
              }
            >
              {selection.length} sélectionné{selection.length > 1 ? 's' : ''}
              {depasse ? ' — au-delà des places restantes' : ''}
            </p>

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={isSubmitting || depasse}>
                {isSubmitting ? 'Inscription…' : 'Inscrire'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
