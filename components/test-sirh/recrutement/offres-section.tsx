'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr } from '@/lib/test-sirh/format';
import { formatFourchetteSalaire } from '@/lib/test-sirh/recrutement/pipeline';
import type { OffreLigne } from '@/lib/test-sirh/recrutement/queries';
import { LIBELLES_TYPE_CONTRAT, STATUTS_OFFRE } from '@/lib/validation/test-sirh/enums';
import type { OffreInput } from '@/lib/validation/test-sirh/recrutement';

import { ActionsStatutOffre, type ActionChangerStatutOffre } from './actions-statut-offre';
import { StatutOffreBadge } from './badges-recrutement';
import { OffreDialog, type OptionsOffre } from './offre-dialog';

export type ActionsOffres = {
  enregistrer: (input: OffreInput) => Promise<ActionResult<{ id: string }>>;
  changerStatut: ActionChangerStatutOffre;
  supprimer: (id: string) => Promise<ActionResult>;
};

type Props = {
  offres: OffreLigne[];
  /** Préfixe du module : `/<slug>/test-sirh`. */
  base: string;
  peutGerer: boolean;
  options: OptionsOffre;
  actions: ActionsOffres;
  /** Message d'état vide (dépend du filtre de statut). */
  messageVide?: string | undefined;
};

/** Offres d'emploi : tableau cliquable (→ pipeline), création / édition en modale, statuts. */
export function OffresSection({ offres, base, peutGerer, options, actions, messageVide }: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [editee, setEditee] = useState<OffreLigne | null>(null);

  function ouvrir(offre: OffreLigne | null) {
    setEditee(offre);
    setDialogOuvert(true);
  }

  const colonnes: DataTableColumn<OffreLigne>[] = [
    {
      id: 'titre',
      header: 'Offre',
      cell: (o) => (
        <div className="min-w-0">
          <span className="font-medium">{o.titre}</span>
          {o.reference && <span className="ml-2 text-xs text-muted-foreground">{o.reference}</span>}
          {(o.posteLibelle || o.siteNom) && (
            <span className="block text-xs text-muted-foreground">
              {[o.posteLibelle, o.siteNom].filter(Boolean).join(' · ')}
            </span>
          )}
        </div>
      ),
      sortAccessor: (o) => o.titre,
      searchAccessor: (o) =>
        `${o.titre} ${o.reference ?? ''} ${o.posteLibelle ?? ''} ${o.siteNom ?? ''} ${o.responsableNom ?? ''}`,
    },
    {
      id: 'contrat',
      header: 'Contrat',
      cell: (o) => LIBELLES_TYPE_CONTRAT[o.typeContrat],
      sortAccessor: (o) => LIBELLES_TYPE_CONTRAT[o.typeContrat],
    },
    {
      id: 'candidatures',
      header: 'Candidatures',
      align: 'right',
      cell: (o) => (
        <span className="tabular-nums">
          {o.nbActives}
          <span className="text-muted-foreground"> en cours / {o.nbCandidatures}</span>
          <span className="block text-xs text-muted-foreground">
            postes pourvus : {o.nbEmbauches} / {o.nbPostes}
          </span>
        </span>
      ),
      sortAccessor: (o) => o.nbActives,
    },
    {
      id: 'salaire',
      header: 'Salaire mensuel',
      cell: (o) => (
        <span className="tabular-nums">{formatFourchetteSalaire(o.salaireMin, o.salaireMax)}</span>
      ),
      sortAccessor: (o) => (o.salaireMin ? Number(o.salaireMin) : null),
    },
    {
      id: 'publication',
      header: 'Publication',
      cell: (o) => (
        <span className="tabular-nums">
          {formatDateFr(o.datePublication)}
          {o.dateCloture && (
            <span className="block text-xs text-muted-foreground">
              clôture {formatDateFr(o.dateCloture)}
            </span>
          )}
        </span>
      ),
      sortAccessor: (o) => o.datePublication,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (o) => <StatutOffreBadge statut={o.statut} />,
      sortAccessor: (o) => STATUTS_OFFRE.indexOf(o.statut),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (o) => (
        // Les options du sélecteur de statut sont rendues dans un portail : leurs clics
        // remontent l'arbre React jusqu'à la ligne cliquable → on les arrête ici.
        <div
          className="flex items-center justify-end gap-1"
          data-no-row-nav
          onClick={(e) => e.stopPropagation()}
          onAuxClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => ouvrir(o)}
            title="Modifier"
            aria-label={`Modifier ${o.titre}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <ActionsStatutOffre
            offreId={o.id}
            statut={o.statut}
            onChanger={actions.changerStatut}
            variante="liste"
          />
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer cette offre ?"
            libelleConfirmer="Supprimer"
            messageSucces="Offre supprimée"
            onConfirm={() => actions.supprimer(o.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={offres}
        rowKey={(o) => o.id}
        rowHref={(o) => `${base}/recrutement/offres/${o.id}`}
        searchPlaceholder="Rechercher une offre…"
        emptyMessage={
          messageVide ?? 'Aucune offre d’emploi. Créez la première pour lancer un recrutement.'
        }
        rowClassName={(o) => (o.statut === 'fermee' ? 'opacity-60' : undefined)}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle offre
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <OffreDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          offre={editee}
          options={options}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
