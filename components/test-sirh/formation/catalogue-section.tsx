'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { libelleValidite } from '@/lib/test-sirh/formation/validite';
import { formatEuro, formatHeures, versNombre } from '@/lib/test-sirh/format';
import {
  LIBELLES_MODALITE_FORMATION,
  type CategorieFormation,
  type ModaliteFormation,
} from '@/lib/validation/test-sirh/enums';
import type { FormationInput } from '@/lib/validation/test-sirh/formation';

import { LIBELLES_COURTS_CATEGORIE_FORMATION } from './badges';
import { FormationDialog } from './formation-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type FormationLigneUI = {
  id: string;
  code: string | null;
  intitule: string;
  categorie: CategorieFormation;
  organisme: string | null;
  modalite: ModaliteFormation;
  dureeHeures: string | null;
  coutHt: string | null;
  obligatoire: boolean;
  validiteMois: number | null;
  description: string | null;
  actif: boolean;
  nbSessions: number;
};

type Props = {
  formations: FormationLigneUI[];
  peutGerer: boolean;
  actions: {
    enregistrer: (input: FormationInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Catalogue des formations + création / édition en modale + suppression gardée. */
export function CatalogueSection({ formations, peutGerer, actions }: Props) {
  const [edition, setEdition] = useState<{ ouvert: boolean; formation: FormationLigneUI | null }>({
    ouvert: false,
    formation: null,
  });
  const enEdition = edition.formation;
  const valeursEdition = useMemo(
    () =>
      enEdition
        ? {
            id: enEdition.id,
            code: enEdition.code,
            intitule: enEdition.intitule,
            categorie: enEdition.categorie,
            organisme: enEdition.organisme,
            modalite: enEdition.modalite,
            dureeHeures: enEdition.dureeHeures,
            coutHt: enEdition.coutHt,
            obligatoire: enEdition.obligatoire,
            validiteMois: enEdition.validiteMois,
            description: enEdition.description,
            actif: enEdition.actif,
          }
        : null,
    [enEdition],
  );

  const colonnes: DataTableColumn<FormationLigneUI>[] = [
    {
      id: 'intitule',
      header: 'Formation',
      cell: (f) => (
        <div className="min-w-0">
          <span className="font-medium">{f.intitule}</span>
          {f.code && <span className="ml-2 text-xs text-muted-foreground">{f.code}</span>}
          {f.organisme && (
            <span className="block text-xs text-muted-foreground">{f.organisme}</span>
          )}
        </div>
      ),
      sortAccessor: (f) => f.intitule,
      searchAccessor: (f) => `${f.intitule} ${f.code ?? ''} ${f.organisme ?? ''}`,
    },
    {
      id: 'categorie',
      header: 'Catégorie',
      cell: (f) => (
        <span className="flex flex-wrap items-center gap-1.5">
          {LIBELLES_COURTS_CATEGORIE_FORMATION[f.categorie]}
          {f.obligatoire && (
            <Badge tone="orange" shape="pill">
              Obligatoire
            </Badge>
          )}
        </span>
      ),
      sortAccessor: (f) => LIBELLES_COURTS_CATEGORIE_FORMATION[f.categorie],
      searchAccessor: (f) => LIBELLES_COURTS_CATEGORIE_FORMATION[f.categorie],
    },
    {
      id: 'modalite',
      header: 'Modalité',
      cell: (f) => LIBELLES_MODALITE_FORMATION[f.modalite],
      sortAccessor: (f) => LIBELLES_MODALITE_FORMATION[f.modalite],
    },
    {
      id: 'duree',
      header: 'Durée',
      align: 'right',
      cell: (f) => <span className="tabular-nums">{formatHeures(f.dureeHeures)}</span>,
      sortAccessor: (f) => versNombre(f.dureeHeures),
    },
    {
      id: 'cout',
      header: 'Coût HT / pers.',
      align: 'right',
      cell: (f) => <span className="tabular-nums">{formatEuro(f.coutHt)}</span>,
      sortAccessor: (f) => versNombre(f.coutHt),
    },
    {
      id: 'validite',
      header: 'Validité',
      cell: (f) =>
        f.validiteMois ? (
          libelleValidite(f.validiteMois)
        ) : (
          <span className="text-muted-foreground">{libelleValidite(null)}</span>
        ),
      sortAccessor: (f) => f.validiteMois,
    },
    {
      id: 'sessions',
      header: 'Sessions',
      align: 'right',
      cell: (f) => <span className="tabular-nums">{f.nbSessions}</span>,
      sortAccessor: (f) => f.nbSessions,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (f) =>
        f.actif ? (
          <Badge tone="emerald" shape="pill">
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Inactive
          </Badge>
        ),
      sortAccessor: (f) => (f.actif ? 0 : 1),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (f) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setEdition({ ouvert: true, formation: f })}
            title="Modifier"
            aria-label={`Modifier ${f.intitule}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer cette formation ?"
            libelleConfirmer="Supprimer"
            messageSucces="Formation supprimée"
            onConfirm={() => actions.supprimer(f.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={formations}
        rowKey={(f) => f.id}
        searchPlaceholder="Rechercher une formation, un organisme…"
        emptyMessage="Aucune formation au catalogue. Ajoutez vos formations (SST, CACES, AIPR, habilitations…)."
        defaultSort={{ id: 'intitule', dir: 'asc' }}
        rowClassName={(f) => (f.actif ? undefined : 'opacity-60')}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setEdition({ ouvert: true, formation: null })}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle formation
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <FormationDialog
          open={edition.ouvert}
          onOpenChange={(ouvert) => setEdition((e) => ({ ...e, ouvert }))}
          formation={valeursEdition}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
