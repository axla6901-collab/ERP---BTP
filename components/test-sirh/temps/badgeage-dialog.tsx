'use client';

import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { dureeTravailMinutes } from '@/lib/test-sirh/calendrier';
import { formatMinutes } from '@/lib/test-sirh/format';
import { LIBELLES_LIEU_TRAVAIL, LIEUX_TRAVAIL } from '@/lib/validation/test-sirh/enums';
import { badgeageSchema, type BadgeageInput } from '@/lib/validation/test-sirh/temps';

const OPTIONS_LIEU = optionsDepuisEnum(LIEUX_TRAVAIL, LIBELLES_LIEU_TRAVAIL);

/** Valeurs initiales : TOUTES les clés sont présentes (convention des schémas SIRH). */
export function valeursBadgeageParDefaut(b?: Partial<BadgeageInput> | null): BadgeageInput {
  return {
    id: b?.id,
    employeId: b?.employeId ?? '',
    dateBadgeage: b?.dateBadgeage ?? '',
    heureDebut: b?.heureDebut ? b.heureDebut.slice(0, 5) : '08:00',
    heureFin: b?.id ? (b.heureFin ? b.heureFin.slice(0, 5) : null) : (b?.heureFin ?? '17:00'),
    pauseMinutes: b?.pauseMinutes ?? 60,
    lieu: b?.lieu ?? 'chantier',
    chantierId: b?.chantierId ?? null,
    commentaire: b?.commentaire ?? null,
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Badgeage à modifier (avec `id`) ou pré-rempli pour une création (employé, date). */
  badgeage: Partial<BadgeageInput> | null;
  employes: readonly OptionListe[];
  chantiers: readonly OptionListe[];
  onSubmit: (values: BadgeageInput) => Promise<ActionResult<{ id: string }>>;
  /** Suppression (édition uniquement). */
  onSupprimer?: (id: string) => Promise<ActionResult>;
};

/** Modale de saisie / modification d'un badgeage (pointage de présence). */
export function BadgeageDialog({
  open,
  onOpenChange,
  badgeage,
  employes,
  chantiers,
  onSubmit,
  onSupprimer,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const idEdite = badgeage?.id ?? null;

  const form = useForm<BadgeageInput>({
    resolver: typedZodResolver(badgeageSchema),
    defaultValues: valeursBadgeageParDefaut(badgeage),
  });

  useEffect(() => {
    if (open) {
      form.reset(valeursBadgeageParDefaut(badgeage));
      setErreur(null);
    }
  }, [open, badgeage, form]);

  const [heureDebut, heureFin, pause] = useWatch({
    control: form.control,
    name: ['heureDebut', 'heureFin', 'pauseMinutes'],
  });
  const duree = heureFin ? dureeTravailMinutes(heureDebut, heureFin, Number(pause) || 0) : null;

  async function handleSubmit(values: BadgeageInput) {
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
    toast.success(idEdite ? 'Badgeage mis à jour' : 'Badgeage enregistré');
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{idEdite ? 'Modifier le badgeage' : 'Nouveau badgeage'}</DialogTitle>
          <DialogDescription>
            Pointage de présence : heures d’arrivée et de départ, pause, lieu et chantier. Sans
            heure de fin, le badgeage reste « en cours ».
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
                name="dateBadgeage"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <FormField
                control={form.control}
                name="heureDebut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Arrivée</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="heureFin"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Départ</FormLabel>
                    <FormControl>
                      <Input type="time" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormDescription className="text-xs">Vide = en cours</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="pauseMinutes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Pause (min)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={720}
                        step={5}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <p className="text-sm text-muted-foreground" aria-live="polite">
              Temps de travail effectif :{' '}
              <span className="font-medium tabular-nums text-foreground">
                {duree === null ? 'en cours' : formatMinutes(duree)}
              </span>
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="lieu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Lieu</FormLabel>
                    <OptionSelect
                      options={OPTIONS_LIEU}
                      value={field.value}
                      onChange={(v) => field.onChange(v ?? 'chantier')}
                      autoriserAucune={false}
                      aria-label="Lieu de travail"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="chantierId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Chantier</FormLabel>
                    <OptionSelect
                      options={chantiers}
                      value={field.value}
                      onChange={field.onChange}
                      aria-label="Chantier"
                    />
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="commentaire"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Commentaire</FormLabel>
                  <FormControl>
                    <Textarea rows={2} maxLength={500} {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="sm:justify-between">
              <div>
                {idEdite && onSupprimer && (
                  <BoutonConfirmation
                    libelle="Supprimer"
                    question="Supprimer ce badgeage ?"
                    libelleConfirmer="Supprimer"
                    messageSucces="Badgeage supprimé"
                    onConfirm={async () => {
                      const r = await onSupprimer(idEdite);
                      if (r.ok) onOpenChange(false);
                      return r;
                    }}
                  />
                )}
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => onOpenChange(false)}
                  disabled={isSubmitting}
                >
                  Annuler
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? 'Enregistrement…'
                    : idEdite
                      ? 'Enregistrer'
                      : 'Ajouter le badgeage'}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
