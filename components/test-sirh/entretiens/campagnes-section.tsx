'use client';

import { PencilIcon, PlayIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { campagneLancable } from '@/lib/test-sirh/entretiens/statuts';
import { formatDateFr } from '@/lib/test-sirh/format';
import type { CampagneInput, LancementCampagneInput } from '@/lib/validation/test-sirh/entretiens';
import type { StatutCampagne, TypeEntretien } from '@/lib/validation/test-sirh/enums';

import { LIBELLES_COURTS_TYPE_ENTRETIEN, StatutCampagneBadge } from './badges';
import { BarreProgression } from './barre-progression';
import { CampagneDialog } from './campagne-dialog';
import { LancerCampagneDialog, type CampagneALancer } from './lancer-campagne-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type CampagneLigneUI = {
  id: string;
  libelle: string;
  typeEntretien: TypeEntretien;
  dateDebut: string | null;
  dateLimite: string | null;
  statut: StatutCampagne;
  description: string | null;
  /** Entretiens non annulés. */
  total: number;
  realises: number;
  annules: number;
  pourcentage: number;
};

type Props = {
  campagnes: CampagneLigneUI[];
  peutGerer: boolean;
  /** Préfixe `/<slug>/test-sirh`. */
  base: string;
  sites: OptionListe[];
  equipes: OptionListe[];
  actions: {
    enregistrer: (input: CampagneInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
    lancer: (
      input: LancementCampagneInput,
    ) => Promise<ActionResult<{ crees: number; existants: number }>>;
    changerStatut: (id: string, statut: StatutCampagne) => Promise<ActionResult>;
  };
};

/** Campagnes d'entretiens : progression, lancement, clôture, CRUD en modale. */
export function CampagnesSection({ campagnes, peutGerer, base, sites, equipes, actions }: Props) {
  const [edition, setEdition] = useState<{ ouvert: boolean; campagne: CampagneLigneUI | null }>({
    ouvert: false,
    campagne: null,
  });
  const [aLancer, setALancer] = useState<CampagneALancer | null>(null);

  const colonnes: DataTableColumn<CampagneLigneUI>[] = [
    {
      id: 'libelle',
      header: 'Campagne',
      cell: (c) => (
        <div className="min-w-0">
          <span className="font-medium">{c.libelle}</span>
          {c.description && (
            <span className="block max-w-md truncate text-xs text-muted-foreground">
              {c.description}
            </span>
          )}
        </div>
      ),
      sortAccessor: (c) => c.libelle,
      searchAccessor: (c) => `${c.libelle} ${c.description ?? ''}`,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (c) => LIBELLES_COURTS_TYPE_ENTRETIEN[c.typeEntretien],
      sortAccessor: (c) => LIBELLES_COURTS_TYPE_ENTRETIEN[c.typeEntretien],
      searchAccessor: (c) => LIBELLES_COURTS_TYPE_ENTRETIEN[c.typeEntretien],
    },
    {
      id: 'periode',
      header: 'Période',
      cell: (c) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatDateFr(c.dateDebut)} → {formatDateFr(c.dateLimite)}
        </span>
      ),
      sortAccessor: (c) => c.dateDebut,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (c) => <StatutCampagneBadge statut={c.statut} />,
      sortAccessor: (c) => c.statut,
    },
    {
      id: 'progression',
      header: 'Progression',
      cell: (c) =>
        c.total === 0 ? (
          <span className="text-xs text-muted-foreground">Aucun entretien</span>
        ) : (
          <div className="w-40 space-y-1">
            <BarreProgression
              valeur={c.pourcentage}
              ton={c.pourcentage >= 100 ? 'emerald' : 'amber'}
              libelle={`Progression de ${c.libelle}`}
            />
            <span className="text-xs tabular-nums text-muted-foreground">
              {c.realises} / {c.total} réalisés · {c.pourcentage} %
            </span>
          </div>
        ),
      sortAccessor: (c) => c.pourcentage,
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (c) => {
        const dejaGeneres = c.total + c.annules;
        return (
          <div className="flex flex-wrap items-center justify-end gap-1">
            {campagneLancable(c.statut) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setALancer({
                    id: c.id,
                    libelle: c.libelle,
                    typeEntretien: c.typeEntretien,
                    dejaGeneres,
                  })
                }
              >
                <PlayIcon className="mr-1 size-3.5" />
                {c.statut === 'brouillon' ? 'Lancer' : 'Compléter'}
              </Button>
            )}
            {c.statut === 'en_cours' && (
              <BoutonConfirmation
                libelle="Clôturer"
                question="Clôturer la campagne ?"
                libelleConfirmer="Clôturer"
                messageSucces="Campagne clôturée"
                variante="default"
                onConfirm={() => actions.changerStatut(c.id, 'cloturee')}
              />
            )}
            {c.statut === 'cloturee' && (
              <BoutonConfirmation
                libelle="Rouvrir"
                question="Rouvrir la campagne ?"
                libelleConfirmer="Rouvrir"
                messageSucces="Campagne rouverte"
                variante="default"
                onConfirm={() => actions.changerStatut(c.id, 'en_cours')}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setEdition({ ouvert: true, campagne: c })}
              title="Modifier"
              aria-label={`Modifier ${c.libelle}`}
            >
              <PencilIcon className="size-3.5" />
            </Button>
            <BoutonConfirmation
              libelle="Supprimer"
              question="Supprimer cette campagne ?"
              libelleConfirmer="Supprimer"
              messageSucces="Campagne supprimée"
              onConfirm={() => actions.supprimer(c.id)}
            />
          </div>
        );
      },
    });
  }

  const enEdition = edition.campagne;
  // Objet stable : la modale ne se réinitialise qu'à l'ouverture / au changement de campagne.
  const valeursEdition = useMemo(
    () =>
      enEdition
        ? {
            id: enEdition.id,
            libelle: enEdition.libelle,
            typeEntretien: enEdition.typeEntretien,
            dateDebut: enEdition.dateDebut,
            dateLimite: enEdition.dateLimite,
            description: enEdition.description,
          }
        : null,
    [enEdition],
  );

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={campagnes}
        rowKey={(c) => c.id}
        rowHref={(c) => `${base}/entretiens/liste?campagne=${c.id}`}
        searchPlaceholder="Rechercher une campagne…"
        emptyMessage="Aucune campagne. Créez une campagne d’entretiens annuels ou professionnels puis lancez-la."
        rowClassName={(c) => (c.statut === 'cloturee' ? 'opacity-70' : undefined)}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setEdition({ ouvert: true, campagne: null })}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle campagne
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <>
          <CampagneDialog
            open={edition.ouvert}
            onOpenChange={(ouvert) => setEdition((e) => ({ ...e, ouvert }))}
            campagne={valeursEdition}
            typeVerrouille={enEdition ? enEdition.total + enEdition.annules > 0 : false}
            onSubmit={actions.enregistrer}
          />
          <LancerCampagneDialog
            open={aLancer !== null}
            onOpenChange={(ouvert) => {
              if (!ouvert) setALancer(null);
            }}
            campagne={aLancer}
            sites={sites}
            equipes={equipes}
            onLancer={actions.lancer}
          />
        </>
      )}
    </>
  );
}
