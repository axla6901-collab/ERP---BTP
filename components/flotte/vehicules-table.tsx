'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills, type FilterPillItem } from '@/components/ui/filter-pills';
import { StatutVehiculeBadge } from '@/components/flotte/statut-vehicule-badge';
import {
  joursAvantEcheance,
  niveauUrgenceEcheance,
  type NiveauUrgence,
} from '@/lib/flotte/echeances';
import { formatDateFr, formatJours, formatNombre } from '@/lib/flotte/format';
import {
  LIBELLES_CARBURANT,
  LIBELLES_TYPE_ECHEANCE,
  LIBELLES_TYPE_VEHICULE,
  type Carburant,
  type StatutVehicule,
  type TypeEcheance,
  type TypeVehicule,
} from '@/lib/validation/flotte';

export type VehiculeRow = {
  id: string;
  immatriculation: string;
  codeInterne: string | null;
  marque: string;
  modele: string;
  typeVehicule: TypeVehicule;
  carburant: Carburant;
  statut: StatutVehicule;
  kilometrageActuel: number;
  conducteurNom: string | null;
  prochaineEcheance: {
    typeEcheance: TypeEcheance;
    dateEcheance: string;
    seuilAlerteJours: number;
  } | null;
};

type Props = {
  vehicules: VehiculeRow[];
  today: string;
  baseHref: string;
};

const URGENCE_ROW: Record<NiveauUrgence, string | undefined> = {
  critique: 'bg-rose-50/70 hover:bg-rose-50 dark:bg-rose-950/20',
  proche: 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20',
  ok: undefined,
};

function niveauVehicule(v: VehiculeRow, today: string): NiveauUrgence {
  if (!v.prochaineEcheance) return 'ok';
  return niveauUrgenceEcheance(
    v.prochaineEcheance.dateEcheance,
    v.prochaineEcheance.seuilAlerteJours,
    today,
  );
}

export function VehiculesTable({ vehicules, today, baseHref }: Props) {
  const [filtre, setFiltre] = useState<TypeVehicule | 'tout'>('tout');

  const pills: FilterPillItem[] = useMemo(() => {
    const parType = new Map<TypeVehicule, number>();
    for (const v of vehicules) parType.set(v.typeVehicule, (parType.get(v.typeVehicule) ?? 0) + 1);
    const items: FilterPillItem[] = [
      {
        key: 'tout',
        label: 'Tous',
        count: vehicules.length,
        active: filtre === 'tout',
        onClick: () => setFiltre('tout'),
      },
    ];
    for (const [type, count] of parType) {
      items.push({
        key: type,
        label: LIBELLES_TYPE_VEHICULE[type],
        count,
        active: filtre === type,
        onClick: () => setFiltre(type),
      });
    }
    return items;
  }, [vehicules, filtre]);

  const rows = useMemo(
    () => (filtre === 'tout' ? vehicules : vehicules.filter((v) => v.typeVehicule === filtre)),
    [vehicules, filtre],
  );

  const columns: DataTableColumn<VehiculeRow>[] = [
    {
      id: 'immatriculation',
      header: 'Immatriculation',
      cell: (v) => <span className="font-mono font-medium">{v.immatriculation}</span>,
      sortAccessor: (v) => v.immatriculation,
      searchAccessor: (v) => `${v.immatriculation} ${v.codeInterne ?? ''}`,
    },
    {
      id: 'vehicule',
      header: 'Véhicule',
      cell: (v) => (
        <span>
          {v.marque} {v.modele}
          <span className="block text-xs text-muted-foreground">
            {LIBELLES_TYPE_VEHICULE[v.typeVehicule]} · {LIBELLES_CARBURANT[v.carburant]}
          </span>
        </span>
      ),
      sortAccessor: (v) => `${v.marque} ${v.modele}`,
      searchAccessor: (v) => `${v.marque} ${v.modele}`,
    },
    {
      id: 'km',
      header: 'Km',
      align: 'right',
      cell: (v) => <span className="tabular-nums">{formatNombre(v.kilometrageActuel)}</span>,
      sortAccessor: (v) => v.kilometrageActuel,
    },
    {
      id: 'conducteur',
      header: 'Conducteur',
      cell: (v) => <span className="text-muted-foreground">{v.conducteurNom ?? '—'}</span>,
      searchAccessor: (v) => v.conducteurNom ?? '',
    },
    {
      id: 'echeance',
      header: 'Prochaine échéance',
      cell: (v) => {
        if (!v.prochaineEcheance) return <span className="text-muted-foreground">—</span>;
        const niveau = niveauVehicule(v, today);
        const jours = joursAvantEcheance(v.prochaineEcheance.dateEcheance, today);
        const tone = niveau === 'critique' ? 'rose' : niveau === 'proche' ? 'amber' : 'neutral';
        return (
          <Badge tone={tone}>
            {LIBELLES_TYPE_ECHEANCE[v.prochaineEcheance.typeEcheance]}
            {niveau !== 'ok'
              ? ` · ${formatJours(jours)}`
              : ` · ${formatDateFr(v.prochaineEcheance.dateEcheance)}`}
          </Badge>
        );
      },
      sortAccessor: (v) =>
        v.prochaineEcheance
          ? joursAvantEcheance(v.prochaineEcheance.dateEcheance, today)
          : Infinity,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (v) => <StatutVehiculeBadge statut={v.statut} />,
      searchAccessor: (v) => v.statut,
    },
  ];

  return (
    <div className="space-y-3">
      <FilterPills items={pills} aria-label="Filtrer par catégorie" />
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(v) => v.id}
        rowHref={(v) => `${baseHref}/${v.id}`}
        rowClassName={(v) => URGENCE_ROW[niveauVehicule(v, today)]}
        defaultSort={{ id: 'immatriculation', dir: 'asc' }}
        searchPlaceholder="Rechercher (immatriculation, marque, conducteur…)"
        emptyMessage="Aucun véhicule. Créez-en un avec « + Nouveau véhicule »."
      />
    </div>
  );
}
