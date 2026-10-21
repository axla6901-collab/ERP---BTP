'use client';

import { CheckCircle2Icon } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';

import { OptionSelect, optionsDepuisEnum } from '@/components/test-sirh/option-select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button, buttonVariants } from '@/components/ui/button';
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
import type { ResultatEmbauche } from '@/lib/test-sirh/recrutement/embauche';
import { nomComplet } from '@/lib/test-sirh/format';
import {
  societeInterimRequise,
  typeContratRhDepuisSirh,
} from '@/lib/test-sirh/recrutement/pipeline';
import {
  LIBELLES_TYPE_CONTRAT,
  TYPES_CONTRAT,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';
import { embaucheSchema, type EmbaucheInput } from '@/lib/validation/test-sirh/recrutement';

const OPTIONS_TYPE_CONTRAT = optionsDepuisEnum(TYPES_CONTRAT, LIBELLES_TYPE_CONTRAT);

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Candidature à transformer en embauche ; `null` = modale fermée. */
  candidature: { id: string; nom: string; prenom: string } | null;
  /** Type de contrat proposé par défaut (celui de l'offre). */
  typeContratDefaut: TypeContratSirh;
  today: string;
  /** Préfixe du module : `/<slug>/test-sirh`. */
  base: string;
  onSubmit: (input: EmbaucheInput) => Promise<ActionResult<ResultatEmbauche>>;
};

function valeursEmbauche(
  candidatureId: string,
  typeContrat: TypeContratSirh,
  today: string,
): EmbaucheInput {
  return { candidatureId, dateEntree: today, typeContrat, societeInterim: null };
}

/**
 * Confirmation d'embauche : date d'entrée, type de contrat (mappé vers le type
 * RH de la fiche employé) et société d'intérim si intérim. Après succès :
 * liens vers le dossier collaborateur et l'onboarding.
 */
export function EmbaucheDialog({
  open,
  onOpenChange,
  candidature,
  typeContratDefaut,
  today,
  base,
  onSubmit,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [resultat, setResultat] = useState<ResultatEmbauche | null>(null);
  const candidatureId = candidature?.id ?? '';

  const form = useForm<EmbaucheInput>({
    resolver: typedZodResolver(embaucheSchema),
    defaultValues: valeursEmbauche(candidatureId, typeContratDefaut, today),
  });
  const typeContrat = form.watch('typeContrat');

  useEffect(() => {
    if (open) {
      form.reset(valeursEmbauche(candidatureId, typeContratDefaut, today));
      setErreur(null);
      setResultat(null);
    }
  }, [open, candidatureId, typeContratDefaut, today, form]);

  async function handleSubmit(values: EmbaucheInput) {
    setErreur(null);
    const r = await onSubmit(values);
    if (!r.ok) {
      setErreur(r.error);
      if (r.fieldErrors) {
        for (const [field, msgs] of Object.entries(r.fieldErrors)) {
          if (msgs?.[0]) form.setError(field as never, { type: 'server', message: msgs[0] });
        }
      }
      return;
    }
    setResultat(r.data);
  }

  const nom = candidature ? nomComplet(candidature.prenom, candidature.nom) : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Embaucher {nom}</DialogTitle>
          <DialogDescription>
            Crée la fiche collaborateur (module RH) et clôt la candidature.
          </DialogDescription>
        </DialogHeader>

        {resultat ? (
          <div className="space-y-4" role="status">
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-sm text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200">
              <CheckCircle2Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div className="space-y-1">
                <p className="font-medium">{nom} est embauché·e : fiche collaborateur créée.</p>
                {resultat.offrePourvue && (
                  <p>Toutes les embauches prévues sont faites : l’offre passe « Pourvue ».</p>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link
                href={`${base}/collaborateurs/${resultat.employeId}`}
                className={buttonVariants({ size: 'sm' })}
              >
                Ouvrir le dossier collaborateur
              </Link>
              <Link
                href={`${base}/onboarding`}
                className={buttonVariants({ variant: 'outline', size: 'sm' })}
              >
                Lancer l’onboarding
              </Link>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
                Fermer
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="grid gap-4">
              {erreur && (
                <Alert variant="destructive">
                  <AlertTitle>Embauche impossible</AlertTitle>
                  <AlertDescription>{erreur}</AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="dateEntree"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date d’entrée</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="typeContrat"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Type de contrat</FormLabel>
                      <OptionSelect
                        options={OPTIONS_TYPE_CONTRAT}
                        value={field.value}
                        onChange={(v) => field.onChange(v ?? typeContratDefaut)}
                        autoriserAucune={false}
                        aria-label="Type de contrat"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <p className="text-xs text-muted-foreground">
                Contrat de la fiche employé (module RH) :{' '}
                <span className="font-medium text-foreground">
                  {typeContratRhDepuisSirh(typeContrat)}
                </span>
              </p>

              {societeInterimRequise(typeContrat) && (
                <FormField
                  control={form.control}
                  name="societeInterim"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Société d’intérim</FormLabel>
                      <FormControl>
                        <Input maxLength={120} {...field} value={field.value ?? ''} />
                      </FormControl>
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
                  disabled={form.formState.isSubmitting}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={form.formState.isSubmitting || !candidature}>
                  {form.formState.isSubmitting ? 'Embauche…' : 'Confirmer l’embauche'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
