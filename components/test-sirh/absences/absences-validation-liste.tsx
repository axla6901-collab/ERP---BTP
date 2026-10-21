'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import { Button } from '@/components/ui/button';
import { libellePlage } from '@/lib/test-sirh/absences/regles';
import { formatDuree } from '@/lib/test-sirh/absences/soldes';
import type { AbsenceEnAttente } from '@/lib/test-sirh/absences/types';
import { formatDateFr } from '@/lib/test-sirh/format';
import { cn } from '@/lib/utils';

import { DecisionAbsenceDialog, type ActionDecisionAbsence } from './decision-absence-dialog';
import { TypeAbsenceLibelle } from './elements';

type Props = {
  /** Demandes en attente (cf. `listerAbsencesEnAttente`). */
  absences: AbsenceEnAttente[];
  /** Gestion RH (admin / RH) : peut décider ses propres demandes. */
  estGestionnaire?: boolean;
  actions: {
    decider: ActionDecisionAbsence;
    obtenirUrlJustificatif?:
      | ((
          id: string,
        ) => Promise<{ ok: true; url: string; titre: string } | { ok: false; error: string }>)
      | undefined;
  };
  emptyMessage?: string;
};

/**
 * Demandes d'absence en attente de décision (écran Validations) : une ligne
 * par demande avec période, durée, motif, justificatif, solde avant / après,
 * et les boutons Approuver / Refuser (commentaire dans un dialogue).
 */
export function AbsencesValidationListe({
  absences,
  estGestionnaire = false,
  actions,
  emptyMessage = 'Aucune demande d’absence en attente.',
}: Props) {
  const [decision, setDecision] = useState<{
    absence: AbsenceEnAttente;
    type: 'approuver' | 'refuser';
  } | null>(null);

  if (absences.length === 0) return <SirhVide>{emptyMessage}</SirhVide>;

  return (
    <>
      <ul className="divide-y overflow-hidden rounded-xl border bg-card">
        {absences.map((a) => {
          const bloquePropre = a.estPropreDemande && !estGestionnaire;
          return (
            <li
              key={a.id}
              className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center"
              data-testid="absence-en-attente"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-medium">{a.employe}</span>
                  <TypeAbsenceLibelle
                    libelle={a.typeLibelle}
                    code={a.typeCode}
                    couleur={a.couleur}
                    className="text-sm"
                  />
                </div>
                <div className="text-sm">
                  {libellePlage(a)} ·{' '}
                  <span className="font-medium tabular-nums">{formatDuree(a.duree, a.unite)}</span>
                </div>
                {a.soldeAvant !== null && a.soldeApres !== null && (
                  <div className="text-xs text-muted-foreground">
                    Solde : {formatDuree(a.soldeAvant, a.unite)} →{' '}
                    <span
                      className={cn(
                        'font-medium tabular-nums',
                        a.soldeApres < 0 ? 'text-rose-700' : 'text-foreground',
                      )}
                    >
                      {formatDuree(a.soldeApres, a.unite)}
                    </span>{' '}
                    après validation
                  </div>
                )}
                {a.motif && <p className="text-xs italic text-muted-foreground">« {a.motif} »</p>}
                <p className="text-xs text-muted-foreground">
                  Demandée le {formatDateFr(a.createdAt.slice(0, 10))}
                  {a.demandePar ? ` par ${a.demandePar}` : ''}
                  {bloquePropre && ' · votre propre demande : décision par un autre valideur'}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {a.justificatifDocumentId && actions.obtenirUrlJustificatif && (
                  <TelechargementDocument
                    documentId={a.justificatifDocumentId}
                    obtenirUrl={actions.obtenirUrlJustificatif}
                    libelle="Justificatif"
                  />
                )}
                <Button
                  type="button"
                  size="sm"
                  disabled={bloquePropre}
                  onClick={() => setDecision({ absence: a, type: 'approuver' })}
                  aria-label={`Approuver la demande de ${a.employe}`}
                >
                  <CheckIcon className="mr-1 size-3.5" />
                  Approuver
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={bloquePropre}
                  onClick={() => setDecision({ absence: a, type: 'refuser' })}
                  aria-label={`Refuser la demande de ${a.employe}`}
                >
                  <XIcon className="mr-1 size-3.5" />
                  Refuser
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
      <DecisionAbsenceDialog
        absence={decision?.absence ?? null}
        decision={decision?.type ?? 'approuver'}
        open={decision !== null}
        onOpenChange={(o) => {
          if (!o) setDecision(null);
        }}
        onDecider={actions.decider}
      />
    </>
  );
}
