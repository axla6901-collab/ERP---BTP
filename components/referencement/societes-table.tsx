'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { Societe } from '@/db/schema/societes';

type Props = {
  items: Societe[];
  peutEcrire: boolean;
  rightActions?: React.ReactNode;
};

export function SocietesTable({ items, peutEcrire, rightActions }: Props) {
  const columns: DataTableColumn<Societe>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (s) => <span className="font-mono text-xs">{s.code}</span>,
      sortAccessor: (s) => s.code,
      searchAccessor: (s) => s.code,
    },
    {
      id: 'raisonSociale',
      header: 'Raison sociale',
      cell: (s) => s.raisonSociale,
      sortAccessor: (s) => s.raisonSociale,
      searchAccessor: (s) => s.raisonSociale,
    },
    {
      id: 'siret',
      header: 'SIRET',
      cell: (s) => <span className="font-mono text-xs">{s.siret ?? '—'}</span>,
      searchAccessor: (s) => s.siret ?? '',
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (s) => (
        <Badge tone={s.actif ? 'emerald' : 'neutral'} shape="pill">
          {s.actif ? 'Active' : 'Inactive'}
        </Badge>
      ),
      sortAccessor: (s) => (s.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (s) => (
        <Link
          href={`/administration/referentiel-tiers/societes/${s.id}`}
          className="text-sm underline underline-offset-4"
        >
          {peutEcrire ? 'Modifier' : 'Voir'}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(s) => s.id}
      rowHref={(s) => `/administration/referentiel-tiers/societes/${s.id}`}
      rowClassName={(s) => (s.actif ? undefined : 'opacity-60')}
      searchPlaceholder="Rechercher une société…"
      rightActions={rightActions}
      emptyMessage="Aucune société. Cliquez sur « Nouvelle » pour en créer une."
      defaultSort={{ id: 'code', dir: 'asc' }}
    />
  );
}
