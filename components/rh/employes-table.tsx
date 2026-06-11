'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { LIBELLES_TYPE_CONTRAT, type TypeContrat } from '@/lib/validation/rh';

// Type local pour éviter une dépendance directe au schéma RH (qui n'expose pas
// d'export type idiomatique). Reflète les champs utilisés dans le tableau.
export type EmployeRow = {
  id: string;
  nom: string;
  prenom: string;
  qualification: string | null;
  typeContrat: string;
  societeInterim: string | null;
  heuresHebdoContractuelles: number | string;
  actif: boolean;
};

type Props = {
  items: EmployeRow[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
};

export function EmployesTable({ items, rightActions, peutEcrire }: Props) {
  const columns: DataTableColumn<EmployeRow>[] = [
    {
      id: 'nom',
      header: 'Nom',
      cell: (e) => (
        <span className="font-medium">
          {e.nom} {e.prenom}
        </span>
      ),
      sortAccessor: (e) => `${e.nom} ${e.prenom}`,
      searchAccessor: (e) => `${e.nom} ${e.prenom}`,
    },
    {
      id: 'qualification',
      header: 'Qualification',
      cell: (e) => <span className="text-xs text-muted-foreground">{e.qualification ?? '—'}</span>,
      sortAccessor: (e) => e.qualification,
      searchAccessor: (e) => e.qualification ?? '',
    },
    {
      id: 'contrat',
      header: 'Contrat',
      cell: (e) => (
        <span className="text-xs">{LIBELLES_TYPE_CONTRAT[e.typeContrat as TypeContrat]}</span>
      ),
      sortAccessor: (e) => LIBELLES_TYPE_CONTRAT[e.typeContrat as TypeContrat],
      searchAccessor: (e) => LIBELLES_TYPE_CONTRAT[e.typeContrat as TypeContrat],
    },
    {
      id: 'societe',
      header: 'Société intérim',
      cell: (e) => <span className="text-xs text-muted-foreground">{e.societeInterim ?? '—'}</span>,
      sortAccessor: (e) => e.societeInterim,
      searchAccessor: (e) => e.societeInterim ?? '',
    },
    {
      id: 'heures',
      header: 'Heures/sem.',
      align: 'right',
      cell: (e) => <span className="text-xs tabular-nums">{e.heuresHebdoContractuelles}</span>,
      sortAccessor: (e) => Number(e.heuresHebdoContractuelles),
    },
    {
      id: 'etat',
      header: 'État',
      cell: (e) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${
            e.actif ? 'bg-emerald-100 text-emerald-900' : 'bg-muted text-muted-foreground'
          }`}
        >
          {e.actif ? 'Actif' : 'Inactif'}
        </span>
      ),
      sortAccessor: (e) => (e.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (e) => (
        <Link href={`/rh/employes/${e.id}`} className="text-sm underline underline-offset-4">
          {peutEcrire ? 'Modifier' : 'Voir'}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(e) => e.id}
      rowHref={(e) => `/rh/employes/${e.id}`}
      searchPlaceholder="Rechercher un employé…"
      emptyMessage={
        peutEcrire ? 'Aucun employé. Crée le premier via le bouton ci-dessus.' : 'Aucun employé.'
      }
      rightActions={rightActions}
      defaultSort={{ id: 'nom', dir: 'asc' }}
    />
  );
}
