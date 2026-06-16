'use client';

import { useMemo, useState } from 'react';

import { Badge, type BadgeTone } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import {
  joursAvantEcheance,
  niveauUrgenceEcheance,
  type NiveauUrgence,
} from '@/lib/flotte/echeances';
import { formatDateFr, formatJours } from '@/lib/flotte/format';
import { LIBELLES_TYPE_ECHEANCE, type TypeEcheance } from '@/lib/validation/flotte';

export type AlerteRow = {
  id: string;
  vehiculeId: string;
  immatriculation: string;
  marque: string;
  modele: string;
  typeEcheance: TypeEcheance;
  dateEcheance: string;
  seuilAlerteJours: number;
  conducteurNom: string | null;
};

type Props = {
  alertes: AlerteRow[];
  /** Date du jour (YYYY-MM-DD) calculée serveur. */
  today: string;
  /** Base des liens vers les fiches : `/<slug>/flotte/vehicules`. */
  baseHref: string;
  emptyMessage?: string;
};

const TONE_TYPE: Record<TypeEcheance, BadgeTone> = {
  controle_technique: 'violet',
  controle_technique_pollution: 'violet',
  revision_constructeur: 'violet',
  assurance: 'sky',
  carte_grise: 'indigo',
  vignette_critair: 'emerald',
  taxe_essieu: 'slate',
  extincteur: 'orange',
  chronotachygraphe: 'slate',
  franchise_km: 'neutral',
};

const URGENCE_ROW: Record<NiveauUrgence, string | undefined> = {
  critique: 'bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/20',
  proche: 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20',
  ok: undefined,
};

const URGENCE_PILL: Record<NiveauUrgence, string> = {
  critique: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  proche: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  ok: 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400',
};

export function EcheancesAlertesTable({ alertes, today, baseHref, emptyMessage }: Props) {
  const [filtre, setFiltre] = useState<TypeEcheance | 'tout'>('tout');

  const pills: FilterPillItem[] = useMemo(() => {
    const parType = new Map<TypeEcheance, number>();
    for (const a of alertes) parType.set(a.typeEcheance, (parType.get(a.typeEcheance) ?? 0) + 1);
    const items: FilterPillItem[] = [
      {
        key: 'tout',
        label: 'Tout',
        count: alertes.length,
        active: filtre === 'tout',
        onClick: () => setFiltre('tout'),
      },
    ];
    for (const [type, count] of parType) {
      items.push({
        key: type,
        label: LIBELLES_TYPE_ECHEANCE[type],
        count,
        active: filtre === type,
        onClick: () => setFiltre(type),
      });
    }
    return items;
  }, [alertes, filtre]);

  const rows = useMemo(
    () => (filtre === 'tout' ? alertes : alertes.filter((a) => a.typeEcheance === filtre)),
    [alertes, filtre],
  );

  const columns: DataTableColumn<AlerteRow>[] = [
    {
      id: 'vehicule',
      header: 'Véhicule',
      cell: (r) => (
        <span>
          <span className="font-mono font-medium">{r.immatriculation}</span>
          <span className="text-muted-foreground">
            {' '}
            · {r.marque} {r.modele}
          </span>
        </span>
      ),
      sortAccessor: (r) => r.immatriculation,
      searchAccessor: (r) => `${r.immatriculation} ${r.marque} ${r.modele}`,
    },
    {
      id: 'type',
      header: 'Échéance',
      cell: (r) => (
        <Badge tone={TONE_TYPE[r.typeEcheance]}>{LIBELLES_TYPE_ECHEANCE[r.typeEcheance]}</Badge>
      ),
      searchAccessor: (r) => LIBELLES_TYPE_ECHEANCE[r.typeEcheance],
    },
    {
      id: 'date',
      header: 'Date',
      align: 'right',
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground">{formatDateFr(r.dateEcheance)}</span>
      ),
      sortAccessor: (r) => r.dateEcheance,
    },
    {
      id: 'reste',
      header: 'Reste',
      align: 'right',
      cell: (r) => {
        const jours = joursAvantEcheance(r.dateEcheance, today);
        const niveau = niveauUrgenceEcheance(r.dateEcheance, r.seuilAlerteJours, today);
        return (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${URGENCE_PILL[niveau]}`}
          >
            {formatJours(jours)}
          </span>
        );
      },
      sortAccessor: (r) => joursAvantEcheance(r.dateEcheance, today),
    },
    {
      id: 'conducteur',
      header: 'Conducteur',
      cell: (r) => <span className="text-muted-foreground">{r.conducteurNom ?? '— (parc)'}</span>,
      searchAccessor: (r) => r.conducteurNom ?? '',
    },
  ];

  return (
    <div className="space-y-3">
      <FilterPills items={pills} aria-label="Filtrer par type d'échéance" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        rowHref={(r) => `${baseHref}/${r.vehiculeId}`}
        rowClassName={(r) =>
          URGENCE_ROW[niveauUrgenceEcheance(r.dateEcheance, r.seuilAlerteJours, today)]
        }
        defaultSort={{ id: 'reste', dir: 'asc' }}
        searchPlaceholder="Rechercher (immatriculation, conducteur…)"
        emptyMessage={emptyMessage ?? 'Aucune échéance enregistrée.'}
      />
    </div>
  );
}
