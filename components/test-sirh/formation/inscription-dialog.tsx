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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { dateValiditeQualification } from '@/lib/test-sirh/formation/validite';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  LIBELLES_RESULTAT_FORMATION,
  LIBELLES_STATUT_INSCRIPTION,
  RESULTATS_FORMATION,
  STATUTS_INSCRIPTION,
} from '@/lib/validation/test-sirh/enums';
import { inscriptionSchema, type InscriptionInput } from '@/lib/validation/test-sirh/formation';

const OPTIONS_STATUT = optionsDepuisEnum(STATUTS_INSCRIPTION, LIBELLES_STATUT_INSCRIPTION);
const OPTIONS_RESULTAT = optionsDepuisEnum(RESULTATS_FORMATION, LIBELLES_RESULTAT_FORMATION);

export type InscriptionAModifier = InscriptionInput & { employeNom: string };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inscription: InscriptionAModifier | null;
  /** Fin de session et validité de la formation (aperçu de la date de validité). */
  dateFinSession: string;
  validiteMois: number | null;
  onSubmit: (values: InscriptionInput) => Promise<ActionResult<{ id: string }>>;
};

/** Présence, résultat, heures et commentaire d'un participant (RHF + Zod). */
export function InscriptionDialog({
  open,
  onOpenChange,
  inscription,
  dateFinSession,
  validiteMois,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const valeurs = (i: InscriptionAModifier | null): InscriptionInput => ({
    id: i?.id ?? '',
    statut: i?.statut ?? 'inscrit',
    resultat: i?.resultat ?? 'non_evalue',
    heuresRealisees: i?.heuresRealisees ?? null,
    commentaire: i?.commentaire ?? null,
  });

  const form = useForm<InscriptionInput>({
    resolver: typedZodResolver(inscriptionSchema),
    defaultValues: valeurs(inscription),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeurs(inscription));
      setErreur(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, inscription, form]);

  const resultat = form.watch('resultat');
  const validite = dateValiditeQualification(dateFinSession, validiteMois);

  async function handleSubmit(values: InscriptionInput) {
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
    toast.success('Participation mise à jour');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{inscription?.employeNom ?? 'Participant'}</DialogTitle>
          <DialogDescription>
            Présence et résultat. Un résultat « réussi » ouvre la qualification jusqu’à la date de
            validité.
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
                name="statut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Présence</FormLabel>
                    <OptionSelect
                      options={OPTIONS_STATUT}
                      value={field.value}
                      onChange={(v) => {
                        const statut = (v ?? 'inscrit') as InscriptionInput['statut'];
                        field.onChange(statut);
                        if (statut !== 'present') form.setValue('resultat', 'non_evalue');
                      }}
                      autoriserAucune={false}
                      aria-label="Présence"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="resultat"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Résultat</FormLabel>
                    <OptionSelect
                      options={OPTIONS_RESULTAT}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'non_evalue')}
                      autoriserAucune={false}
                      aria-label="Résultat"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {resultat === 'reussi' && (
              <p className="rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
                {validite
                  ? `Qualification valable jusqu’au ${formatDateFr(validite)}.`
                  : 'Qualification sans échéance (formation sans validité).'}
              </p>
            )}

            <FormField
              control={form.control}
              name="heuresRealisees"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Heures réalisées</FormLabel>
                  <FormControl>
                    <Input
                      inputMode="decimal"
                      placeholder="Durée catalogue par défaut"
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="commentaire"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaire</FormLabel>
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
                {isSubmitting ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
