'use client';

import { CalendarClockIcon } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
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
import {
  planificationEntretienSchema,
  type PlanificationEntretienInput,
} from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_TYPE_ENTRETIEN, TYPES_ENTRETIEN } from '@/lib/validation/test-sirh/enums';

const OPTIONS_TYPE = optionsDepuisEnum(TYPES_ENTRETIEN, LIBELLES_TYPE_ENTRETIEN);

type Props = {
  valeurs: PlanificationEntretienInput;
  /** Évaluateurs possibles (le collaborateur évalué est exclu par l'appelant). */
  evaluateurs: readonly OptionListe[];
  onSubmit: (values: PlanificationEntretienInput) => Promise<ActionResult<{ id: string }>>;
};

/**
 * Bouton + modale de planification (RH) : évaluateur, type, date prévue. Poser
 * une date planifie l'entretien ; la retirer le remet « à planifier ».
 */
export function PlanificationEntretien({ valeurs, evaluateurs, onSubmit }: Props) {
  const [ouvert, setOuvert] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<PlanificationEntretienInput>({
    resolver: typedZodResolver(planificationEntretienSchema),
    defaultValues: valeurs,
  });

  useEffect(() => {
    if (ouvert) {
      form.reset(valeurs);
      setErreur(null);
    }
    // `valeurs` est recalculé par la page serveur : on ne réinitialise qu'à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, form]);

  async function handleSubmit(values: PlanificationEntretienInput) {
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
    toast.success('Planification enregistrée');
    setOuvert(false);
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOuvert(true)}>
        <CalendarClockIcon className="mr-1 size-3.5" /> Planifier
      </Button>
      <Dialog open={ouvert} onOpenChange={setOuvert}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Planification de l’entretien</DialogTitle>
            <DialogDescription>
              Évaluateur, type et date prévue. Une date prévue fait passer l’entretien « à planifier
              » en « planifié ».
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
                name="evaluateurId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Évaluateur</FormLabel>
                    <OptionSelect
                      options={evaluateurs}
                      value={field.value}
                      onChange={field.onChange}
                      libelleAucune="Non désigné"
                      aria-label="Évaluateur"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="typeEntretien"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type</FormLabel>
                      <OptionSelect
                        options={OPTIONS_TYPE}
                        value={field.value}
                        onChange={(v) => field.onChange(v ?? 'annuel')}
                        autoriserAucune={false}
                        aria-label="Type d’entretien"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="datePrevue"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date prévue</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOuvert(false)}
                  disabled={isSubmitting}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
