'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import type { PeriodeBloqueeLigne } from '@/lib/test-sirh/absences/types';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { PeriodeBloqueeInput } from '@/lib/validation/test-sirh/absences';

import { TypeAbsenceLibelle } from './elements';
import { PeriodeBloqueeDialog } from './periode-bloquee-dialog';

type Props = {
  periodes: PeriodeBloqueeLigne[];
  types: readonly OptionListe[];
  equipes: readonly OptionListe[];
  today: string;
  peutGerer: boolean;
  actions: {
    enregistrer: (input: PeriodeBloqueeInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Périodes bloquées (Factorial BlockedPeriod) : liste, création / édition, suppression. */
export function PeriodesBloqueesSection({
  periodes,
  types,
  equipes,
  today,
  peutGerer,
  actions,
}: Props) {
  const [dialog, setDialog] = useState<{ ouvert: boolean; periode: PeriodeBloqueeLigne | null }>({
    ouvert: false,
    periode: null,
  });

  const colonnes: DataTableColumn<PeriodeBloqueeLigne>[] = [
    {
      id: 'libelle',
      header: 'Période',
      cell: (p) => (
        <div className="min-w-0">
          <span className="font-medium">{p.libelle}</span>
          {p.dateFin < today && (
            <Badge tone="neutral" className="ml-2">
              Passée
            </Badge>
          )}
        </div>
      ),
      sortAccessor: (p) => p.libelle,
      searchAccessor: (p) => `${p.libelle} ${p.motif ?? ''}`,
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: (p) => (
        <span className="whitespace-nowrap text-sm">
          du {formatDateFr(p.dateDebut)} au {formatDateFr(p.dateFin)}
        </span>
      ),
      sortAccessor: (p) => p.dateDebut,
    },
    {
      id: 'type',
      header: 'Type visé',
      cell: (p) =>
        p.typeLibelle ? (
          <TypeAbsenceLibelle libelle={p.typeLibelle} couleur={p.typeCouleur ?? '#94a3b8'} />
        ) : (
          <span className="text-muted-foreground">Tous (soumis à validation)</span>
        ),
      sortAccessor: (p) => p.typeLibelle,
    },
    {
      id: 'equipe',
      header: 'Équipe',
      cell: (p) => p.equipe ?? <span className="text-muted-foreground">Toutes</span>,
      sortAccessor: (p) => p.equipe,
      searchAccessor: (p) => p.equipe,
    },
    {
      id: 'motif',
      header: 'Motif',
      cell: (p) =>
        p.motif ? (
          <span className="block max-w-64 truncate text-xs" title={p.motif}>
            {p.motif}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setDialog({ ouvert: true, periode: p })}
            title="Modifier"
            aria-label={`Modifier ${p.libelle}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer cette période ?"
            libelleConfirmer="Supprimer"
            messageSucces="Période bloquée supprimée"
            onConfirm={() => actions.supprimer(p.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={periodes}
        rowKey={(p) => p.id}
        searchPlaceholder="Rechercher une période…"
        emptyMessage="Aucune période bloquée (fermeture, rush chantier, inventaire…)."
        rowClassName={(p) => (p.dateFin < today ? 'opacity-60' : undefined)}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setDialog({ ouvert: true, periode: null })}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle période
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <PeriodeBloqueeDialog
          open={dialog.ouvert}
          onOpenChange={(o) => setDialog((d) => ({ ...d, ouvert: o }))}
          periode={dialog.periode}
          types={types}
          equipes={equipes}
          today={today}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
