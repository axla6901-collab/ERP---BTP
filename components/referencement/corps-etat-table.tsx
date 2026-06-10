'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { CorpsEtat } from '@/db/schema/referentiel-tiers';

type Props = {
  items: CorpsEtat[];
  peutEcrire: boolean;
  rightActions?: React.ReactNode;
};

export function CorpsEtatTable({ items, peutEcrire, rightActions }: Props) {
  const columns: DataTableColumn<CorpsEtat>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (c) => <span className="font-mono text-xs">{c.code}</span>,
      sortAccessor: (c) => c.code,
      searchAccessor: (c) => c.code,
    },
    {
      id: 'libelle',
      header: 'Libellé',
      cell: (c) => c.libelle,
      sortAccessor: (c) => c.libelle,
      searchAccessor: (c) => c.libelle,
    },
    {
      id: 'ordre',
      header: 'Ordre',
      align: 'right',
      cell: (c) => <span className="text-xs text-muted-foreground">{c.ordreAffichage}</span>,
      sortAccessor: (c) => c.ordreAffichage,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (c) => (
        <Badge tone={c.actif ? 'emerald' : 'neutral'} shape="pill">
          {c.actif ? 'Actif' : 'Inactif'}
        </Badge>
      ),
      sortAccessor: (c) => (c.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (c) => (
        <Link
          href={`/administration/referentiel-tiers/corps-etat/${c.id}`}
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
      rowKey={(c) => c.id}
      rowHref={(c) => `/administration/referentiel-tiers/corps-etat/${c.id}`}
      rowClassName={(c) => (c.actif ? undefined : 'opacity-60')}
      searchPlaceholder="Rechercher un corps d’état…"
      rightActions={rightActions}
      emptyMessage="Aucun corps d’état. Cliquez sur « Nouveau » pour en créer un."
      defaultSort={{ id: 'ordre', dir: 'asc' }}
    />
  );
}
