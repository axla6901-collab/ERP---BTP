'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import { StatutActifBadge } from '@/components/tiers/statut-actif-badge';
import { StatutSousTraitantBadge } from '@/components/tiers/statut-sous-traitant-badge';
import { StatutToggleButton } from '@/components/tiers/statut-toggle-button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import type { SousTraitantAvecCompteurs } from '@/lib/tiers/sous-traitants';
import {
  STATUT_SOUS_TRAITANT_LABELS,
  STATUT_SOUS_TRAITANT_VALUES,
  type StatutSousTraitant,
} from '@/lib/validation/tiers';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('fr-FR');
}

function expireSous30Jours(iso: string | null): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const dans30 = new Date();
  dans30.setDate(dans30.getDate() + 30);
  return d <= dans30;
}

type Props = {
  items: SousTraitantAvecCompteurs[];
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

type FiltreStatut = StatutSousTraitant | 'tous';

export function SousTraitantsTable({ items, rightActions, peutEcrire, onChangerStatut }: Props) {
  const [filtre, setFiltre] = useState<FiltreStatut>('tous');

  // Compteurs par statut (sur la totalité, indépendamment du filtre courant).
  const compteurs = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const s of items) acc[s.statut] = (acc[s.statut] ?? 0) + 1;
    return acc;
  }, [items]);

  const itemsFiltres = useMemo(
    () => (filtre === 'tous' ? items : items.filter((s) => s.statut === filtre)),
    [items, filtre],
  );

  const pills: FilterPillItem[] = [
    {
      key: 'tous',
      label: 'Tous',
      count: items.length,
      active: filtre === 'tous',
      onClick: () => setFiltre('tous'),
    },
    ...STATUT_SOUS_TRAITANT_VALUES.map((v) => ({
      key: v,
      label: STATUT_SOUS_TRAITANT_LABELS[v],
      count: compteurs[v] ?? 0,
      active: filtre === v,
      onClick: () => setFiltre(v),
    })),
  ];

  const columns: DataTableColumn<SousTraitantAvecCompteurs>[] = [
    {
      id: 'code',
      header: 'Code',
      cell: (s) => <span className="font-mono text-xs">{s.code}</span>,
      sortAccessor: (s) => s.code,
      searchAccessor: (s) => s.code,
    },
    {
      id: 'nom',
      header: 'Raison sociale',
      cell: (s) => s.nom,
      sortAccessor: (s) => s.nom,
      searchAccessor: (s) => s.nom,
    },
    {
      id: 'ville',
      header: 'Ville',
      cell: (s) => (
        <span className="text-xs">
          {s.ville ?? <span className="text-muted-foreground">—</span>}
        </span>
      ),
      sortAccessor: (s) => s.ville,
      searchAccessor: (s) => s.ville ?? '',
    },
    {
      id: 'siret',
      header: 'SIRET',
      cell: (s) => <span className="font-mono text-xs">{s.siret ?? '—'}</span>,
      sortAccessor: (s) => s.siret,
      searchAccessor: (s) => s.siret ?? '',
    },
    {
      id: 'contacts',
      header: 'Contacts',
      cell: (s) => (
        <span className="text-xs" title={`${s.contactsActifs} actif(s) sur ${s.contactsTotal}`}>
          {s.contactsTotal === 0 ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <>
              <span className="font-medium">{s.contactsActifs}</span>
              <span className="text-muted-foreground"> / {s.contactsTotal}</span>
            </>
          )}
        </span>
      ),
      sortAccessor: (s) => s.contactsActifs,
    },
    {
      id: 'decennale',
      header: 'Décennale',
      cell: (s) => {
        const alerte = expireSous30Jours(s.assuranceDecennaleDateFin);
        return (
          <span className={alerte ? 'text-xs text-destructive' : 'text-xs'}>
            {formatDate(s.assuranceDecennaleDateFin)}
            {alerte && ' ⚠'}
          </span>
        );
      },
      sortAccessor: (s) => s.assuranceDecennaleDateFin,
    },
    {
      id: 'dc4',
      header: 'DC4',
      cell: (s) => <span className="text-xs">{s.agrementDc4 ? 'Oui' : 'Non'}</span>,
      sortAccessor: (s) => (s.agrementDc4 ? 0 : 1),
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (s) => (
        <div className="flex items-center gap-1.5">
          <StatutSousTraitantBadge statut={s.statut} />
          {!s.actif && <StatutActifBadge actif={false} />}
        </div>
      ),
      sortAccessor: (s) => STATUT_SOUS_TRAITANT_VALUES.indexOf(s.statut),
      searchAccessor: (s) => STATUT_SOUS_TRAITANT_LABELS[s.statut],
    },
    {
      id: 'actions',
      header: 'Actions',
      align: 'right',
      cell: (s) => (
        <div className="flex items-center justify-end gap-2">
          {onChangerStatut && (
            <StatutToggleButton
              actif={s.actif}
              libelle="Sous-traitant"
              action={(actif) => onChangerStatut(s.id, actif)}
            />
          )}
          <Link
            href={`/tiers/sous-traitants/${s.id}`}
            className="text-sm underline underline-offset-4"
          >
            {peutEcrire ? 'Modifier' : 'Voir'}
          </Link>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <FilterPills items={pills} aria-label="Filtrer par statut d’agrément" />
      <DataTable
        columns={columns}
        rows={itemsFiltres}
        rowKey={(s) => s.id}
        rowHref={(s) => `/tiers/sous-traitants/${s.id}`}
        rowClassName={(s) => (s.actif ? undefined : 'opacity-60')}
        searchPlaceholder="Rechercher un sous-traitant…"
        emptyMessage={
          peutEcrire
            ? 'Aucun sous-traitant. Crée le premier via le bouton ci-dessus.'
            : 'Aucun sous-traitant.'
        }
        rightActions={rightActions}
        defaultSort={{ id: 'nom', dir: 'asc' }}
      />
    </div>
  );
}
