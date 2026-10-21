'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import type { OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { NouvelEntretienInput } from '@/lib/validation/test-sirh/entretiens';
import type { StatutEntretien, TypeEntretien } from '@/lib/validation/test-sirh/enums';

import { LIBELLES_COURTS_TYPE_ENTRETIEN, StatutEntretienBadge } from './badges';
import { EntretienDialog } from './entretien-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type EntretienLigneUI = {
  id: string;
  campagneLibelle: string | null;
  /** « Prénom Nom ». */
  employeNom: string;
  /** Clé de tri « nom prénom ». */
  employeTri: string;
  employeMatricule: string | null;
  evaluateurNom: string | null;
  typeEntretien: TypeEntretien;
  datePrevue: string | null;
  dateRealisation: string | null;
  statut: StatutEntretien;
  noteGlobale: number | null;
};

type Props = {
  entretiens: EntretienLigneUI[];
  /** Préfixe `/<slug>/test-sirh`. */
  base: string;
  peutGerer: boolean;
  /** Collaborateurs actifs (création). */
  employes: OptionListe[];
  /** Campagnes ouvertes au rattachement. */
  campagnes: OptionListe[];
  creer: (input: NouvelEntretienInput) => Promise<ActionResult<{ id: string }>>;
};

/** Date de référence affichée : réalisation, sinon date prévue. */
function dateAffichee(e: EntretienLigneUI): { libelle: string; date: string | null } {
  if (e.dateRealisation) return { libelle: 'Réalisé le', date: e.dateRealisation };
  if (e.datePrevue) return { libelle: 'Prévu le', date: e.datePrevue };
  return { libelle: '', date: null };
}

/** Liste des entretiens (ligne cliquable → compte rendu) + création hors campagne. */
export function EntretiensSection({
  entretiens,
  base,
  peutGerer,
  employes,
  campagnes,
  creer,
}: Props) {
  const [ouvert, setOuvert] = useState(false);

  const colonnes: DataTableColumn<EntretienLigneUI>[] = [
    {
      id: 'employe',
      header: 'Collaborateur',
      cell: (e) => (
        <div className="min-w-0">
          <span className="font-medium">{e.employeNom}</span>
          {e.employeMatricule && (
            <span className="ml-2 text-xs text-muted-foreground">{e.employeMatricule}</span>
          )}
        </div>
      ),
      sortAccessor: (e) => e.employeTri,
      searchAccessor: (e) => `${e.employeNom} ${e.employeMatricule ?? ''}`,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (e) => LIBELLES_COURTS_TYPE_ENTRETIEN[e.typeEntretien],
      sortAccessor: (e) => LIBELLES_COURTS_TYPE_ENTRETIEN[e.typeEntretien],
      searchAccessor: (e) => LIBELLES_COURTS_TYPE_ENTRETIEN[e.typeEntretien],
    },
    {
      id: 'campagne',
      header: 'Campagne',
      cell: (e) =>
        e.campagneLibelle ?? <span className="text-muted-foreground">Hors campagne</span>,
      sortAccessor: (e) => e.campagneLibelle,
      searchAccessor: (e) => e.campagneLibelle,
    },
    {
      id: 'evaluateur',
      header: 'Évaluateur',
      cell: (e) => e.evaluateurNom ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (e) => e.evaluateurNom,
      searchAccessor: (e) => e.evaluateurNom,
    },
    {
      id: 'date',
      header: 'Date',
      cell: (e) => {
        const d = dateAffichee(e);
        return d.date ? (
          <span className="whitespace-nowrap">
            <span className="text-xs text-muted-foreground">{d.libelle} </span>
            <span className="tabular-nums">{formatDateFr(d.date)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">Non planifié</span>
        );
      },
      sortAccessor: (e) => dateAffichee(e).date,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (e) => <StatutEntretienBadge statut={e.statut} />,
      sortAccessor: (e) => e.statut,
    },
    {
      id: 'note',
      header: 'Note',
      align: 'right',
      cell: (e) =>
        e.noteGlobale !== null ? (
          <span className="tabular-nums">{e.noteGlobale} / 5</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (e) => e.noteGlobale,
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={entretiens}
        rowKey={(e) => e.id}
        rowHref={(e) => `${base}/entretiens/${e.id}`}
        searchPlaceholder="Rechercher un collaborateur, une campagne…"
        emptyMessage="Aucun entretien pour ces filtres."
        rowClassName={(e) => (e.statut === 'annule' ? 'opacity-60' : undefined)}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setOuvert(true)}>
              <PlusIcon className="mr-1 size-4" /> Nouvel entretien
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <EntretienDialog
          open={ouvert}
          onOpenChange={setOuvert}
          employes={employes}
          campagnes={campagnes}
          onSubmit={creer}
          lienFiche={(id) => `${base}/entretiens/${id}`}
        />
      )}
    </>
  );
}
