'use client';

import Link from 'next/link';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ChantierAvecRelations } from '@/lib/chantiers/chantiers';
import { LIBELLES_STATUT_CHANTIER, type StatutChantier } from '@/lib/validation/chantiers';

function formatMontant(m: string | null): string {
  if (!m) return '—';
  const n = Number(m);
  if (Number.isNaN(n)) return m;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function classesPill(statut: StatutChantier): string {
  switch (statut) {
    case 'prospect':
      return 'bg-muted text-muted-foreground';
    case 'en_cours':
      return 'bg-emerald-100 text-emerald-900';
    case 'suspendu':
      return 'bg-amber-100 text-amber-900';
    case 'termine':
      return 'bg-slate-200 text-slate-700';
    case 'annule':
      return 'bg-rose-100 text-rose-900';
  }
}

type Props = {
  items: ChantierAvecRelations[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
  /** Préfixe slug tenant — utilisé pour construire les hrefs `/[slug]/chantiers/...`. */
  entrepriseSlug: string;
};

export function ChantiersTable({ items, rightActions, peutEcrire, entrepriseSlug }: Props) {
  const columns: DataTableColumn<ChantierAvecRelations>[] = [
    {
      id: 'numero',
      header: 'Numéro',
      cell: (c) => <span className="font-mono text-xs">{c.numero}</span>,
      sortAccessor: (c) => c.numero,
      searchAccessor: (c) => c.numero,
    },
    {
      id: 'libelle',
      header: 'Libellé',
      cell: (c) => c.libelle,
      sortAccessor: (c) => c.libelle,
      searchAccessor: (c) => c.libelle,
    },
    {
      id: 'client',
      header: 'Client',
      cell: (c) => (
        <>
          <span className="text-xs text-muted-foreground">{c.clientCode}</span> {c.clientNom}
        </>
      ),
      sortAccessor: (c) => c.clientNom,
      searchAccessor: (c) => `${c.clientCode} ${c.clientNom}`,
    },
    {
      id: 'responsable',
      header: 'Responsable',
      cell: (c) => (
        <span className="text-xs text-muted-foreground">{c.responsableEmail ?? 'Non assigné'}</span>
      ),
      sortAccessor: (c) => c.responsableEmail,
      searchAccessor: (c) => c.responsableEmail ?? '',
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (c) => (
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${classesPill(c.statut as StatutChantier)}`}
        >
          {LIBELLES_STATUT_CHANTIER[c.statut as StatutChantier]}
        </span>
      ),
      sortAccessor: (c) => LIBELLES_STATUT_CHANTIER[c.statut as StatutChantier],
      searchAccessor: (c) => LIBELLES_STATUT_CHANTIER[c.statut as StatutChantier],
    },
    {
      id: 'montant',
      header: 'Montant prév. HT (€)',
      align: 'right',
      cell: (c) => <span className="tabular-nums">{formatMontant(c.montantPrevisionnelHt)}</span>,
      sortAccessor: (c) => (c.montantPrevisionnelHt ? Number(c.montantPrevisionnelHt) : null),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (c) => (
        <Link
          href={`/${entrepriseSlug}/chantiers/${c.id}`}
          className="text-sm underline underline-offset-4"
        >
          {peutEcrire ? 'Ouvrir' : 'Voir'}
        </Link>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={items}
      rowKey={(c) => c.id}
      rowHref={(c) => `/${entrepriseSlug}/chantiers/${c.id}`}
      searchPlaceholder="Rechercher un chantier…"
      emptyMessage={
        peutEcrire
          ? 'Aucun chantier. Crée le premier via le bouton ci-dessus ou depuis un devis accepté.'
          : 'Aucun chantier.'
      }
      rightActions={rightActions}
      defaultSort={{ id: 'numero', dir: 'desc' }}
    />
  );
}
