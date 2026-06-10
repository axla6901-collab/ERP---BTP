'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { FamilleAvecParent } from '@/lib/catalogue/familles';

type Props = {
  items: FamilleAvecParent[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
};

export function FamillesTable({ items, rightActions, peutEcrire }: Props) {
  const columns: DataTableColumn<FamilleAvecParent>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (f) => <span className="font-mono text-xs">{f.code}</span>,
      sortAccessor: (f) => f.code,
      searchAccessor: (f) => f.code,
    },
    {
      id: 'libelle',
      header: 'Libellé',
      cell: (f) => f.libelle,
      sortAccessor: (f) => f.libelle,
      searchAccessor: (f) => f.libelle,
    },
    {
      id: 'parent',
      header: 'Parent',
      cell: (f) => (
        <span className="text-xs text-muted-foreground">
          {f.parentCode ? `${f.parentCode} — ${f.parentLibelle}` : '— (racine)'}
        </span>
      ),
      sortAccessor: (f) => f.parentCode,
      searchAccessor: (f) => `${f.parentCode ?? ''} ${f.parentLibelle ?? ''}`,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (f) => (
        <Badge tone={f.actif ? 'emerald' : 'neutral'} shape="pill">
          {f.actif ? 'Actif' : 'Inactif'}
        </Badge>
      ),
      sortAccessor: (f) => (f.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (f) => (
        <Link href={`/catalogue/familles/${f.id}`} className="text-sm underline underline-offset-4">
          {peutEcrire ? 'Modifier' : 'Voir'}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(f) => f.id}
      rowHref={(f) => `/catalogue/familles/${f.id}`}
      rowClassName={(f) => (f.actif ? undefined : 'opacity-60')}
      searchPlaceholder="Rechercher une famille…"
      emptyMessage={
        peutEcrire
          ? 'Aucune famille. Crée la première via le bouton ci-dessus.'
          : 'Aucune famille.'
      }
      rightActions={rightActions}
      defaultSort={{ id: 'code', dir: 'asc' }}
    />
  );
}
