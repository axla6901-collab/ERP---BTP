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
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { LIBELLES_STATUT_SESSION, STATUTS_SESSION } from '@/lib/validation/test-sirh/enums';
import { sessionSchema, type SessionInput } from '@/lib/validation/test-sirh/formation';

const OPTIONS_STATUT = optionsDepuisEnum(STATUTS_SESSION, LIBELLES_STATUT_SESSION);

/** Formation proposable (les inactives ne sont proposées que si déjà sélectionnées). */
export type FormationOptionUI = { id: string; label: string; actif: boolean };

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursSessionParDefaut(s?: Partial<SessionInput> | null): SessionInput {
  return {
    id: s?.id,
    formationId: s?.formationId ?? '',
    dateDebut: s?.dateDebut ?? '',
    dateFin: s?.dateFin ?? '',
    lieu: s?.lieu ?? null,
    formateur: s?.formateur ?? null,
    placesMax: s?.placesMax ?? null,
    coutHt: s?.coutHt ?? null,
    statut: s?.statut ?? 'planifiee',
    notes: s?.notes ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Session à modifier ; `null` = création (préremplissage partiel possible). */
  session: Partial<SessionInput> | null;
  formations: readonly FormationOptionUI[];
  onSubmit: (values: SessionInput) => Promise<ActionResult<{ id: string }>>;
  /** URL de la fiche créée (redirection après création). */
  lienFiche?: (id: string) => string;
};

/** Création / modification d'une session de formation (RHF + Zod). */
export function SessionDialog({
  open,
  onOpenChange,
  session,
  formations,
  onSubmit,
  lienFiche,
}: Props) {
  const router = useRouter();
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const enEdition = Boolean(session?.id);

  const form = useForm<SessionInput>({
    resolver: typedZodResolver(sessionSchema),
    defaultValues: valeursSessionParDefaut(session),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursSessionParDefaut(session));
      setErreur(null);
    }
  }, [open, session, form]);

  const formationCourante = form.watch('formationId');
  const optionsFormation = formations.filter((f) => f.actif || f.id === formationCourante);

  async function handleSubmit(values: SessionInput) {
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
    toast.success(enEdition ? 'Session mise à jour' : 'Session créée');
    onOpenChange(false);
    if (!enEdition && lienFiche) router.push(lienFiche(result.data.id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{enEdition ? 'Modifier la session' : 'Nouvelle session'}</DialogTitle>
          <DialogDescription>
            Dates, lieu, formateur et jauge. Le coût vide est estimé au coût catalogue par
            participant.
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
              name="formationId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Formation</FormLabel>
                  <OptionSelect
                    options={optionsFormation}
                    value={field.value || null}
                    onChange={(v) => field.onChange(v ?? '')}
                    libelleAucune="Choisir…"
                    aria-label="Formation"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="dateDebut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Début</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="dateFin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fin</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="statut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Statut</FormLabel>
                    <OptionSelect
                      options={OPTIONS_STATUT}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'planifiee')}
                      autoriserAucune={false}
                      aria-label="Statut de la session"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="lieu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieu</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="formateur"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Formateur</FormLabel>
                    <FormControl>
                      <Input maxLength={200} {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="placesMax"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Places max.</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="Illimité"
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
                name="coutHt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coût HT de la session (€)</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="decimal"
                        placeholder="Catalogue × participants"
                        {...field}
                        value={field.value ?? ''}
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
                    <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
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
                {isSubmitting ? 'Enregistrement…' : enEdition ? 'Enregistrer' : 'Créer la session'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
