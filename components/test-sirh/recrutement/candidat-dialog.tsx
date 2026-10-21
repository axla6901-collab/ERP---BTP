'use client';

import { useRouter } from 'next/navigation';
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
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { LIBELLES_SOURCE_CANDIDAT, SOURCES_CANDIDAT } from '@/lib/validation/test-sirh/enums';
import { candidatSchema, type CandidatInput } from '@/lib/validation/test-sirh/recrutement';

const OPTIONS_SOURCE = optionsDepuisEnum(SOURCES_CANDIDAT, LIBELLES_SOURCE_CANDIDAT);

export type ActionEnregistrerCandidat = (
  input: CandidatInput,
) => Promise<ActionResult<{ id: string }>>;

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursCandidatParDefaut(candidat?: Partial<CandidatInput> | null): CandidatInput {
  return {
    id: candidat?.id,
    nom: candidat?.nom ?? '',
    prenom: candidat?.prenom ?? '',
    email: candidat?.email ?? null,
    telephone: candidat?.telephone ?? null,
    ville: candidat?.ville ?? null,
    source: candidat?.source ?? 'candidature_spontanee',
    consentementRgpd: candidat?.consentementRgpd ?? false,
    dateConsentement: candidat?.dateConsentement ?? null,
    notes: candidat?.notes ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Candidat à modifier ; `null` = création. */
  candidat: Partial<CandidatInput> | null;
  today: string;
  onSubmit: ActionEnregistrerCandidat;
  /** URL d'ouverture après création (fiche du candidat) ; sinon simple rafraîchissement. */
  lienApresCreation?: (id: string) => string;
};

/** Modale de création / modification d'un candidat du vivier (RHF + Zod). */
export function CandidatDialog({
  open,
  onOpenChange,
  candidat,
  today,
  onSubmit,
  lienApresCreation,
}: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const enEdition = Boolean(candidat?.id);

  const form = useForm<CandidatInput>({
    resolver: typedZodResolver(candidatSchema),
    defaultValues: valeursCandidatParDefaut(candidat),
  });
  const consentement = form.watch('consentementRgpd');

  useEffect(() => {
    if (open) {
      form.reset(valeursCandidatParDefaut(candidat));
      setErreur(null);
    }
  }, [open, candidat, form]);

  async function handleSubmit(values: CandidatInput) {
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
    toast.success(enEdition ? 'Candidat mis à jour' : 'Candidat créé');
    onOpenChange(false);
    if (!enEdition && lienApresCreation) router.push(lienApresCreation(r.data.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier le candidat' : 'Nouveau candidat'}</DialogTitle>
          <DialogDescription>
            Identité, coordonnées, source et consentement RGPD (conservation 24 mois sans activité).
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
                name="prenom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Prénom</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nom"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nom</FormLabel>
                    <FormControl>
                      <Input maxLength={100} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="telephone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Téléphone</FormLabel>
                    <FormControl>
                      <Input maxLength={30} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="ville"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ville</FormLabel>
                    <FormControl>
                      <Input maxLength={120} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Source</FormLabel>
                    <OptionSelect
                      options={OPTIONS_SOURCE}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'candidature_spontanee')}
                      autoriserAucune={false}
                      aria-label="Source du candidat"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="consentementRgpd"
                render={({ field }) => (
                  <FormItem className="flex items-center gap-2 sm:pt-6">
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={(coche) => {
                          field.onChange(coche);
                          if (coche && !form.getValues('dateConsentement')) {
                            form.setValue('dateConsentement', today);
                          }
                        }}
                      />
                    </FormControl>
                    <FormLabel className="!mt-0">Consentement RGPD</FormLabel>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateConsentement"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date du consentement</FormLabel>
                    <FormControl>
                      <Input
                        type="date"
                        {...field}
                        value={field.value ?? ''}
                        disabled={!consentement}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Notes</FormLabel>
                  <FormControl>
                    <Textarea rows={3} maxLength={2000} {...field} value={field.value ?? ''} />
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
                disabled={form.formState.isSubmitting}
              >
                Annuler
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? 'Enregistrement…'
                  : enEdition
                    ? 'Enregistrer'
                    : 'Créer le candidat'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
