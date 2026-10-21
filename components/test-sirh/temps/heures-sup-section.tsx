'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { StatutDemandeBadge } from '@/components/test-sirh/statut-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatDateHeure, formatHeures } from '@/lib/test-sirh/format';
import {
  libelleMajoration,
  LIBELLES_COURTS_COMPENSATION,
  peutAnnulerHeuresSup,
  peutDeciderHeuresSup,
  resumeHeuresSup,
} from '@/lib/test-sirh/temps/heures-sup';
import type { DecisionInput } from '@/lib/validation/test-sirh/commun';
import type { CompensationHs, StatutDemande } from '@/lib/validation/test-sirh/enums';
import type { HeuresSupInput } from '@/lib/validation/test-sirh/temps';

import { DecisionHeuresSupDialog, type DemandeADecider } from './decision-heures-sup-dialog';
import { DemandeHeuresSupDialog } from './demande-heures-sup-dialog';

/** Ligne affichée (sérialisable, cf. `HeuresSupVue` de `lib/test-sirh/temps/queries`). */
export type HeuresSupLigne = {
  id: string;
  employeId: string;
  employeNom: string;
  employePrenom: string;
  matricule: string | null;
  dateHeures: string;
  dureeHeures: number;
  majorationPct: number;
  compensation: CompensationHs;
  motif: string | null;
  chantierLabel: string | null;
  statut: StatutDemande;
  valideurEmail: string | null;
  dateDecision: string | null;
  commentaireDecision: string | null;
};

export type ActionsHeuresSup = {
  demander: (input: HeuresSupInput) => Promise<ActionResult<{ id: string }>>;
  decider?: (input: DecisionInput) => Promise<ActionResult>;
  annuler: (id: string) => Promise<ActionResult>;
};

type Props = {
  demandes: HeuresSupLigne[];
  today: string;
  /** Valideur (décision, annulation d'une demande approuvée, déclaration pour autrui). */
  peutValider: boolean;
  /** Gestionnaire RH (peut décider de sa propre demande). */
  peutGerer: boolean;
  monEmployeId: string | null;
  /** Libre-service : collaborateur imposé dans la modale de demande. */
  employeFixe: OptionListe | null;
  employes: readonly OptionListe[];
  chantiers: readonly OptionListe[];
  actions: ActionsHeuresSup;
  /** Masque la colonne Collaborateur (vue « Mes heures sup. »). */
  masquerCollaborateur?: boolean;
  emptyMessage?: string;
};

/**
 * Demandes d'heures supplémentaires (Factorial attendance/OvertimeRequest) :
 * liste, déclaration, décision (valideurs) et annulation.
 */
export function HeuresSupSection({
  demandes,
  today,
  peutValider,
  peutGerer,
  monEmployeId,
  employeFixe,
  employes,
  chantiers,
  actions,
  masquerCollaborateur = false,
  emptyMessage = 'Aucune demande d’heures supplémentaires.',
}: Props) {
  const [demandeOuverte, setDemandeOuverte] = useState(false);
  const [aDecider, setADecider] = useState<DemandeADecider | null>(null);
  const peutDeclarer = peutValider || employeFixe !== null;

  function peutDecider(d: HeuresSupLigne): boolean {
    return (
      Boolean(actions.decider) &&
      peutValider &&
      peutDeciderHeuresSup(d.statut) &&
      (peutGerer || d.employeId !== monEmployeId)
    );
  }

  function peutAnnuler(d: HeuresSupLigne): boolean {
    const auteur = monEmployeId !== null && d.employeId === monEmployeId;
    return (peutValider || auteur) && peutAnnulerHeuresSup(d.statut, { estValideur: peutValider });
  }

  const colonnes: DataTableColumn<HeuresSupLigne>[] = [
    {
      id: 'date',
      header: 'Date',
      cell: (d) => <span className="tabular-nums">{formatDateFr(d.dateHeures)}</span>,
      sortAccessor: (d) => d.dateHeures,
    },
  ];
  if (!masquerCollaborateur) {
    colonnes.push({
      id: 'collaborateur',
      header: 'Collaborateur',
      cell: (d) => (
        <div className="min-w-0">
          <span className="font-medium">{`${d.employeNom} ${d.employePrenom}`.trim()}</span>
          {d.matricule && <span className="ml-2 text-xs text-muted-foreground">{d.matricule}</span>}
        </div>
      ),
      sortAccessor: (d) => `${d.employeNom} ${d.employePrenom}`,
      searchAccessor: (d) => `${d.employeNom} ${d.employePrenom} ${d.matricule ?? ''}`,
    });
  }
  colonnes.push(
    {
      id: 'duree',
      header: 'Durée',
      align: 'right',
      cell: (d) => <span className="font-medium tabular-nums">{formatHeures(d.dureeHeures)}</span>,
      sortAccessor: (d) => d.dureeHeures,
    },
    {
      id: 'majoration',
      header: 'Majoration',
      cell: (d) => (
        <span className="whitespace-nowrap">
          <Badge tone="orange">{libelleMajoration(d.majorationPct)}</Badge>
          <span className="ml-2 text-xs text-muted-foreground">
            {LIBELLES_COURTS_COMPENSATION[d.compensation]}
          </span>
        </span>
      ),
      sortAccessor: (d) => d.majorationPct,
    },
    {
      id: 'chantier',
      header: 'Chantier / motif',
      cell: (d) => (
        <div className="max-w-[240px] text-muted-foreground">
          {d.chantierLabel && <span className="block truncate">{d.chantierLabel}</span>}
          {d.motif && <span className="block truncate text-xs">{d.motif}</span>}
          {!d.chantierLabel && !d.motif && '—'}
        </div>
      ),
      searchAccessor: (d) => `${d.chantierLabel ?? ''} ${d.motif ?? ''}`,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (d) => (
        <div>
          <StatutDemandeBadge statut={d.statut} />
          {d.dateDecision && (
            <span
              className="mt-0.5 block text-xs text-muted-foreground"
              title={d.commentaireDecision ?? undefined}
            >
              {formatDateHeure(d.dateDecision)}
              {d.valideurEmail ? ` · ${d.valideurEmail}` : ''}
            </span>
          )}
          {d.commentaireDecision && (
            <span className="block max-w-[220px] truncate text-xs italic text-muted-foreground">
              « {d.commentaireDecision} »
            </span>
          )}
        </div>
      ),
      sortAccessor: (d) => d.statut,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (d) => (
        <div className="flex items-center justify-end gap-1">
          {peutDecider(d) && (
            <>
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  setADecider({ id: d.id, decision: 'approuver', resume: resumeHeuresSup(d) })
                }
              >
                Approuver
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() =>
                  setADecider({ id: d.id, decision: 'refuser', resume: resumeHeuresSup(d) })
                }
              >
                Refuser
              </Button>
            </>
          )}
          {peutAnnuler(d) && (
            <BoutonConfirmation
              libelle="Annuler"
              question="Annuler cette demande ?"
              libelleConfirmer="Confirmer l’annulation"
              messageSucces="Demande annulée"
              onConfirm={() => actions.annuler(d.id)}
            />
          )}
        </div>
      ),
    },
  );

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={demandes}
        rowKey={(d) => d.id}
        searchPlaceholder="Rechercher un collaborateur, un chantier…"
        emptyMessage={emptyMessage}
        defaultSort={{ id: 'date', dir: 'desc' }}
        rowClassName={(d) =>
          d.statut === 'annulee' || d.statut === 'refusee' ? 'opacity-70' : undefined
        }
        rightActions={
          peutDeclarer ? (
            <Button size="sm" onClick={() => setDemandeOuverte(true)}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle demande
            </Button>
          ) : null
        }
      />
      {peutDeclarer && (
        <DemandeHeuresSupDialog
          open={demandeOuverte}
          onOpenChange={setDemandeOuverte}
          employeFixe={peutValider ? null : employeFixe}
          employes={employes}
          chantiers={chantiers}
          today={today}
          onSubmit={actions.demander}
        />
      )}
      {actions.decider && (
        <DecisionHeuresSupDialog
          demande={aDecider}
          onOpenChange={(open) => !open && setADecider(null)}
          onDecider={actions.decider}
        />
      )}
    </>
  );
}
