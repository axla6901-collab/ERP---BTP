'use client';

import { LayoutGridIcon, ListIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { SirhVide } from '@/components/test-sirh/sirh-bloc';
import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills } from '@/components/ui/filter-pills';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { formatDateFr } from '@/lib/test-sirh/format';
import { libelleDateReference } from '@/lib/test-sirh/onboarding/planification';
import type { ProcessusLigne } from '@/lib/test-sirh/onboarding/types';
import {
  LIBELLES_STATUT_PROCESSUS,
  STATUTS_PROCESSUS,
  TYPES_PROCESSUS,
  type StatutProcessus,
  type TypeProcessus,
} from '@/lib/validation/test-sirh/enums';

import {
  BarreProgression,
  LIBELLES_COURTS_TYPE_PROCESSUS,
  StatutProcessusBadge,
  TypeProcessusBadge,
} from './badges-onboarding';

type FiltreType = TypeProcessus | 'tous';
type FiltreStatut = StatutProcessus | 'tous';
type Vue = 'cartes' | 'tableau';

type Props = {
  processus: ProcessusLigne[];
  today: string;
  /** URL des fiches : `/<slug>/test-sirh/onboarding`. */
  baseFiches: string;
};

/** Échéance à venir, en rose si dépassée. */
function Echeance({ iso, today }: { iso: string | null; today: string }) {
  if (!iso) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={iso < today ? 'font-medium text-rose-700 dark:text-rose-300' : undefined}>
      {formatDateFr(iso)}
    </span>
  );
}

function RetardBadge({ n }: { n: number }) {
  if (n === 0) return null;
  return (
    <Badge tone="rose" shape="pill">
      {n} en retard
    </Badge>
  );
}

/** Carte d'un processus (lien vers sa fiche). */
function CarteProcessus({ p, today, href }: { p: ProcessusLigne; today: string; href: string }) {
  return (
    <Link
      href={href}
      className="block rounded-xl border bg-card p-4 shadow-sm transition-colors hover:border-amber-300 hover:bg-amber-50/30 dark:hover:bg-amber-950/10"
    >
      <div className="flex flex-wrap items-center gap-2">
        <TypeProcessusBadge type={p.typeProcessus} />
        {p.statut !== 'en_cours' && <StatutProcessusBadge statut={p.statut} />}
        <span className="ml-auto">
          <RetardBadge n={p.enRetard} />
        </span>
      </div>
      <p className="mt-2 truncate font-medium">{p.employeNom}</p>
      <p className="truncate text-sm text-muted-foreground">{p.libelle}</p>
      <BarreProgression faites={p.faites} total={p.total} pourcent={p.pourcent} className="mt-3" />
      <dl className="mt-3 grid grid-cols-1 gap-1 text-xs sm:grid-cols-2">
        <div>
          <dt className="text-muted-foreground">{libelleDateReference(p.typeProcessus)}</dt>
          <dd className="tabular-nums">{formatDateFr(p.dateReference)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Prochaine échéance</dt>
          <dd className="tabular-nums">
            <Echeance iso={p.prochaineEcheance} today={today} />
          </dd>
        </div>
      </dl>
    </Link>
  );
}

/**
 * Processus d'onboarding / offboarding : filtres type & statut, vue cartes
 * (par défaut) ou tableau triable.
 */
export function ProcessusListe({ processus, today, baseFiches }: Props) {
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatut>('en_cours');
  const [filtreType, setFiltreType] = useState<FiltreType>('tous');
  const [vue, setVue] = useState<Vue>('cartes');

  const parStatut = useMemo(
    () =>
      filtreStatut === 'tous' ? processus : processus.filter((p) => p.statut === filtreStatut),
    [processus, filtreStatut],
  );
  const lignes = useMemo(
    () =>
      filtreType === 'tous' ? parStatut : parStatut.filter((p) => p.typeProcessus === filtreType),
    [parStatut, filtreType],
  );

  const colonnes: DataTableColumn<ProcessusLigne>[] = [
    {
      id: 'employe',
      header: 'Collaborateur',
      cell: (p) => (
        <div className="min-w-0">
          <span className="font-medium">{p.employeNom}</span>
          <span className="block truncate text-xs text-muted-foreground">{p.libelle}</span>
        </div>
      ),
      sortAccessor: (p) => p.employeNom,
      searchAccessor: (p) => `${p.employeNom} ${p.libelle} ${p.modeleNom ?? ''}`,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (p) => <TypeProcessusBadge type={p.typeProcessus} />,
      sortAccessor: (p) => LIBELLES_COURTS_TYPE_PROCESSUS[p.typeProcessus],
    },
    {
      id: 'reference',
      header: 'Date de référence',
      cell: (p) => <span className="tabular-nums">{formatDateFr(p.dateReference)}</span>,
      sortAccessor: (p) => p.dateReference,
    },
    {
      id: 'progression',
      header: 'Progression',
      cell: (p) => (
        <BarreProgression
          faites={p.faites}
          total={p.total}
          pourcent={p.pourcent}
          className="min-w-32"
        />
      ),
      sortAccessor: (p) => p.pourcent,
    },
    {
      id: 'echeance',
      header: 'Prochaine échéance',
      cell: (p) => (
        <span className="tabular-nums">
          <Echeance iso={p.prochaineEcheance} today={today} />
        </span>
      ),
      sortAccessor: (p) => p.prochaineEcheance,
    },
    {
      id: 'retard',
      header: 'En retard',
      align: 'right',
      cell: (p) =>
        p.enRetard > 0 ? (
          <span className="font-medium tabular-nums text-rose-700 dark:text-rose-300">
            {p.enRetard}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (p) => p.enRetard,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (p) => <StatutProcessusBadge statut={p.statut} />,
      sortAccessor: (p) => LIBELLES_STATUT_PROCESSUS[p.statut],
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <FilterPills
            aria-label="Filtrer par statut"
            items={[
              ...STATUTS_PROCESSUS.map((s) => ({
                key: s,
                label: LIBELLES_STATUT_PROCESSUS[s],
                count: processus.filter((p) => p.statut === s).length,
                active: filtreStatut === s,
                onClick: () => setFiltreStatut(s),
              })),
              {
                key: 'tous',
                label: 'Tous',
                count: processus.length,
                active: filtreStatut === 'tous',
                onClick: () => setFiltreStatut('tous'),
              },
            ]}
          />
          <FilterPills
            aria-label="Filtrer par type"
            items={[
              {
                key: 'tous',
                label: 'Tous les types',
                active: filtreType === 'tous',
                onClick: () => setFiltreType('tous'),
              },
              ...TYPES_PROCESSUS.map((t) => ({
                key: t,
                label: LIBELLES_COURTS_TYPE_PROCESSUS[t],
                count: parStatut.filter((p) => p.typeProcessus === t).length,
                active: filtreType === t,
                onClick: () => setFiltreType(t),
              })),
            ]}
          />
        </div>
        <SegmentedControl<Vue>
          aria-label="Affichage"
          value={vue}
          onChange={setVue}
          options={[
            { value: 'cartes', label: 'Cartes', icon: <LayoutGridIcon className="size-3.5" /> },
            { value: 'tableau', label: 'Tableau', icon: <ListIcon className="size-3.5" /> },
          ]}
        />
      </div>

      {vue === 'tableau' ? (
        <DataTable
          columns={colonnes}
          rows={lignes}
          rowKey={(p) => p.id}
          rowHref={(p) => `${baseFiches}/${p.id}`}
          searchPlaceholder="Rechercher un collaborateur, un processus…"
          emptyMessage="Aucun processus pour ces filtres."
          defaultSort={{ id: 'reference', dir: 'desc' }}
          rowClassName={(p) => (p.statut === 'en_cours' ? undefined : 'opacity-70')}
        />
      ) : lignes.length === 0 ? (
        <SirhVide>
          {processus.length === 0
            ? 'Aucun processus. Lancez un onboarding ou un offboarding depuis un modèle.'
            : 'Aucun processus pour ces filtres.'}
        </SirhVide>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lignes.map((p) => (
            <CarteProcessus key={p.id} p={p} today={today} href={`${baseFiches}/${p.id}`} />
          ))}
        </div>
      )}
    </div>
  );
}
