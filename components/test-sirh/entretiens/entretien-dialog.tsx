'use client';

import { useRouter } from 'next/navigation';
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
  nouvelEntretienSchema,
  type NouvelEntretienInput,
} from '@/lib/validation/test-sirh/entretiens';
import { LIBELLES_TYPE_ENTRETIEN, TYPES_ENTRETIEN } from '@/lib/validation/test-sirh/enums';

const OPTIONS_TYPE = optionsDepuisEnum(TYPES_ENTRETIEN, LIBELLES_TYPE_ENTRETIEN);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursEntretienParDefaut(
  e?: Partial<NouvelEntretienInput> | null,
): NouvelEntretienInput {
  return {
    campagneId: e?.campagneId ?? null,
    employeId: e?.employeId ?? '',
    evaluateurId: e?.evaluateurId ?? null,
    typeEntretien: e?.typeEntretien ?? 'annuel',
    datePrevue: e?.datePrevue ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Collaborateurs actifs (et évaluateurs possibles). */
  employes: readonly OptionListe[];
  /** Campagnes ouvertes au rattachement (brouillon / en cours). */
  campagnes: readonly OptionListe[];
  /** Préremplissage (ex. depuis le suivi légal). */
  valeursInitiales?: Partial<NouvelEntretienInput> | null;
  onSubmit: (values: NouvelEntretienInput) => Promise<ActionResult<{ id: string }>>;
  /** URL de la fiche créée (redirection) ; sinon simple rafraîchissement. */
  lienFiche?: (id: string) => string;
};

/** Création d'un entretien hors campagne (ou ajout manuel à une campagne). */
export function EntretienDialog({
  open,
  onOpenChange,
  employes,
  campagnes,
  valeursInitiales,
  onSubmit,
  lienFiche,
}: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<NouvelEntretienInput>({
    resolver: typedZodResolver(nouvelEntretienSchema),
    defaultValues: valeursEntretienParDefaut(valeursInitiales),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursEntretienParDefaut(valeursInitiales));
      setErreur(null);
    }
  }, [open, valeursInitiales, form]);

  const employeId = form.watch('employeId');
  const evaluateurs = employes.filter((e) => e.id !== employeId);

  async function handleSubmit(values: NouvelEntretienInput) {
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
    toast.success('Entretien créé');
    onOpenChange(false);
    if (lienFiche) router.push(lienFiche(result.data.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nouvel entretien</DialogTitle>
          <DialogDescription>
            Entretien individuel hors campagne (fin de période d’essai, entretien professionnel à
            échéance…) ou ajouté à une campagne en cours.
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
                name="employeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Collaborateur</FormLabel>
                    <OptionSelect
                      options={employes}
                      value={field.value || null}
                      onChange={(v) => field.onChange(v ?? '')}
                      libelleAucune="Choisir…"
                      aria-label="Collaborateur"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
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
            </div>

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

            <FormField
              control={form.control}
              name="campagneId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Campagne</FormLabel>
                  <OptionSelect
                    options={campagnes}
                    value={field.value}
                    onChange={field.onChange}
                    libelleAucune="Hors campagne"
                    aria-label="Campagne"
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Création…' : 'Créer l’entretien'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
