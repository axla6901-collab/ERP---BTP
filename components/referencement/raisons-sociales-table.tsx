'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { RaisonSociale } from '@/db/schema/raisons-sociales';

type Props = {
  items: RaisonSociale[];
  peutEcrire: boolean;
};

export function RaisonsSocialesTable({ items, peutEcrire }: Props) {
  const columns: DataTableColumn<RaisonSociale>[] = [
    {
      id: 'raisonSociale',
      header: 'Raison sociale',
      cell: (r) => r.raisonSociale,
      sortAccessor: (r) => r.raisonSociale,
      searchAccessor: (r) => r.raisonSociale,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (r) => (
        <Badge tone={r.actif ? 'emerald' : 'neutral'} shape="pill">
          {r.actif ? 'Active' : 'Inactive'}
        </Badge>
      ),
      sortAccessor: (r) => (r.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (r) => (
        <Link
          href={`/administration/raisons-sociales/${r.id}`}
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
      rowKey={(r) => r.id}
      rowHref={(r) => `/administration/raisons-sociales/${r.id}`}
      rowClassName={(r) => (r.actif ? undefined : 'opacity-60')}
      searchPlaceholder="Rechercher une raison sociale…"
      defaultSort={{ id: 'raisonSociale', dir: 'asc' }}
    />
  );
}
