'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { Unite } from '@/db/schema/catalogue';

const LIBELLES_TYPE: Record<string, string> = {
  masse: 'Masse',
  longueur: 'Longueur',
  surface: 'Surface',
  volume: 'Volume',
  unitaire: 'Unitaire',
  temps: 'Temps',
  autre: 'Autre',
};

type Props = {
  items: Unite[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
};

export function UnitesTable({ items, rightActions, peutEcrire }: Props) {
  const columns: DataTableColumn<Unite>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (u) => <span className="font-mono text-xs">{u.code}</span>,
      sortAccessor: (u) => u.code,
      searchAccessor: (u) => u.code,
    },
    {
      id: 'libelle',
      header: 'Libellé',
      cell: (u) => u.libelle,
      sortAccessor: (u) => u.libelle,
      searchAccessor: (u) => u.libelle,
    },
    {
      id: 'symbole',
      header: 'Symbole',
      cell: (u) => <span className="font-mono text-xs">{u.symbole}</span>,
      sortAccessor: (u) => u.symbole,
      searchAccessor: (u) => u.symbole,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (u) => (
        <span className="text-xs text-muted-foreground">{LIBELLES_TYPE[u.type] ?? u.type}</span>
      ),
      sortAccessor: (u) => LIBELLES_TYPE[u.type] ?? u.type,
      searchAccessor: (u) => LIBELLES_TYPE[u.type] ?? u.type,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (u) => (
        <Badge tone={u.actif ? 'emerald' : 'neutral'} shape="pill">
          {u.actif ? 'Actif' : 'Inactif'}
        </Badge>
      ),
      sortAccessor: (u) => (u.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (u) => (
        <Link
          href={`/administration/unites/${u.id}`}
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
      rowKey={(u) => u.id}
      rowHref={(u) => `/administration/unites/${u.id}`}
      rowClassName={(u) => (u.actif ? undefined : 'opacity-60')}
      searchPlaceholder="Rechercher une unité…"
      rightActions={rightActions}
      defaultSort={{ id: 'code', dir: 'asc' }}
    />
  );
}
