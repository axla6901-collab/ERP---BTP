'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { EntrepriseListItem } from '@/lib/admin/entreprises-super';

type Props = {
  items: EntrepriseListItem[];
  /** Map id entreprise → URL signée du logo principal. Absent si l'entreprise n'a pas de logo. */
  logoUrls: Record<string, string>;
  rightActions?: React.ReactNode;
};

function adresseCompacte(e: EntrepriseListItem): string {
  const cpVille = [e.codePostal, e.ville].filter(Boolean).join(' ');
  const parts = [e.adresseLigne1, cpVille].filter((s) => s && s.trim().length > 0);
  return parts.join(' · ');
}

export function EntreprisesTable({ items, logoUrls, rightActions }: Props) {
  const columns: DataTableColumn<EntrepriseListItem>[] = [
    {
      id: 'logo',
      header: '',
      headerClassName: 'w-12',
      className: 'w-12',
      cell: (e) => {
        const url = logoUrls[e.id];
        if (url) {
          return (
            // eslint-disable-next-line @next/next/no-img-element -- logo uploadé (S3, taille fixe 36px) : next/image non utilisé dans ce projet
            <img
              src={url}
              alt={`Logo ${e.raisonSociale}`}
              className="size-9 rounded border bg-white object-contain p-0.5"
            />
          );
        }
        return (
          <div className="flex size-9 items-center justify-center rounded border bg-muted/40 text-[10px] font-semibold text-muted-foreground">
            {e.raisonSociale.slice(0, 2).toUpperCase()}
          </div>
        );
      },
    },
    {
      id: 'raisonSociale',
      header: 'Raison sociale',
      cell: (e) => (
        <div className="flex flex-col">
          <span className="font-medium">{e.raisonSociale}</span>
          <span className="font-mono text-xs text-muted-foreground">{e.slug}</span>
        </div>
      ),
      sortAccessor: (e) => e.raisonSociale,
      searchAccessor: (e) => `${e.raisonSociale} ${e.slug}`,
    },
    {
      id: 'siret',
      header: 'SIRET',
      cell: (e) => (
        <span className="font-mono text-xs text-muted-foreground">{e.siret ?? '—'}</span>
      ),
      sortAccessor: (e) => e.siret,
      searchAccessor: (e) => e.siret ?? '',
    },
    {
      id: 'adresse',
      header: 'Adresse',
      cell: (e) => {
        const txt = adresseCompacte(e);
        return txt ? (
          <span className="text-xs">{txt}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        );
      },
      sortAccessor: (e) => adresseCompacte(e) || null,
      searchAccessor: (e) => adresseCompacte(e),
    },
    {
      id: 'membres',
      header: 'Membres',
      align: 'right',
      cell: (e) => <span className="tabular-nums">{e.membresCount}</span>,
      sortAccessor: (e) => e.membresCount,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (e) =>
        e.actif ? (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">
            Actif
          </span>
        ) : (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
            Désactivé
          </span>
        ),
      sortAccessor: (e) => (e.actif ? 1 : 0),
      searchAccessor: (e) => (e.actif ? 'actif' : 'désactivé'),
    },
    {
      id: 'createdAt',
      header: 'Créée le',
      cell: (e) => (
        <span className="text-xs text-muted-foreground">
          {new Date(e.createdAt).toLocaleDateString('fr-FR')}
        </span>
      ),
      sortAccessor: (e) => new Date(e.createdAt).getTime(),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (e) => (
        <Link
          href={`/admin/entreprises/${e.id}`}
          className="text-sm underline underline-offset-4"
        >
          Ouvrir
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(e) => e.id}
      rowHref={(e) => `/admin/entreprises/${e.id}`}
      searchPlaceholder="Rechercher une entreprise…"
      emptyMessage="Aucune entreprise. Cliquez sur « Nouvelle entreprise » pour en créer une."
      rightActions={rightActions}
      defaultSort={{ id: 'raisonSociale', dir: 'asc' }}
    />
  );
}
