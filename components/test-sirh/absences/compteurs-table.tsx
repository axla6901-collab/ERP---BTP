'use client';

import { PencilIcon, PlusIcon, ScaleIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDuree } from '@/lib/test-sirh/absences/soldes';
import type { CompteurLigne, TypeAbsenceSolde } from '@/lib/test-sirh/absences/types';
import { formatDateFr } from '@/lib/test-sirh/format';
import { cn } from '@/lib/utils';
import type { AjustementInput, CompteurInput } from '@/lib/validation/test-sirh/absences';

import { AjustementsDialog } from './ajustements-dialog';
import { CompteurDialog } from './compteur-dialog';
import { TypeAbsenceLibelle } from './elements';

export type ActionsCompteurs = {
  enregistrer: (input: CompteurInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
  ajouterAjustement: (input: AjustementInput) => Promise<ActionResult<{ id: string }>>;
  supprimerAjustement: (id: string) => Promise<ActionResult>;
};

export type GestionCompteurs = {
  employes: readonly OptionListe[];
  types: readonly TypeAbsenceSolde[];
  actions: ActionsCompteurs;
};

type Props = {
  compteurs: CompteurLigne[];
  /** Date du jour ISO (période par défaut, date d'ajustement). */
  today: string;
  /** Masque la colonne Collaborateur (dossier, Mon espace). */
  masquerEmploye?: boolean;
  /** Gestion RH : création, édition, ajustements, suppression. Absent = lecture seule. */
  gestion?: GestionCompteurs | null | undefined;
  emptyMessage?: string;
  /** Actions supplémentaires à droite de la recherche (ex. initialisation). */
  rightActions?: ReactNode;
};

/**
 * Compteurs de droits (Factorial Allowance + AllowanceStat) : droits, report,
 * Σ ajustements, pris, en attente, solde. Réutilisable en lecture seule.
 */
export function CompteursTable({
  compteurs,
  today,
  masquerEmploye = false,
  gestion = null,
  emptyMessage = 'Aucun compteur sur cette période.',
  rightActions,
}: Props) {
  const [edition, setEdition] = useState<{ ouvert: boolean; compteur: CompteurLigne | null }>({
    ouvert: false,
    compteur: null,
  });
  // On retient l'id (et non la ligne) : après `router.refresh()`, le détail affiché suit les données.
  const [idAjustements, setIdAjustements] = useState<string | null>(null);
  const compteurAjustements = compteurs.find((c) => c.id === idAjustements) ?? null;

  const colonnes: DataTableColumn<CompteurLigne>[] = [];
  if (!masquerEmploye) {
    colonnes.push({
      id: 'employe',
      header: 'Collaborateur',
      cell: (c) => (
        <div className="min-w-0">
          <span className="font-medium">{c.employe}</span>
          {c.matricule && <span className="ml-2 text-xs text-muted-foreground">{c.matricule}</span>}
        </div>
      ),
      sortAccessor: (c) => c.employe,
      searchAccessor: (c) => `${c.employe} ${c.matricule ?? ''}`,
    });
  }
  colonnes.push(
    {
      id: 'type',
      header: 'Type',
      cell: (c) => (
        <TypeAbsenceLibelle libelle={c.typeLibelle} code={c.typeCode} couleur={c.couleur} />
      ),
      sortAccessor: (c) => c.typeLibelle,
      searchAccessor: (c) => `${c.typeLibelle} ${c.typeCode}`,
    },
    {
      id: 'periode',
      header: 'Période',
      cell: (c) => (
        <span className="whitespace-nowrap text-sm text-muted-foreground">
          {formatDateFr(c.periodeDebut)} → {formatDateFr(c.periodeFin)}
        </span>
      ),
      sortAccessor: (c) => c.periodeDebut,
    },
    {
      id: 'droits',
      header: 'Droits',
      align: 'right',
      cell: (c) => <span className="tabular-nums">{formatDuree(c.droitsAcquis, c.unite)}</span>,
      sortAccessor: (c) => c.droitsAcquis,
    },
    {
      id: 'report',
      header: 'Report',
      align: 'right',
      cell: (c) => <span className="tabular-nums">{formatDuree(c.report, c.unite)}</span>,
      sortAccessor: (c) => c.report,
    },
    {
      id: 'ajustements',
      header: 'Ajust.',
      align: 'right',
      cell: (c) => (
        <button
          type="button"
          className="tabular-nums underline-offset-2 hover:underline"
          onClick={() => setIdAjustements(c.id)}
          title="Voir le détail et les ajustements"
        >
          {c.totalAjustements > 0 ? '+' : ''}
          {formatDuree(c.totalAjustements, c.unite)}
        </button>
      ),
      sortAccessor: (c) => c.totalAjustements,
    },
    {
      id: 'pris',
      header: 'Pris',
      align: 'right',
      cell: (c) => <span className="tabular-nums">{formatDuree(c.pris, c.unite)}</span>,
      sortAccessor: (c) => c.pris,
    },
    {
      id: 'attente',
      header: 'En attente',
      align: 'right',
      cell: (c) => (
        <span className={cn('tabular-nums', c.enAttente > 0 && 'text-amber-700')}>
          {formatDuree(c.enAttente, c.unite)}
        </span>
      ),
      sortAccessor: (c) => c.enAttente,
    },
    {
      id: 'solde',
      header: 'Solde',
      align: 'right',
      cell: (c) => (
        <div className="leading-tight">
          <span
            className={cn(
              'font-semibold tabular-nums',
              c.solde < 0 ? 'text-rose-700' : 'text-emerald-700',
            )}
          >
            {formatDuree(c.solde, c.unite)}
          </span>
          {c.enAttente > 0 && (
            <div className="text-xs text-muted-foreground">
              prév. {formatDuree(c.soldePrevisionnel, c.unite)}
            </div>
          )}
        </div>
      ),
      sortAccessor: (c) => c.solde,
    },
  );

  if (gestion) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (c) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setEdition({ ouvert: true, compteur: c })}
            title="Modifier"
            aria-label={`Modifier le compteur ${c.typeCode} de ${c.employe}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setIdAjustements(c.id)}
            title="Ajuster"
            aria-label={`Ajuster le compteur ${c.typeCode} de ${c.employe}`}
          >
            <ScaleIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer ce compteur ?"
            libelleConfirmer="Supprimer"
            messageSucces="Compteur supprimé"
            onConfirm={() => gestion.actions.supprimer(c.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={compteurs}
        rowKey={(c) => c.id}
        searchPlaceholder="Rechercher un collaborateur, un type…"
        emptyMessage={emptyMessage}
        rowClassName={(c) => (c.solde < 0 ? 'bg-rose-50/60 dark:bg-rose-950/20' : undefined)}
        rightActions={
          gestion || rightActions ? (
            <>
              {rightActions}
              {gestion && (
                <Button size="sm" onClick={() => setEdition({ ouvert: true, compteur: null })}>
                  <PlusIcon className="mr-1 size-4" /> Nouveau compteur
                </Button>
              )}
            </>
          ) : null
        }
      />
      {gestion && (
        <CompteurDialog
          open={edition.ouvert}
          onOpenChange={(o) => setEdition((e) => ({ ...e, ouvert: o }))}
          compteur={edition.compteur}
          employes={gestion.employes}
          types={gestion.types}
          today={today}
          onSubmit={gestion.actions.enregistrer}
        />
      )}
      <AjustementsDialog
        open={compteurAjustements !== null}
        onOpenChange={(o) => {
          if (!o) setIdAjustements(null);
        }}
        compteur={compteurAjustements}
        today={today}
        actions={
          gestion
            ? {
                ajouter: gestion.actions.ajouterAjustement,
                supprimer: gestion.actions.supprimerAjustement,
              }
            : null
        }
      />
    </>
  );
}
