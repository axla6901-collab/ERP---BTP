'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import {
  OptionSelect,
  optionsDepuisEnum,
  type OptionListe,
} from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { FilterPills } from '@/components/ui/filter-pills';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr } from '@/lib/test-sirh/format';
import {
  estTacheDeLaSemaine,
  estTacheEnRetard,
  estTacheOuverte,
  filtrerTaches,
  type EtatTache,
  type FiltreEcheanceTache,
  type FiltreStatutTache,
} from '@/lib/test-sirh/onboarding/planification';
import type { TacheLigne } from '@/lib/test-sirh/onboarding/types';
import {
  LIBELLES_RESPONSABLE_TACHE,
  LIBELLES_STATUT_TACHE,
  STATUTS_TACHE,
  type StatutTache,
} from '@/lib/validation/test-sirh/enums';
import type { StatutTacheInput, TacheInput } from '@/lib/validation/test-sirh/onboarding';

import { ResponsableBadge, StatutTacheBadge } from './badges-onboarding';
import { versTacheInput } from './checklist-taches';
import { TacheDialog } from './tache-dialog';
import { useAvancementTaches } from './use-avancement-taches';

const OPTIONS_STATUT_GESTION = optionsDepuisEnum(STATUTS_TACHE, LIBELLES_STATUT_TACHE);
/** Un salarié fait avancer ses tâches mais ne les annule pas. */
const OPTIONS_STATUT_SALARIE = OPTIONS_STATUT_GESTION.filter((o) => o.id !== 'annulee');

type Props = {
  taches: TacheLigne[];
  vue: 'mes' | 'toutes';
  peutGerer: boolean;
  utilisateurId: string;
  today: string;
  /** `/<slug>/test-sirh/onboarding` (onglet Mes / Toutes, liens vers les processus). */
  baseOnboarding: string;
  utilisateurs: readonly OptionListe[];
  employes: readonly OptionListe[];
  actions: {
    basculer: (id: string, faite: boolean) => Promise<ActionResult<EtatTache>>;
    changerStatut: (input: StatutTacheInput) => Promise<ActionResult<EtatTache>>;
    enregistrer: (input: TacheInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/**
 * Toutes les tâches RH (processus et autonomes) : « Mes tâches » ou
 * « Toutes » (gestionnaires), filtres statut / échéance, avancement rapide.
 */
export function TachesListe({
  taches,
  vue,
  peutGerer,
  utilisateurId,
  today,
  baseOnboarding,
  utilisateurs,
  employes,
  actions,
}: Props) {
  const [filtreStatut, setFiltreStatut] = useState<FiltreStatutTache>('ouvertes');
  const [filtreEcheance, setFiltreEcheance] = useState<FiltreEcheanceTache>('toutes');
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [editee, setEditee] = useState<TacheLigne | null>(null);
  const valeursEditees = useMemo(() => (editee ? versTacheInput(editee) : null), [editee]);
  const avancement = useAvancementTaches(taches, today, {
    basculer: actions.basculer,
    changerStatut: actions.changerStatut,
  });

  const lignes = useMemo(
    () =>
      filtrerTaches(avancement.taches, { statut: filtreStatut, echeance: filtreEcheance }, today),
    [avancement.taches, filtreStatut, filtreEcheance, today],
  );
  // Compteurs des filtres d'échéance, calculés sur le filtre de statut courant.
  const parStatut = useMemo(
    () => filtrerTaches(avancement.taches, { statut: filtreStatut, echeance: 'toutes' }, today),
    [avancement.taches, filtreStatut, today],
  );

  function ouvrir(t: TacheLigne | null) {
    setEditee(t);
    setDialogOuvert(true);
  }

  const peutAvancer = (t: TacheLigne) => peutGerer || t.assigneA === utilisateurId;

  const colonnes: DataTableColumn<TacheLigne>[] = [
    {
      id: 'faite',
      header: '',
      className: 'w-8',
      cell: (t) => (
        <input
          type="checkbox"
          className="size-4 cursor-pointer accent-amber-600 disabled:cursor-not-allowed"
          checked={t.statut === 'faite'}
          disabled={!peutAvancer(t) || t.statut === 'annulee'}
          onChange={(e) => avancement.basculer(t.id, e.target.checked)}
          aria-label={`Tâche faite : ${t.libelle}`}
        />
      ),
    },
    {
      id: 'libelle',
      header: 'Tâche',
      cell: (t) => (
        <div className="min-w-0">
          <span
            className={
              t.statut === 'faite'
                ? 'font-medium text-muted-foreground line-through'
                : 'font-medium'
            }
          >
            {t.libelle}
          </span>
          {t.processusId ? (
            <Link
              href={`${baseOnboarding}/${t.processusId}`}
              className="block truncate text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t.processusLibelle}
            </Link>
          ) : (
            <span className="block text-xs text-muted-foreground">Tâche autonome</span>
          )}
        </div>
      ),
      sortAccessor: (t) => t.libelle,
      searchAccessor: (t) =>
        `${t.libelle} ${t.processusLibelle ?? ''} ${t.employeNom ?? ''} ${t.assigneLabel ?? ''}`,
    },
    {
      id: 'employe',
      header: 'Collaborateur',
      cell: (t) => t.employeNom ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (t) => t.employeNom,
    },
    {
      id: 'responsable',
      header: 'Responsable',
      cell: (t) => <ResponsableBadge responsable={t.responsable} />,
      sortAccessor: (t) => LIBELLES_RESPONSABLE_TACHE[t.responsable],
    },
    {
      id: 'assigne',
      header: 'Assignée à',
      cell: (t) => t.assigneLabel ?? <span className="text-muted-foreground">Non assignée</span>,
      sortAccessor: (t) => t.assigneLabel,
    },
    {
      id: 'echeance',
      header: 'Échéance',
      cell: (t) => (
        <span
          className={
            estTacheEnRetard(t, today)
              ? 'font-medium tabular-nums text-rose-700 dark:text-rose-300'
              : 'tabular-nums'
          }
        >
          {formatDateFr(t.echeance)}
        </span>
      ),
      sortAccessor: (t) => t.echeance,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (t) =>
        peutAvancer(t) && (peutGerer || t.statut !== 'annulee') ? (
          <OptionSelect
            options={peutGerer ? OPTIONS_STATUT_GESTION : OPTIONS_STATUT_SALARIE}
            value={t.statut}
            onChange={(v) => v && avancement.changerStatut(t.id, v as StatutTache)}
            autoriserAucune={false}
            className="h-7 w-28 text-xs"
            aria-label={`Statut de ${t.libelle}`}
          />
        ) : (
          <StatutTacheBadge statut={t.statut} />
        ),
      sortAccessor: (t) => LIBELLES_STATUT_TACHE[t.statut],
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (t) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => ouvrir(t)}
            title="Modifier"
            aria-label={`Modifier ${t.libelle}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer cette tâche ?"
            libelleConfirmer="Supprimer"
            messageSucces="Tâche supprimée"
            onConfirm={() => actions.supprimer(t.id)}
          />
        </div>
      ),
    });
  }

  const statuts: Array<{ cle: FiltreStatutTache; label: string }> = [
    { cle: 'ouvertes', label: 'Ouvertes' },
    ...STATUTS_TACHE.map((s) => ({ cle: s as FiltreStatutTache, label: LIBELLES_STATUT_TACHE[s] })),
    { cle: 'toutes', label: 'Toutes' },
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {peutGerer && (
          <FilterPills
            aria-label="Vue"
            items={[
              {
                key: 'mes',
                label: 'Mes tâches',
                active: vue === 'mes',
                href: `${baseOnboarding}/taches`,
              },
              {
                key: 'toutes',
                label: 'Toutes les tâches',
                active: vue === 'toutes',
                href: `${baseOnboarding}/taches?vue=toutes`,
              },
            ]}
          />
        )}
        <FilterPills
          aria-label="Filtrer par statut"
          items={statuts.map((s) => ({
            key: s.cle,
            label: s.label,
            count: filtrerTaches(avancement.taches, { statut: s.cle, echeance: 'toutes' }, today)
              .length,
            active: filtreStatut === s.cle,
            onClick: () => setFiltreStatut(s.cle),
          }))}
        />
        <FilterPills
          aria-label="Filtrer par échéance"
          items={[
            {
              key: 'toutes',
              label: 'Toutes échéances',
              active: filtreEcheance === 'toutes',
              onClick: () => setFiltreEcheance('toutes'),
            },
            {
              key: 'en_retard',
              label: '⚠ En retard',
              tone: 'danger',
              count: parStatut.filter((t) => estTacheEnRetard(t, today)).length,
              active: filtreEcheance === 'en_retard',
              onClick: () => setFiltreEcheance('en_retard'),
            },
            {
              key: 'semaine',
              label: 'Cette semaine',
              count: parStatut.filter((t) => estTacheDeLaSemaine(t, today)).length,
              active: filtreEcheance === 'semaine',
              onClick: () => setFiltreEcheance('semaine'),
            },
          ]}
        />
      </div>

      <DataTable
        columns={colonnes}
        rows={lignes}
        rowKey={(t) => t.id}
        searchPlaceholder="Rechercher une tâche, un collaborateur…"
        emptyMessage={
          vue === 'mes'
            ? 'Aucune tâche ne vous est assignée pour ces filtres.'
            : 'Aucune tâche pour ces filtres.'
        }
        rowClassName={(t) =>
          estTacheEnRetard(t, today)
            ? 'bg-rose-50/70 dark:bg-rose-950/20'
            : estTacheOuverte(t.statut)
              ? undefined
              : 'opacity-70'
        }
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle tâche
            </Button>
          ) : null
        }
      />

      {peutGerer && (
        <TacheDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          tache={valeursEditees}
          processusId={null}
          utilisateurs={utilisateurs}
          employes={employes}
          onSubmit={actions.enregistrer}
        />
      )}
    </div>
  );
}
