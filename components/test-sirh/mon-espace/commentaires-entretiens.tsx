'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Form, FormControl, FormField, FormItem, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import type { ActionResult } from '@/lib/common/action-result';
import { typedZodResolver } from '@/lib/forms/zod-resolver';
import { compteRenduVerrouille } from '@/lib/test-sirh/entretiens/statuts';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  commentaireSalarieSchema,
  type CommentaireSalarieInput,
} from '@/lib/validation/test-sirh/entretiens';
import {
  LIBELLES_STATUT_ENTRETIEN,
  LIBELLES_TYPE_ENTRETIEN,
  type StatutEntretien,
  type TypeEntretien,
} from '@/lib/validation/test-sirh/enums';

export type EntretienCommentable = {
  id: string;
  typeEntretien: TypeEntretien;
  statut: StatutEntretien;
  datePrevue: string | null;
  dateRealisation: string | null;
  commentaireSalarie: string | null;
};

/**
 * Un compte rendu signé ou annulé n'accepte plus de commentaire (règle du domaine
 * Entretiens). Côté serveur, appeler directement `compteRenduVerrouille` : une
 * fonction exportée d'un module client n'est pas invocable depuis un Server Component.
 */
export function commentaireModifiable(statut: StatutEntretien): boolean {
  return !compteRenduVerrouille(statut);
}

function FormulaireCommentaire({
  entretien,
  onEnregistrer,
}: {
  entretien: EntretienCommentable;
  onEnregistrer: (input: CommentaireSalarieInput) => Promise<ActionResult<{ id: string }>>;
}) {
  const [envoi, setEnvoi] = useState(false);
  const form = useForm<CommentaireSalarieInput>({
    resolver: typedZodResolver(commentaireSalarieSchema),
    defaultValues: { id: entretien.id, commentaireSalarie: entretien.commentaireSalarie },
  });

  async function soumettre(values: CommentaireSalarieInput) {
    setEnvoi(true);
    const r = await onEnregistrer(values);
    setEnvoi(false);
    if (!r.ok) {
      toast.error(r.error);
      return;
    }
    toast.success('Commentaire enregistré');
    form.reset(values);
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(soumettre)} className="space-y-2">
        <FormField
          control={form.control}
          name="commentaireSalarie"
          render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  rows={2}
                  placeholder="Votre commentaire sur cet entretien (facultatif)…"
                  aria-label="Mon commentaire"
                  {...field}
                  value={field.value ?? ''}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end">
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={envoi || !form.formState.isDirty}
          >
            {envoi ? 'Enregistrement…' : 'Enregistrer mon commentaire'}
          </Button>
        </div>
      </form>
    </Form>
  );
}

/**
 * « Mon espace » : le salarié consulte ses entretiens et y ajoute son
 * commentaire tant que le compte rendu n'est ni signé ni annulé.
 */
export function CommentairesEntretiens({
  entretiens,
  onEnregistrer,
}: {
  entretiens: readonly EntretienCommentable[];
  onEnregistrer: (input: CommentaireSalarieInput) => Promise<ActionResult<{ id: string }>>;
}) {
  const visibles = entretiens.filter((e) => e.statut !== 'annule');
  if (visibles.length === 0) return <SirhVide>Aucun entretien programmé.</SirhVide>;
  return (
    <ul className="divide-y">
      {visibles.map((e) => (
        <li key={e.id} className="space-y-2 py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <span>
              <span className="font-medium">{LIBELLES_TYPE_ENTRETIEN[e.typeEntretien]}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {e.dateRealisation
                  ? `réalisé le ${formatDateFr(e.dateRealisation)}`
                  : e.datePrevue
                    ? `prévu le ${formatDateFr(e.datePrevue)}`
                    : 'date à fixer'}
              </span>
            </span>
            <Badge tone={e.statut === 'signe' || e.statut === 'realise' ? 'emerald' : 'amber'}>
              {LIBELLES_STATUT_ENTRETIEN[e.statut]}
            </Badge>
          </div>
          {commentaireModifiable(e.statut) ? (
            <FormulaireCommentaire entretien={e} onEnregistrer={onEnregistrer} />
          ) : (
            <p className="rounded-md bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              {e.commentaireSalarie ?? 'Aucun commentaire.'}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
