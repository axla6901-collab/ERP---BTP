'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import { Button } from '@/components/ui/button';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatEuro } from '@/lib/test-sirh/format';
import { detailMontantNoteFrais } from '@/lib/test-sirh/notes-frais/calculs';
import type { NoteFraisLigne } from '@/lib/test-sirh/notes-frais/queries';
import type { DecisionInput } from '@/lib/validation/test-sirh/commun';
import { LIBELLES_CATEGORIE_FRAIS } from '@/lib/validation/test-sirh/enums';

import { DecisionNoteFraisDialog } from './decision-note-frais-dialog';
import type { ResultatUrlDocument } from './notes-frais-table';

type Props = {
  /** Notes soumises (`listerNotesFraisEnAttente()`). */
  notes: NoteFraisLigne[];
  actions: {
    decider: (input: DecisionInput) => Promise<ActionResult>;
    urlTelechargement: (id: string) => Promise<ResultatUrlDocument>;
  };
  emptyMessage?: string;
};

/**
 * Notes de frais en attente de décision (page Validations) : approbation ou
 * refus motivé ; le justificatif s'ouvre en un clic. Les boutons sont
 * désactivés sur les notes de l'utilisateur lui-même (pas d'auto-validation).
 */
export function NotesFraisValidationListe({
  notes,
  actions,
  emptyMessage = 'Aucune note de frais en attente de validation.',
}: Props) {
  const [aDecider, setADecider] = useState<{
    note: NoteFraisLigne;
    decision: 'approuver' | 'refuser';
  } | null>(null);

  if (notes.length === 0) return <SirhVide>{emptyMessage}</SirhVide>;

  const total = notes.reduce((s, n) => s + n.montantTtc, 0);

  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-2 font-medium">Collaborateur</th>
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Dépense</th>
              <th className="px-4 py-2 text-right font-medium">Montant</th>
              <th className="px-4 py-2 text-center font-medium">Pièce</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {notes.map((n) => {
              const detail = detailMontantNoteFrais(n);
              return (
                <tr key={n.id}>
                  <td className="px-4 py-2 font-medium">{n.employeNom}</td>
                  <td className="px-4 py-2 tabular-nums">{formatDateFr(n.dateDepense)}</td>
                  <td className="px-4 py-2">
                    <span className="block">{n.libelle}</span>
                    <span className="block text-xs text-muted-foreground">
                      {LIBELLES_CATEGORIE_FRAIS[n.categorie]}
                      {detail && ` · ${detail}`}
                      {n.chantierLabel && ` · ${n.chantierLabel}`}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right font-medium tabular-nums">
                    {formatEuro(n.montantTtc)}
                  </td>
                  <td className="px-4 py-2 text-center">
                    {n.justificatifDocumentId ? (
                      <TelechargementDocument
                        documentId={n.justificatifDocumentId}
                        obtenirUrl={actions.urlTelechargement}
                        libelle={n.justificatifTitre ?? 'Justificatif'}
                        compact
                      />
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!n.droits.decider}
                        title={
                          n.droits.decider
                            ? undefined
                            : 'Vous ne pouvez pas statuer sur votre propre note.'
                        }
                        onClick={() => setADecider({ note: n, decision: 'approuver' })}
                        aria-label={`Approuver la note de ${n.employeNom}`}
                      >
                        <CheckIcon className="size-3.5" /> Approuver
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={!n.droits.decider}
                        onClick={() => setADecider({ note: n, decision: 'refuser' })}
                        aria-label={`Refuser la note de ${n.employeNom}`}
                      >
                        <XIcon className="size-3.5" /> Refuser
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t bg-muted/20 text-xs text-muted-foreground">
            <tr>
              <td className="px-4 py-2" colSpan={3}>
                {notes.length} note{notes.length > 1 ? 's' : ''} en attente
              </td>
              <td className="px-4 py-2 text-right font-medium tabular-nums text-foreground">
                {formatEuro(total)}
              </td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <DecisionNoteFraisDialog
        note={aDecider?.note ?? null}
        decision={aDecider?.decision ?? 'approuver'}
        onClose={() => setADecider(null)}
        onDecider={actions.decider}
      />
    </>
  );
}
