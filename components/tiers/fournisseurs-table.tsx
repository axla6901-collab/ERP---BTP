'use client';

import Link from 'next/link';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { FournisseurAvecCompteurs } from '@/lib/tiers/fournisseurs';

type Props = {
  items: FournisseurAvecCompteurs[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
  /**
   * Action de changement de statut (closure `'use server'` fournie par la page).
   * Absente = pas de bouton de bascule (lecture seule).
   */
  onChangerStatut?:
    | ((id: string, actif: boolean) => Promise<{ ok: boolean; error?: string }>)
    | undefined;
};

export function FournisseursTable({ items, rightActions, peutEcrire, onChangerStatut }: Props) {
  const columns: DataTableColumn<FournisseurAvecCompteurs>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (f) => <span className="font-mono text-xs">{f.code}</span>,
      sortAccessor: (f) => f.code,
      searchAccessor: (f) => f.code,
    },
    {
      id: 'nom',
      header: 'Nom',
      cell: (f) => f.nom,
      sortAccessor: (f) => f.nom,
      searchAccessor: (f) => f.nom,
    },
    {
      id: 'ville',
      header: 'Ville',
      cell: (f) => (
        <span className="text-xs">
          {f.ville ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
      sortAccessor: (f) => f.ville,
      searchAccessor: (f) => f.ville ?? '',
    },
    {
      id: 'siret',
      header: 'SIRET',
      cell: (f) => <span className="font-mono text-xs">{f.siret ?? '—'}</span>,
      sortAccessor: (f) => f.siret,
      searchAccessor: (f) => f.siret ?? '',
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: (f) => (
        <span className="text-xs text-muted-foreground">
          {f.email ?? f.telephone ?? '—'}
        </span>
      ),
      sortAccessor: (f) => f.email ?? f.telephone,
      searchAccessor: (f) => `${f.email ?? ''} ${f.telephone ?? ''}`,
    },
    {
      id: 'contacts',
      header: 'Contacts',
      cell: (f) => (
        <span
          className="text-xs"
          title={`${f.contactsActifs} actif(s) sur ${f.contactsTotal}`}
        >
          {f.contactsTotal === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <span className="font-medium">{f.contactsActifs}</span>
              <span className="text-muted-foreground"> / {f.contactsTotal}</span>
            </>
          )}
        </span>
      ),
      sortAccessor: (f) => f.contactsActifs,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (f) => <StatutActifBadge actif={f.actif} />,
      sortAccessor: (f) => (f.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (f) => (
        <div className="flex items-center justify-end gap-2">
          {onChangerStatut && (
            <StatutToggleButton
              actif={f.actif}
              libelle="Fournisseur"
              action={(actif) => onChangerStatut(f.id, actif)}
            />
          )}
          <Link
            href={`/tiers/fournisseurs/${f.id}`}
            className="text-sm underline underline-offset-4"
          >
            {peutEcrire ? 'Modifier' : 'Voir'}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(f) => f.id}
      rowHref={(f) => `/tiers/fournisseurs/${f.id}`}
      searchPlaceholder="Rechercher un fournisseur…"
      emptyMessage={
        peutEcrire
          ? 'Aucun fournisseur. Crée le premier via le bouton ci-dessus.'
          : 'Aucun fournisseur.'
      }
      rightActions={rightActions}
      defaultSort={{ id: 'nom', dir: 'asc' }}
    />
  );
}
