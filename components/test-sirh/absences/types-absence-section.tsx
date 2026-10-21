'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import type { TypeAbsenceLigne } from '@/lib/test-sirh/absences/types';
import type { TypeAbsenceInput } from '@/lib/validation/test-sirh/absences';
import {
  LIBELLES_CATEGORIE_ABSENCE,
  LIBELLES_UNITE_DECOMPTE,
} from '@/lib/validation/test-sirh/enums';

import { TypeAbsenceLibelle } from './elements';
import { TypeAbsenceDialog } from './type-absence-dialog';

type Props = {
  types: TypeAbsenceLigne[];
  peutGerer: boolean;
  actions: {
    enregistrer: (input: TypeAbsenceInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Types d'absence (Factorial LeaveType) : liste, création / édition, suppression gardée. */
export function TypesAbsenceSection({ types, peutGerer, actions }: Props) {
  const [dialog, setDialog] = useState<{ ouvert: boolean; type: TypeAbsenceLigne | null }>({
    ouvert: false,
    type: null,
  });

  const colonnes: DataTableColumn<TypeAbsenceLigne>[] = [
    {
      id: 'libelle',
      header: 'Type',
      cell: (t) => <TypeAbsenceLibelle libelle={t.libelle} code={t.code} couleur={t.couleur} />,
      sortAccessor: (t) => t.libelle,
      searchAccessor: (t) => `${t.libelle} ${t.code}`,
    },
    {
      id: 'categorie',
      header: 'Catégorie',
      cell: (t) => LIBELLES_CATEGORIE_ABSENCE[t.categorie],
      sortAccessor: (t) => LIBELLES_CATEGORIE_ABSENCE[t.categorie],
    },
    {
      id: 'unite',
      header: 'Décompte',
      cell: (t) => (
        <span className="text-sm text-muted-foreground">
          {LIBELLES_UNITE_DECOMPTE[t.uniteDecompte]}
        </span>
      ),
      sortAccessor: (t) => t.uniteDecompte,
    },
    {
      id: 'regles',
      header: 'Règles',
      cell: (t) => (
        <div className="flex flex-wrap gap-1">
          {t.avecSolde && <Badge tone="sky">Solde</Badge>}
          {t.necessiteValidation ? (
            <Badge tone="amber">Validation</Badge>
          ) : (
            <Badge tone="neutral">Sans validation</Badge>
          )}
          {t.justificatifRequis && <Badge tone="violet">Justificatif</Badge>}
          {!t.remuneree && <Badge tone="rose">Non rémunérée</Badge>}
        </div>
      ),
    },
    {
      id: 'rubrique',
      header: 'Rubrique paie',
      cell: (t) =>
        t.codeRubriquePaie ? (
          <span className="font-mono text-xs">{t.codeRubriquePaie}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      searchAccessor: (t) => t.codeRubriquePaie,
    },
    {
      id: 'usage',
      header: 'Utilisation',
      align: 'right',
      cell: (t) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {t.nbAbsences} abs. · {t.nbCompteurs} cpt.
        </span>
      ),
      sortAccessor: (t) => t.nbAbsences,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (t) =>
        t.actif ? (
          <Badge tone="emerald" shape="pill">
            Actif
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Inactif
          </Badge>
        ),
      sortAccessor: (t) => (t.actif ? 0 : 1),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setDialog({ ouvert: true, type: t })}
            title="Modifier"
            aria-label={`Modifier ${t.libelle}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer ce type ?"
            libelleConfirmer="Supprimer"
            messageSucces="Type d’absence supprimé"
            onConfirm={() => actions.supprimer(t.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={types}
        rowKey={(t) => t.id}
        searchPlaceholder="Rechercher un type d’absence…"
        emptyMessage="Aucun type d’absence. Créez les congés payés, RTT, arrêts…"
        rowClassName={(t) => (t.actif ? undefined : 'opacity-60')}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setDialog({ ouvert: true, type: null })}>
              <PlusIcon className="mr-1 size-4" /> Nouveau type
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <TypeAbsenceDialog
          open={dialog.ouvert}
          onOpenChange={(o) => setDialog((d) => ({ ...d, ouvert: o }))}
          type={dialog.type}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
