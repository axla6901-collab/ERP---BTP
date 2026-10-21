'use client';

import { RocketIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect } from '@/components/test-sirh/option-select';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  dateReferenceSuggeree,
  formatDelai,
  libelleDateReference,
  libelleProcessusParDefaut,
  materialiserTaches,
} from '@/lib/test-sirh/onboarding/planification';
import type { EmployeLancement, ModeleLancement } from '@/lib/test-sirh/onboarding/types';
import { estDateIso } from '@/lib/test-sirh/calendrier';
import {
  lancerProcessusSchema,
  type LancerProcessusInput,
} from '@/lib/validation/test-sirh/onboarding';

import { LIBELLES_COURTS_TYPE_PROCESSUS } from './badges-onboarding';

export type LancerProcessusAction = (
  input: LancerProcessusInput,
) => Promise<ActionResult<{ id: string; nbTaches: number }>>;

type PropsCommunes = {
  modeles: ModeleLancement[];
  employes: EmployeLancement[];
  today: string;
  /** Pré-sélections (ex. depuis le dossier d'un collaborateur). */
  modeleInitialId?: string | null;
  employeInitialId?: string | null;
  onSubmit: LancerProcessusAction;
  /** URL des fiches processus (`/<slug>/test-sirh/onboarding`) : ouverture après lancement. */
  baseFiches?: string;
};

/** Valeurs initiales (toutes les clés), suggestions comprises. */
export function valeursLancementParDefaut(
  modeles: readonly ModeleLancement[],
  employes: readonly EmployeLancement[],
  today: string,
  modeleId?: string | null,
  employeId?: string | null,
): LancerProcessusInput {
  const modele = modeles.find((m) => m.id === modeleId) ?? null;
  const employe = employes.find((e) => e.id === employeId) ?? null;
  return {
    modeleId: modele?.id ?? '',
    employeId: employe?.id ?? '',
    dateReference: dateReferenceSuggeree(modele?.typeProcessus ?? 'autre', employe, today),
    libelle: modele && employe ? libelleProcessusParDefaut(modele.nom, employe.nomComplet) : '',
    assignationAuto: true,
  };
}

/** Modale « Lancer un processus » : crée le processus et matérialise les tâches du modèle. */
export function LancerProcessusDialog({
  open,
  onOpenChange,
  modeles,
  employes,
  today,
  modeleInitialId,
  employeInitialId,
  onSubmit,
  baseFiches,
}: PropsCommunes & { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Une saisie manuelle du libellé / de la date n'est plus écrasée par les suggestions.
  const libelleModifie = useRef(false);
  const dateModifiee = useRef(false);

  const form = useForm<LancerProcessusInput>({
    resolver: typedZodResolver(lancerProcessusSchema),
    defaultValues: valeursLancementParDefaut(
      modeles,
      employes,
      today,
      modeleInitialId,
      employeInitialId,
    ),
  });

  useEffect(() => {
    if (open) {
      form.reset(
        valeursLancementParDefaut(modeles, employes, today, modeleInitialId, employeInitialId),
      );
      libelleModifie.current = false;
      dateModifiee.current = false;
      setErreur(null);
    }
  }, [open, modeles, employes, today, modeleInitialId, employeInitialId, form]);

  /** Recalcule libellé et date proposés après un changement de modèle ou de collaborateur. */
  function suggerer(modeleId: string, employeId: string) {
    const modele = modeles.find((m) => m.id === modeleId) ?? null;
    const employe = employes.find((e) => e.id === employeId) ?? null;
    if (!libelleModifie.current) {
      form.setValue(
        'libelle',
        modele && employe ? libelleProcessusParDefaut(modele.nom, employe.nomComplet) : '',
      );
    }
    if (!dateModifiee.current && modele) {
      form.setValue('dateReference', dateReferenceSuggeree(modele.typeProcessus, employe, today));
    }
  }

  const modeleId = form.watch('modeleId');
  const dateReference = form.watch('dateReference');
  const modele = modeles.find((m) => m.id === modeleId) ?? null;
  const apercu =
    modele && estDateIso(dateReference) ? materialiserTaches(modele.taches, dateReference) : [];
  const premiere = apercu.reduce<string | null>(
    (min, t) => (min === null || t.echeance < min ? t.echeance : min),
    null,
  );
  const derniere = apercu.reduce<string | null>(
    (max, t) => (max === null || t.echeance > max ? t.echeance : max),
    null,
  );
  const delais = modele?.taches.map((t) => t.delaiJours) ?? [];

  async function handleSubmit(values: LancerProcessusInput) {
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
    toast.success(
      `Processus lancé (${result.data.nbTaches} tâche${result.data.nbTaches > 1 ? 's' : ''})`,
    );
    onOpenChange(false);
    if (baseFiches) router.push(`${baseFiches}/${result.data.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Lancer un processus</DialogTitle>
          <DialogDescription>
            Les tâches du modèle sont créées avec une échéance calculée à partir de la date de
            référence.
          </DialogDescription>
        </DialogHeader>

        {modeles.length === 0 ? (
          <Alert>
            <AlertTitle>Aucun modèle actif</AlertTitle>
            <AlertDescription>
              Créez ou réactivez un modèle dans l’onglet Modèles avant de lancer un processus.
            </AlertDescription>
          </Alert>
        ) : (
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
                  name="modeleId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Modèle</FormLabel>
                      <OptionSelect
                        options={modeles.map((m) => ({
                          id: m.id,
                          label: `${m.nom} (${LIBELLES_COURTS_TYPE_PROCESSUS[m.typeProcessus]})`,
                        }))}
                        value={field.value || null}
                        onChange={(v) => {
                          field.onChange(v ?? '');
                          suggerer(v ?? '', form.getValues('employeId'));
                        }}
                        libelleAucune="Choisir un modèle…"
                        aria-label="Modèle"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employeId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Collaborateur</FormLabel>
                      <OptionSelect
                        options={employes}
                        value={field.value || null}
                        onChange={(v) => {
                          field.onChange(v ?? '');
                          suggerer(form.getValues('modeleId'), v ?? '');
                        }}
                        libelleAucune="Choisir un collaborateur…"
                        aria-label="Collaborateur"
                      />
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <FormField
                  control={form.control}
                  name="dateReference"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {libelleDateReference(modele?.typeProcessus ?? 'autre')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          type="date"
                          {...field}
                          onChange={(e) => {
                            dateModifiee.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="libelle"
                  render={({ field }) => (
                    <FormItem className="sm:col-span-2">
                      <FormLabel>Libellé</FormLabel>
                      <FormControl>
                        <Input
                          maxLength={200}
                          {...field}
                          onChange={(e) => {
                            libelleModifie.current = true;
                            field.onChange(e);
                          }}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {modele && (
                <p className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {apercu.length === 0 ? (
                    'Ce modèle ne contient aucune tâche : le processus sera créé vide.'
                  ) : (
                    <>
                      <span className="font-medium text-foreground">
                        {apercu.length} tâche{apercu.length > 1 ? 's' : ''}
                      </span>{' '}
                      · échéances du {formatDateFr(premiere)} ({formatDelai(Math.min(...delais))})
                      au {formatDateFr(derniere)} ({formatDelai(Math.max(...delais))})
                    </>
                  )}
                </p>
              )}

              <FormField
                control={form.control}
                name="assignationAuto"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-2">
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <FormLabel className="!mt-0">Assigner automatiquement les tâches</FormLabel>
                    </div>
                    <FormDescription className="text-xs">
                      Tâches RH : à vous ; tâches salarié et manager : à leur compte utilisateur
                      s’il existe.
                    </FormDescription>
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
                  {isSubmitting ? 'Lancement…' : 'Lancer le processus'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Bouton « Lancer un processus » + sa modale (bandeau de page, dossier collaborateur). */
export function LancerProcessusBouton({
  libelle = 'Lancer un processus',
  ...props
}: PropsCommunes & { libelle?: string }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOuvert(true)}>
        <RocketIcon className="mr-1 size-4" /> {libelle}
      </Button>
      <LancerProcessusDialog {...props} open={ouvert} onOpenChange={setOuvert} />
    </>
  );
}
