'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Button } from '@/components/ui/button';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { AvisLigne } from '@/lib/test-sirh/recrutement/queries';
import {
  AVIS_RECRUTEMENT,
  LIBELLES_AVIS_RECRUTEMENT,
  type AvisRecrutement,
} from '@/lib/validation/test-sirh/enums';
import {
  avisCandidatureSchema,
  type AvisCandidatureInput,
} from '@/lib/validation/test-sirh/recrutement';

import { AvisRecrutementBadge } from './badges-recrutement';
import { NoteEtoiles } from './note-etoiles';

const OPTIONS_AVIS = AVIS_RECRUTEMENT.map((v) => ({
  value: v,
  label: LIBELLES_AVIS_RECRUTEMENT[v],
}));

type Props = {
  candidatureId: string;
  avis: AvisLigne[];
  /** Utilisateur courant (ses avis sont signalés « Vous » et supprimables). */
  utilisateurId: string;
  peutGerer: boolean;
  onAjouter: (input: AvisCandidatureInput) => Promise<ActionResult<{ id: string }>>;
  onSupprimer: (id: string) => Promise<ActionResult>;
};

function valeursAvisParDefaut(candidatureId: string): AvisCandidatureInput {
  return { candidatureId, note: null, avis: 'reserve', commentaire: null };
}

/** Avis des évaluateurs (Factorial ats/Feedback) : liste + ajout par tout lecteur du SIRH. */
export function AvisSection({
  candidatureId,
  avis,
  utilisateurId,
  peutGerer,
  onAjouter,
  onSupprimer,
}: Props) {
  const [erreur, setErreur] = useState<string | null>(null);
  const form = useForm<AvisCandidatureInput>({
    resolver: typedZodResolver(avisCandidatureSchema),
    defaultValues: valeursAvisParDefaut(candidatureId),
  });

  async function ajouter(values: AvisCandidatureInput) {
    setErreur(null);
    const r = await onAjouter(values);
    if (!r.ok) {
      setErreur(r.error);
      return;
    }
    toast.success('Avis ajouté');
    form.reset(valeursAvisParDefaut(candidatureId));
  }

  return (
    <div className="space-y-4">
      {avis.length === 0 ? (
        <SirhVide>Aucun avis pour l’instant.</SirhVide>
      ) : (
        <ul className="divide-y rounded-lg border">
          {avis.map((a) => {
            const estAuteur = a.auteurId === utilisateurId;
            return (
              <li key={a.id} className="space-y-1 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <AvisRecrutementBadge avis={a.avis} />
                    <NoteEtoiles note={a.note} libelle="Note de l’avis" />
                    <span className="text-xs text-muted-foreground">
                      {estAuteur ? 'Vous' : a.auteurLibelle} · {formatDateFr(a.createdAt)}
                    </span>
                  </div>
                  {(estAuteur || peutGerer) && (
                    <BoutonConfirmation
                      libelle="Supprimer"
                      question="Supprimer cet avis ?"
                      libelleConfirmer="Supprimer"
                      messageSucces="Avis supprimé"
                      onConfirm={() => onSupprimer(a.id)}
                    />
                  )}
                </div>
                {a.commentaire && (
                  <p className="whitespace-pre-line text-sm text-muted-foreground">
                    {a.commentaire}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(ajouter)}
          className="grid gap-3 rounded-lg border bg-muted/20 p-3"
          aria-label="Ajouter un avis"
        >
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
          <div className="flex flex-wrap items-end gap-4">
            <FormField
              control={form.control}
              name="avis"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Mon avis</FormLabel>
                  <SegmentedControl<AvisRecrutement>
                    options={OPTIONS_AVIS}
                    value={field.value}
                    onChange={field.onChange}
                    aria-label="Mon avis"
                  />
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="note"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note</FormLabel>
                  <NoteEtoiles
                    note={field.value}
                    onChange={field.onChange}
                    taille="md"
                    libelle="Ma note"
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
                  <Textarea rows={2} maxLength={2000} {...field} value={field.value ?? ''} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Envoi…' : 'Ajouter mon avis'}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
