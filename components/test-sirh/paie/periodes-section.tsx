'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateHeure, formatEuro, formatNombre } from '@/lib/test-sirh/format';
import { libellePeriode, type MoisPaie } from '@/lib/test-sirh/paie/periodes';
import type { StatutPeriodePaie } from '@/lib/validation/test-sirh/enums';
import type { PeriodePaieInput } from '@/lib/validation/test-sirh/paie';

import { NouvellePeriodeDialog } from './nouvelle-periode-dialog';
import { StatutPeriodeBadge } from './statut-periode-badge';

/** Ligne affichée (sérialisable, cf. `PeriodePaieVue`). */
export type PeriodeLigne = {
  id: string;
  annee: number;
  mois: number;
  statut: StatutPeriodePaie;
  dateCloture: string | null;
  clotureParEmail: string | null;
  notes: string | null;
  nbVariables: number;
  nbEmployes: number;
  montantTotal: number;
};

type Props = {
  periodes: PeriodeLigne[];
  /** Chemin de la rubrique (`/<slug>/test-sirh/paie`). */
  cheminPaie: string;
  /** Mois proposé à la création. */
  proposition: MoisPaie;
  actions: {
    creer: (input: PeriodePaieInput) => Promise<ActionResult<{ id: string }>>;
  };
};

/** Périodes de paie mensuelles (Factorial payroll/PolicyPeriod) : liste et création. */
export function PeriodesSection({ periodes, cheminPaie, proposition, actions }: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);

  const colonnes: DataTableColumn<PeriodeLigne>[] = [
    {
      id: 'periode',
      header: 'Période',
      cell: (p) => (
        <div className="min-w-0">
          <span className="font-medium">{libellePeriode(p)}</span>
          {p.notes && (
            <span className="block max-w-[320px] truncate text-xs text-muted-foreground">
              {p.notes}
            </span>
          )}
        </div>
      ),
      sortAccessor: (p) => p.annee * 100 + p.mois,
      searchAccessor: (p) => `${libellePeriode(p)} ${p.notes ?? ''}`,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (p) => (
        <div>
          <StatutPeriodeBadge statut={p.statut} />
          {p.statut === 'cloturee' && p.dateCloture && (
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {formatDateHeure(p.dateCloture)}
              {p.clotureParEmail ? ` · ${p.clotureParEmail}` : ''}
            </span>
          )}
        </div>
      ),
      sortAccessor: (p) => p.statut,
    },
    {
      id: 'employes',
      header: 'Collaborateurs',
      align: 'right',
      cell: (p) => <span className="tabular-nums">{formatNombre(p.nbEmployes)}</span>,
      sortAccessor: (p) => p.nbEmployes,
    },
    {
      id: 'variables',
      header: 'Variables',
      align: 'right',
      cell: (p) => <span className="tabular-nums">{formatNombre(p.nbVariables)}</span>,
      sortAccessor: (p) => p.nbVariables,
    },
    {
      id: 'montant',
      header: 'Montants saisis',
      align: 'right',
      cell: (p) => <span className="font-medium tabular-nums">{formatEuro(p.montantTotal)}</span>,
      sortAccessor: (p) => p.montantTotal,
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={periodes}
        rowKey={(p) => p.id}
        rowHref={(p) => `${cheminPaie}/${p.id}`}
        searchPlaceholder="Rechercher une période…"
        emptyMessage="Aucune période de paie. Créez celle du mois en cours pour préparer la paie."
        defaultSort={{ id: 'periode', dir: 'desc' }}
        rowClassName={(p) => (p.statut === 'cloturee' ? 'opacity-80' : undefined)}
        rightActions={
          <Button size="sm" onClick={() => setDialogOuvert(true)}>
            <PlusIcon className="mr-1 size-4" /> Nouvelle période
          </Button>
        }
      />
      <NouvellePeriodeDialog
        open={dialogOuvert}
        onOpenChange={setDialogOuvert}
        proposition={proposition}
        cheminPaie={cheminPaie}
        onSubmit={actions.creer}
      />
    </>
  );
}
