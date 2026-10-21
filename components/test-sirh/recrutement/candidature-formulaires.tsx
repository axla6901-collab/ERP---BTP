'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { OptionSelect, optionsDepuisEnum } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
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
import { dateHeureParis } from '@/lib/test-sirh/recrutement/fuseau';
import { LIBELLES_MOTIF_REFUS, MOTIFS_REFUS } from '@/lib/validation/test-sirh/enums';
import {
  commentaireCandidatureSchema,
  entretienCandidatureSchema,
  refusCandidatureSchema,
  type CommentaireCandidatureInput,
  type EntretienCandidatureInput,
  type RefusCandidatureInput,
} from '@/lib/validation/test-sirh/recrutement';

const OPTIONS_MOTIF_REFUS = optionsDepuisEnum(MOTIFS_REFUS, LIBELLES_MOTIF_REFUS);

/** Reporte les erreurs serveur sur les champs du formulaire. */
function appliquerErreursServeur(
  form: { setError: (name: never, error: { type: string; message: string }) => void },
  fieldErrors: Record<string, string[]> | undefined,
) {
  for (const [champ, messages] of Object.entries(fieldErrors ?? {})) {
    if (messages?.[0]) form.setError(champ as never, { type: 'server', message: messages[0] });
  }
}

// ─────────────────────────────────────────────────────────────
// Refus (motif obligatoire)
// ─────────────────────────────────────────────────────────────

export function RefusForm({
  candidatureId,
  onRefuser,
  onAnnuler,
}: {
  candidatureId: string;
  onRefuser: (input: RefusCandidatureInput) => Promise<ActionResult>;
  onAnnuler: () => void;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const form = useForm<RefusCandidatureInput>({
    resolver: typedZodResolver(refusCandidatureSchema),
    // `motifRefus` volontairement sans valeur : le motif doit être choisi explicitement.
    defaultValues: { id: candidatureId, commentaire: null },
  });

  async function soumettre(values: RefusCandidatureInput) {
    setErreur(null);
    const r = await onRefuser(values);
    if (!r.ok) {
      setErreur(r.error);
      appliquerErreursServeur(form, r.fieldErrors);
      return;
    }
    toast.success('Candidature refusée');
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(soumettre)}
        className="grid gap-3 rounded-lg border border-rose-200 bg-rose-50/40 p-3 dark:border-rose-900/50 dark:bg-rose-950/20"
        aria-label="Refuser la candidature"
      >
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        <FormField
          control={form.control}
          name="motifRefus"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Motif du refus</FormLabel>
              <OptionSelect
                options={OPTIONS_MOTIF_REFUS}
                value={field.value ?? null}
                onChange={(v) => field.onChange(v ?? undefined)}
                libelleAucune="Choisir un motif…"
                aria-label="Motif du refus"
              />
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="commentaire"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Commentaire (facultatif)</FormLabel>
              <FormControl>
                <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onAnnuler}>
            Annuler
          </Button>
          <Button
            type="submit"
            variant="destructive"
            size="sm"
            disabled={form.formState.isSubmitting}
          >
            {form.formState.isSubmitting ? 'Refus…' : 'Confirmer le refus'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────
// Entretien (date + heure de Paris)
// ─────────────────────────────────────────────────────────────

export function EntretienForm({
  candidatureId,
  dateEntretien,
  onPlanifier,
}: {
  candidatureId: string;
  /** Instant ISO de l'entretien déjà planifié, ou null. */
  dateEntretien: string | null;
  onPlanifier: (input: EntretienCandidatureInput) => Promise<ActionResult>;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const local = dateHeureParis(dateEntretien);
  const form = useForm<EntretienCandidatureInput>({
    resolver: typedZodResolver(entretienCandidatureSchema),
    defaultValues: { id: candidatureId, date: local?.date ?? null, heure: local?.heure ?? null },
  });

  async function envoyer(values: EntretienCandidatureInput) {
    setErreur(null);
    const r = await onPlanifier(values);
    if (!r.ok) {
      setErreur(r.error);
      appliquerErreursServeur(form, r.fieldErrors);
      return;
    }
    toast.success(values.date ? 'Entretien planifié' : 'Entretien annulé');
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(envoyer)}
        className="grid gap-3"
        aria-label="Planifier l’entretien"
      >
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date de l’entretien</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="heure"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Heure (Paris)</FormLabel>
                <FormControl>
                  <Input type="time" step={300} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {dateEntretien && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={form.formState.isSubmitting}
              onClick={() => void envoyer({ id: candidatureId, date: null, heure: null })}
            >
              Annuler l’entretien
            </Button>
          )}
          <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
            {dateEntretien ? 'Replanifier' : 'Planifier'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

// ─────────────────────────────────────────────────────────────
// Commentaire de suivi
// ─────────────────────────────────────────────────────────────

export function CommentaireForm({
  candidatureId,
  commentaire,
  onCommenter,
}: {
  candidatureId: string;
  commentaire: string | null;
  onCommenter: (input: CommentaireCandidatureInput) => Promise<ActionResult>;
}) {
  const [erreur, setErreur] = useState<string | null>(null);
  const form = useForm<CommentaireCandidatureInput>({
    resolver: typedZodResolver(commentaireCandidatureSchema),
    defaultValues: { id: candidatureId, commentaire },
  });

  async function envoyer(values: CommentaireCandidatureInput) {
    setErreur(null);
    const r = await onCommenter(values);
    if (!r.ok) {
      setErreur(r.error);
      appliquerErreursServeur(form, r.fieldErrors);
      return;
    }
    toast.success('Commentaire enregistré');
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(envoyer)} className="grid gap-2" aria-label="Commentaire">
        {erreur && <p className="text-sm text-destructive">{erreur}</p>}
        <FormField
          control={form.control}
          name="commentaire"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Commentaire de suivi</FormLabel>
              <FormControl>
                <Textarea rows={3} maxLength={2000} {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button type="submit" variant="outline" size="sm" disabled={form.formState.isSubmitting}>
            Enregistrer le commentaire
          </Button>
        </div>
      </form>
    </Form>
  );
}
