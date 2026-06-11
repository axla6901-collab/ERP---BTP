'use client';

import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { NatureDocument } from '@/db/schema/referentiel-tiers';
import {
  LIBELLES_MODE_CONTROLE,
  type ModeControleDocument,
} from '@/lib/validation/referencement-tiers';

type Props = {
  items: NatureDocument[];
  peutEcrire: boolean;
  rightActions?: React.ReactNode;
};

function delaiLabel(n: NatureDocument): string {
  if (n.modeControle === 'duree_jours')
    return n.delaiValiditeJours != null ? `${n.delaiValiditeJours} j` : '—';
  if (n.modeControle === 'date_fin_assurance')
    return n.delaiValiditeJours != null ? `+${n.delaiValiditeJours} j` : 'Date de fin';
  return '—';
}

export function NaturesDocumentTable({ items, peutEcrire, rightActions }: Props) {
  const columns: DataTableColumn<NatureDocument>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (n) => <span className="font-mono text-xs">{n.code}</span>,
      sortAccessor: (n) => n.code,
      searchAccessor: (n) => n.code,
    },
    {
      id: 'libelle',
      header: 'Libellé',
      cell: (n) => n.libelle,
      sortAccessor: (n) => n.libelle,
      searchAccessor: (n) => n.libelle,
    },
    {
      id: 'mode',
      header: 'Mode de contrôle',
      cell: (n) => (
        <span className="text-xs text-muted-foreground">
          {LIBELLES_MODE_CONTROLE[n.modeControle as ModeControleDocument]}
        </span>
      ),
      sortAccessor: (n) => n.modeControle,
    },
    {
      id: 'validite',
      header: 'Validité',
      align: 'right',
      cell: (n) => <span className="text-xs">{delaiLabel(n)}</span>,
    },
    {
      id: 'relance',
      header: 'Relance',
      align: 'right',
      cell: (n) => (
        <span className="text-xs text-muted-foreground">
          {n.delaiRelanceJours != null ? `${n.delaiRelanceJours} j` : '—'}
        </span>
      ),
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (n) => (
        <Badge tone={n.actif ? 'emerald' : 'neutral'} shape="pill">
          {n.actif ? 'Actif' : 'Inactif'}
        </Badge>
      ),
      sortAccessor: (n) => (n.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (n) => (
        <Link
          href={`/administration/referentiel-tiers/natures-document/${n.id}`}
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
      rowKey={(n) => n.id}
      rowHref={(n) => `/administration/referentiel-tiers/natures-document/${n.id}`}
      rowClassName={(n) => (n.actif ? undefined : 'opacity-60')}
      searchPlaceholder="Rechercher une nature de document…"
      rightActions={rightActions}
      emptyMessage="Aucune nature de document. Cliquez sur « Nouveau » pour en créer une."
      defaultSort={{ id: 'code', dir: 'asc' }}
    />
  );
}
