'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import type { FactureAvecClient } from '@/lib/facturation/factures';
import {
  LIBELLES_STATUT_FACTURE,
  type StatutFacture,
} from '@/lib/validation/facturation';

function formatMontant(m: string): string {
  const n = Number(m);
  if (Number.isNaN(n)) return m;
  return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Ton du badge de statut facture (aligné sur les maquettes). */
const TONE_STATUT: Record<StatutFacture, BadgeTone> = {
  brouillon: 'neutral',
  emise: 'sky',
  payee: 'emerald',
  en_retard: 'rose',
  annulee: 'slate',
};

/** Ordre des pills de filtre par statut. */
const STATUTS_FILTRE: StatutFacture[] = ['brouillon', 'emise', 'payee', 'en_retard'];

type Props = {
  items: FactureAvecClient[];
  rightActions?: React.ReactNode;
  peutEcrire: boolean;
};

export function FacturesTable({ items, rightActions, peutEcrire }: Props) {
  const [filtre, setFiltre] = useState<StatutFacture | 'all'>('all');

  const compteur = useMemo(() => {
    const c = new Map<StatutFacture, number>();
    for (const f of items) {
      const s = f.statut as StatutFacture;
      c.set(s, (c.get(s) ?? 0) + 1);
    }
    return c;
  }, [items]);

  const lignes = useMemo(
    () => (filtre === 'all' ? items : items.filter((f) => f.statut === filtre)),
    [items, filtre],
  );

  const pills: FilterPillItem[] = [
    {
      key: 'all',
      label: 'Toutes',
      count: items.length,
      active: filtre === 'all',
      onClick: () => setFiltre('all'),
    },
    ...STATUTS_FILTRE.map((s) => ({
      key: s,
      label: LIBELLES_STATUT_FACTURE[s],
      count: compteur.get(s) ?? 0,
      active: filtre === s,
      tone: s === 'en_retard' ? ('danger' as const) : ('default' as const),
      onClick: () => setFiltre(s),
    })),
  ];

  const columns: DataTableColumn<FactureAvecClient>[] = [
    {
      id: 'numero',
      header: 'Numéro',
      cell: (f) => <span className="font-mono text-xs">{f.numero}</span>,
      sortAccessor: (f) => f.numero,
      searchAccessor: (f) => f.numero,
    },
    {
      id: 'date',
      header: 'Date',
      cell: (f) => <span className="text-xs">{f.dateFacture}</span>,
      sortAccessor: (f) => f.dateFacture,
    },
    {
      id: 'echeance',
      header: 'Échéance',
      cell: (f) => <span className="text-xs">{f.dateEcheance ?? '—'}</span>,
      sortAccessor: (f) => f.dateEcheance,
    },
    {
      id: 'client',
      header: 'Client',
      cell: (f) => (
        <>
          <span className="text-xs text-muted-foreground">{f.clientCode}</span> {f.clientNom}
        </>
      ),
      sortAccessor: (f) => f.clientNom,
      searchAccessor: (f) => `${f.clientCode} ${f.clientNom}`,
    },
    {
      id: 'objet',
      header: 'Objet',
      cell: (f) => <span className="text-xs text-muted-foreground">{f.objet ?? '—'}</span>,
      searchAccessor: (f) => f.objet ?? '',
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (f) => (
        <Badge tone={TONE_STATUT[f.statut as StatutFacture]}>
          {LIBELLES_STATUT_FACTURE[f.statut as StatutFacture]}
        </Badge>
      ),
      sortAccessor: (f) => LIBELLES_STATUT_FACTURE[f.statut as StatutFacture],
      searchAccessor: (f) => LIBELLES_STATUT_FACTURE[f.statut as StatutFacture],
    },
    {
      id: 'total',
      header: 'Total TTC (€)',
      align: 'right',
      cell: (f) => <span className="tabular-nums">{formatMontant(f.totalTtc)}</span>,
      sortAccessor: (f) => Number(f.totalTtc),
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (f) => (
        <Link
          href={`/facturation/factures/${f.id}`}
          className="text-sm underline underline-offset-4"
        >
          {peutEcrire ? 'Ouvrir' : 'Voir'}
        </Link>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterPills items={pills} aria-label="Filtrer par statut" />
      <DataTable
        columns={columns}
        rows={lignes}
        rowKey={(f) => f.id}
        rowHref={(f) => `/facturation/factures/${f.id}`}
        searchPlaceholder="Rechercher une facture…"
        emptyMessage={
          peutEcrire
            ? 'Aucune facture. Crée la première via le bouton ci-dessus.'
            : 'Aucune facture.'
        }
        rightActions={rightActions}
        defaultSort={{ id: 'date', dir: 'desc' }}
      />
    </div>
  );
}
