'use client';

import Link from 'next/link';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import {
  LIBELLE_SOURCE_CONTACT,
  type ContactUnifie,
  type SourceContact,
} from '@/lib/tiers/contacts-annuaire';
import { cn } from '@/lib/utils';

type Props = {
  items: ContactUnifie[];
  /** Bouton « Nouveau contact » à droite de la barre de recherche (modale). */
  rightActions?: React.ReactNode;
  /**
   * Action de changement de statut d'un contact (closure `'use server'` fournie
   * par la page). Absente = annuaire en lecture seule. Les lignes « client » ne
   * sont pas concernées (statut géré dans le module commercial).
   */
  onChangerStatut?:
    | ((
        source: 'fournisseur' | 'sous_traitant',
        contactId: string,
        actif: boolean,
      ) => Promise<{ ok: boolean; error?: string }>)
    | undefined;
};

/** Extrait l'id du contact depuis sa clé `${source}:${id}`. */
function idDepuisCle(cle: string): string {
  return cle.slice(cle.indexOf(':') + 1);
}

const COULEUR_SOURCE: Record<SourceContact, string> = {
  fournisseur: 'bg-blue-100 text-blue-800',
  sous_traitant: 'bg-amber-100 text-amber-800',
  client: 'bg-emerald-100 text-emerald-800',
};

function nomComplet(c: ContactUnifie): string {
  return [c.nom, c.prenom].filter(Boolean).join(' ').trim();
}

export function ContactsTable({ items, rightActions, onChangerStatut }: Props) {
  const columns: DataTableColumn<ContactUnifie>[] = [
    {
      id: 'nom',
      header: 'Contact',
      cell: (c) => (
        <span className="flex items-center gap-2">
          {nomComplet(c)}
          {c.principal && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase text-muted-foreground">
              Principal
            </span>
          )}
        </span>
      ),
      sortAccessor: (c) => nomComplet(c),
      searchAccessor: (c) => nomComplet(c),
    },
    {
      id: 'fonction',
      header: 'Fonction',
      cell: (c) => (
        <span className="text-xs">
          {c.fonction ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
      sortAccessor: (c) => c.fonction,
      searchAccessor: (c) => c.fonction ?? '',
    },
    {
      id: 'source',
      header: 'Type',
      cell: (c) => (
        <span
          className={cn(
            'inline-block rounded px-1.5 py-0.5 text-[11px] font-medium',
            COULEUR_SOURCE[c.source],
          )}
        >
          {LIBELLE_SOURCE_CONTACT[c.source]}
        </span>
      ),
      sortAccessor: (c) => LIBELLE_SOURCE_CONTACT[c.source],
      searchAccessor: (c) => LIBELLE_SOURCE_CONTACT[c.source],
    },
    {
      id: 'tiers',
      header: 'Tiers',
      cell: (c) => (
        <Link
          href={c.tiersHref}
          className="text-sm underline underline-offset-4 hover:text-foreground"
        >
          {c.tiersNom}
        </Link>
      ),
      sortAccessor: (c) => c.tiersNom,
      searchAccessor: (c) => c.tiersNom,
    },
    {
      id: 'email',
      header: 'Email',
      cell: (c) =>
        c.email ? (
          <a
            href={`mailto:${c.email}`}
            className="text-xs underline underline-offset-4 hover:text-foreground"
          >
            {c.email}
          </a>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        ),
      sortAccessor: (c) => c.email,
      searchAccessor: (c) => c.email ?? '',
    },
    {
      id: 'telephone',
      header: 'Téléphone',
      cell: (c) => (
        <span className="text-xs">
          {c.telephone ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
      sortAccessor: (c) => c.telephone,
      searchAccessor: (c) => c.telephone ?? '',
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (c) => <StatutActifBadge actif={c.actif} />,
      sortAccessor: (c) => (c.actif ? 0 : 1),
    },
  ];

  if (onChangerStatut) {
    columns.push({
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (c) => {
        if (c.source === 'client') {
          // Statut d'un client : géré dans le module commercial, pas ici.
          return <span className="text-xs text-muted-foreground">—</span>;
        }
        const source = c.source; // narrowing → 'fournisseur' | 'sous_traitant'
        const contactId = idDepuisCle(c.cle);
        return (
          <StatutToggleButton
            actif={c.actif}
            libelle="Contact"
            action={(actif) => onChangerStatut(source, contactId, actif)}
          />
        );
      },
    });
  }

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(c) => c.cle}
      rowHref={(c) => c.tiersHref}
      searchPlaceholder="Rechercher un contact, un tiers, un email…"
      emptyMessage="Aucun contact. Ajoute des contacts depuis les fiches fournisseurs, sous-traitants ou clients."
      rightActions={rightActions}
      defaultSort={{ id: 'nom', dir: 'asc' }}
    />
  );
}
