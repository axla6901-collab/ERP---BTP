'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatHeures, formatNombre } from '@/lib/test-sirh/format';
import {
  CLES_HEURES_JOURS,
  LIBELLES_JOURS_HORAIRE,
  type HoraireInput,
} from '@/lib/validation/test-sirh/temps';

import { HoraireDialog } from './horaire-dialog';

/** Ligne affichée (sérialisable, cf. `HoraireVue`). */
export type HoraireLigne = {
  id: string;
  nom: string;
  description: string | null;
  heuresLundi: string;
  heuresMardi: string;
  heuresMercredi: string;
  heuresJeudi: string;
  heuresVendredi: string;
  heuresSamedi: string;
  heuresDimanche: string;
  totalHebdo: number;
  parDefaut: boolean;
  actif: boolean;
  nbCollaborateurs: number;
};

type Props = {
  horaires: HoraireLigne[];
  peutGerer: boolean;
  actions: {
    enregistrer: (input: HoraireInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Horaires de travail (Factorial work_schedule) : liste, édition en modale, suppression gardée. */
export function HorairesSection({ horaires, peutGerer, actions }: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [edite, setEdite] = useState<HoraireLigne | null>(null);

  function ouvrir(h: HoraireLigne | null) {
    setEdite(h);
    setDialogOuvert(true);
  }

  const colonnes: DataTableColumn<HoraireLigne>[] = [
    {
      id: 'nom',
      header: 'Horaire',
      cell: (h) => (
        <div className="min-w-0">
          <span className="font-medium">{h.nom}</span>
          {h.parDefaut && (
            <Badge tone="amber" shape="pill" className="ml-2">
              Par défaut
            </Badge>
          )}
          {h.description && (
            <span className="block max-w-[320px] truncate text-xs text-muted-foreground">
              {h.description}
            </span>
          )}
        </div>
      ),
      sortAccessor: (h) => h.nom,
      searchAccessor: (h) => `${h.nom} ${h.description ?? ''}`,
    },
    {
      id: 'jours',
      header: 'Lun → Dim',
      cell: (h) => (
        <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
          {CLES_HEURES_JOURS.map((cle) => (
            <span key={cle} className="mr-1.5" title={LIBELLES_JOURS_HORAIRE[cle]}>
              <span className="text-foreground/60">{LIBELLES_JOURS_HORAIRE[cle].charAt(0)}</span>{' '}
              {formatNombre(h[cle])}
            </span>
          ))}
        </span>
      ),
    },
    {
      id: 'total',
      header: 'Total hebdo',
      align: 'right',
      cell: (h) => <span className="font-medium tabular-nums">{formatHeures(h.totalHebdo)}</span>,
      sortAccessor: (h) => h.totalHebdo,
    },
    {
      id: 'effectif',
      header: 'Collaborateurs',
      align: 'right',
      cell: (h) => <span className="tabular-nums">{h.nbCollaborateurs}</span>,
      sortAccessor: (h) => h.nbCollaborateurs,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (h) =>
        h.actif ? (
          <Badge tone="emerald" shape="pill">
            Actif
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Inactif
          </Badge>
        ),
      sortAccessor: (h) => (h.actif ? 0 : 1),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (h) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => ouvrir(h)}
            title="Modifier"
            aria-label={`Modifier ${h.nom}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer cet horaire ?"
            libelleConfirmer="Supprimer"
            messageSucces="Horaire supprimé"
            onConfirm={() => actions.supprimer(h.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={horaires}
        rowKey={(h) => h.id}
        searchPlaceholder="Rechercher un horaire…"
        emptyMessage="Aucun horaire. Créez l’horaire collectif de l’entreprise (35 h, 39 h…)."
        defaultSort={{ id: 'nom', dir: 'asc' }}
        rowClassName={(h) => (h.actif ? undefined : 'opacity-60')}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouvel horaire
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <HoraireDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          horaire={edite}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
