'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { SituationAvecChantier } from '@/lib/facturation/situations';
import { LIBELLES_STATUT_SITUATION, type StatutSituation } from '@/lib/validation/facturation';

function formatMontant(m: string): string {
  const n = Number(m);
  if (Number.isNaN(n)) return m;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function classesPill(statut: StatutSituation): string {
  switch (statut) {
    case 'brouillon':
      return 'bg-muted text-muted-foreground';
    case 'validee':
      return 'bg-amber-100 text-amber-900';
    case 'facturee':
      return 'bg-emerald-100 text-emerald-900';
    case 'annulee':
      return 'bg-slate-200 text-slate-700';
  }
}

type Props = {
  items: SituationAvecChantier[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
};

export function SituationsTable({ items, rightActions, peutEcrire }: Props) {
  const columns: DataTableColumn<SituationAvecChantier>[] = [
    {
      id: 'numero',
      header: 'N°',
      cell: (s) => <span className="font-mono text-xs">#{s.numero}</span>,
      sortAccessor: (s) => s.numero,
    },
    {
      id: 'chantier',
      header: 'Chantier',
      cell: (s) => (
        <>
          <span className="text-xs text-muted-foreground">{s.chantierNumero}</span>{' '}
          {s.chantierLibelle}
        </>
      ),
      sortAccessor: (s) => s.chantierLibelle,
      searchAccessor: (s) => `${s.chantierNumero} ${s.chantierLibelle}`,
    },
    {
      id: 'date',
      header: 'Date',
      cell: (s) => <span className="text-xs">{s.dateSituation}</span>,
      sortAccessor: (s) => s.dateSituation,
    },
    {
      id: 'pct',
      header: '% cumulé',
      align: 'right',
      cell: (s) => (
        <span className="tabular-nums">
          {Number(s.pctAvancementCumule)
            .toFixed(2)
            .replace(/\.?0+$/, '')}{' '}
          %
        </span>
      ),
      sortAccessor: (s) => Number(s.pctAvancementCumule),
    },
    {
      id: 'cumule',
      header: 'Cumulé HT (€)',
      align: 'right',
      cell: (s) => <span className="text-xs tabular-nums">{formatMontant(s.montantCumuleHt)}</span>,
      sortAccessor: (s) => Number(s.montantCumuleHt),
    },
    {
      id: 'a-facturer',
      header: 'À facturer HT (€)',
      align: 'right',
      cell: (s) => (
        <span className="font-medium tabular-nums">{formatMontant(s.montantAFacturerHt)}</span>
      ),
      sortAccessor: (s) => Number(s.montantAFacturerHt),
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (s) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${classesPill(s.statut as StatutSituation)}`}
        >
          {LIBELLES_STATUT_SITUATION[s.statut as StatutSituation]}
        </span>
      ),
      sortAccessor: (s) => LIBELLES_STATUT_SITUATION[s.statut as StatutSituation],
      searchAccessor: (s) => LIBELLES_STATUT_SITUATION[s.statut as StatutSituation],
    },
    {
      id: 'facture',
      header: 'Facture',
      cell: (s) =>
        s.factureNumero ? (
          <Link
            href={`/facturation/factures/${s.factureId}`}
            className="font-mono text-xs underline underline-offset-4"
          >
            {s.factureNumero}
          </Link>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      searchAccessor: (s) => s.factureNumero ?? '',
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (s) => (
        <Link
          href={`/facturation/situations/${s.id}`}
          className="text-sm underline underline-offset-4"
        >
          {peutEcrire ? 'Ouvrir' : 'Voir'}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(s) => s.id}
      rowHref={(s) => `/facturation/situations/${s.id}`}
      searchPlaceholder="Rechercher une situation…"
      emptyMessage={
        peutEcrire
          ? 'Aucune situation. Crée la première via le bouton ci-dessus.'
          : 'Aucune situation.'
      }
      rightActions={rightActions}
      defaultSort={{ id: 'date', dir: 'desc' }}
    />
  );
}
