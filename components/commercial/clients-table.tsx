'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { Client } from '@/db/schema/commercial';

function libelleClient(c: Client): string {
  if (c.type === 'professionnel') return c.raisonSociale ?? '';
  return [c.prenom, c.nom].filter(Boolean).join(' ');
}

type Props = {
  items: Client[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
};

export function ClientsTable({ items, rightActions, peutEcrire }: Props) {
  const columns: DataTableColumn<Client>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (c) => <span className="font-mono text-xs">{c.code}</span>,
      sortAccessor: (c) => c.code,
      searchAccessor: (c) => c.code,
    },
    {
      id: 'nom',
      header: 'Nom / Raison sociale',
      cell: (c) => libelleClient(c),
      sortAccessor: (c) => libelleClient(c),
      searchAccessor: (c) => libelleClient(c),
    },
    {
      id: 'type',
      header: 'Type',
      cell: (c) => (
        <span className="text-xs text-muted-foreground">
          {c.type === 'professionnel' ? 'Pro' : 'Particulier'}
        </span>
      ),
      sortAccessor: (c) => c.type,
      searchAccessor: (c) => (c.type === 'professionnel' ? 'Pro professionnel' : 'Particulier'),
    },
    {
      id: 'ville',
      header: 'Ville',
      cell: (c) => (
        <span className="text-xs">
          {c.codePostal} {c.ville}
        </span>
      ),
      sortAccessor: (c) => c.ville,
      searchAccessor: (c) => `${c.codePostal ?? ''} ${c.ville ?? ''}`,
    },
    {
      id: 'email',
      header: 'Email',
      cell: (c) => <span className="text-xs text-muted-foreground">{c.email ?? '—'}</span>,
      sortAccessor: (c) => c.email,
      searchAccessor: (c) => c.email ?? '',
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (c) => (
        <Link href={`/commercial/clients/${c.id}`} className="text-sm underline underline-offset-4">
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
      rowHref={(c) => `/commercial/clients/${c.id}`}
      searchPlaceholder="Rechercher un client…"
      emptyMessage={
        peutEcrire ? 'Aucun client. Crée le premier via le bouton ci-dessus.' : 'Aucun client.'
      }
      rightActions={rightActions}
      defaultSort={{ id: 'code', dir: 'asc' }}
    />
  );
}
