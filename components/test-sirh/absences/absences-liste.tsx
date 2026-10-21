'use client';

import { CheckIcon, XIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { StatutDemandeBadge } from '@/components/test-sirh/statut-badges';
import { TelechargementDocument } from '@/components/test-sirh/telechargement-document';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { libellePlage, verifierAnnulation } from '@/lib/test-sirh/absences/regles';
import { formatDuree } from '@/lib/test-sirh/absences/soldes';
import type { AbsenceLigne } from '@/lib/test-sirh/absences/types';
import { formatDateFr } from '@/lib/test-sirh/format';

import { DecisionAbsenceDialog, type ActionDecisionAbsence } from './decision-absence-dialog';
import { TypeAbsenceLibelle } from './elements';

export type DroitsListeAbsences = {
  /** Rôle VALIDATION : approuver / refuser les demandes en attente. */
  peutValider: boolean;
  /** Gestion RH (admin / RH) : annule à tout moment, décide aussi ses propres demandes. */
  estGestionnaire: boolean;
  /** Fiche employé de l'utilisateur courant (demandes « propres »). */
  monEmployeId: string | null;
  monUtilisateurId: string;
};

export type ActionsListeAbsences = {
  decider?: ActionDecisionAbsence | undefined;
  annuler?: ((id: string) => Promise<ActionResult>) | undefined;
  obtenirUrlJustificatif?:
    | ((
        id: string,
      ) => Promise<{ ok: true; url: string; titre: string } | { ok: false; error: string }>)
    | undefined;
};

type Props = {
  absences: AbsenceLigne[];
  /** Date du jour ISO (annulation d'une absence à venir). */
  today: string;
  droits: DroitsListeAbsences;
  actions: ActionsListeAbsences;
  /** Masque la colonne Collaborateur (dossier, Mon espace). */
  masquerEmploye?: boolean;
  emptyMessage?: string;
  rightActions?: ReactNode;
};

/**
 * Liste des demandes d'absence (DataTable) : type, période, durée, statut,
 * commentaires, justificatif ; décision (valideurs) et annulation selon les droits.
 */
export function AbsencesListe({
  absences,
  today,
  droits,
  actions,
  masquerEmploye = false,
  emptyMessage = 'Aucune demande d’absence.',
  rightActions,
}: Props) {
  const [decision, setDecision] = useState<{
    absence: AbsenceLigne;
    type: 'approuver' | 'refuser';
  } | null>(null);

  const estPropre = (a: AbsenceLigne) =>
    droits.monEmployeId !== null && a.employeId === droits.monEmployeId;

  const colonnes: DataTableColumn<AbsenceLigne>[] = [];
  if (!masquerEmploye) {
    colonnes.push({
      id: 'employe',
      header: 'Collaborateur',
      cell: (a) => (
        <div className="min-w-0">
          <span className="font-medium">{a.employe}</span>
          {a.matricule && <span className="ml-2 text-xs text-muted-foreground">{a.matricule}</span>}
        </div>
      ),
      sortAccessor: (a) => a.employe,
      searchAccessor: (a) => `${a.employe} ${a.matricule ?? ''}`,
    });
  }
  colonnes.push(
    {
      id: 'type',
      header: 'Type',
      cell: (a) => <TypeAbsenceLibelle libelle={a.typeLibelle} couleur={a.couleur} />,
      sortAccessor: (a) => a.typeLibelle,
      searchAccessor: (a) => `${a.typeLibelle} ${a.typeCode}`,
    },
    {
      id: 'periode',
      header: 'Période',
      cell: (a) => <span className="whitespace-nowrap text-sm">{libellePlage(a)}</span>,
      sortAccessor: (a) => a.dateDebut,
    },
    {
      id: 'duree',
      header: 'Durée',
      align: 'right',
      cell: (a) => <span className="tabular-nums">{formatDuree(a.duree, a.unite)}</span>,
      sortAccessor: (a) => a.duree,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (a) => (
        <div className="space-y-0.5">
          <StatutDemandeBadge statut={a.statut} />
          {a.dateDecision && (a.statut === 'approuvee' || a.statut === 'refusee') && (
            <div className="text-xs text-muted-foreground">
              {a.valideur ? `par ${a.valideur} ` : ''}le {formatDateFr(a.dateDecision.slice(0, 10))}
            </div>
          )}
        </div>
      ),
      sortAccessor: (a) => a.statut,
    },
    {
      id: 'commentaires',
      header: 'Motif / décision',
      cell: (a) =>
        a.motif || a.commentaireDecision ? (
          <div className="max-w-64 space-y-0.5 text-xs">
            {a.motif && (
              <p className="truncate" title={a.motif}>
                {a.motif}
              </p>
            )}
            {a.commentaireDecision && (
              <p className="truncate italic text-muted-foreground" title={a.commentaireDecision}>
                {a.commentaireDecision}
              </p>
            )}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      searchAccessor: (a) => `${a.motif ?? ''} ${a.commentaireDecision ?? ''}`,
    },
  );

  const { decider, annuler, obtenirUrlJustificatif } = actions;
  if (decider || annuler || obtenirUrlJustificatif) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (a) => {
        const peutDecider = a.statut === 'en_attente' && droits.peutValider && Boolean(decider);
        const bloquePropre = estPropre(a) && !droits.estGestionnaire;
        const peutAnnuler =
          Boolean(annuler) &&
          verifierAnnulation({
            statut: a.statut,
            dateDebut: a.dateDebut,
            today,
            estGestionnaire: droits.estGestionnaire,
            estDemandeur: estPropre(a) || a.demandeParId === droits.monUtilisateurId,
          }).ok;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {a.justificatifDocumentId && obtenirUrlJustificatif && (
              <TelechargementDocument
                documentId={a.justificatifDocumentId}
                obtenirUrl={obtenirUrlJustificatif}
                libelle="Justificatif"
                compact
              />
            )}
            {peutDecider && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={bloquePropre}
                  title={
                    bloquePropre ? 'Vous ne pouvez pas valider votre propre demande.' : undefined
                  }
                  onClick={() => setDecision({ absence: a, type: 'approuver' })}
                >
                  <CheckIcon className="mr-1 size-3.5" />
                  Approuver
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  disabled={bloquePropre}
                  onClick={() => setDecision({ absence: a, type: 'refuser' })}
                >
                  <XIcon className="mr-1 size-3.5" />
                  Refuser
                </Button>
              </>
            )}
            {peutAnnuler && annuler && (
              <BoutonConfirmation
                libelle="Annuler"
                question="Annuler cette demande ?"
                libelleConfirmer="Confirmer l’annulation"
                messageSucces="Demande annulée"
                onConfirm={() => annuler(a.id)}
              />
            )}
          </div>
        );
      },
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={absences}
        rowKey={(a) => a.id}
        searchPlaceholder="Rechercher (collaborateur, type, motif)…"
        emptyMessage={emptyMessage}
        rowClassName={(a) =>
          a.statut === 'annulee' || a.statut === 'refusee' ? 'opacity-60' : undefined
        }
        rightActions={rightActions}
      />
      {decider && (
        <DecisionAbsenceDialog
          absence={decision?.absence ?? null}
          decision={decision?.type ?? 'approuver'}
          open={decision !== null}
          onOpenChange={(o) => {
            if (!o) setDecision(null);
          }}
          onDecider={decider}
        />
      )}
    </>
  );
}
