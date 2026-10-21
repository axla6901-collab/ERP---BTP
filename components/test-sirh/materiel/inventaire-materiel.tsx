'use client';

import { HistoryIcon, PencilIcon, PlusIcon, UndoIcon, UserPlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { formatDateFr, formatEuro } from '@/lib/test-sirh/format';
import type { MaterielLigne } from '@/lib/test-sirh/materiel/queries';
import { alerteControle, peutAttribuer } from '@/lib/test-sirh/materiel/regles';
import { LIBELLES_CATEGORIE_MATERIEL } from '@/lib/validation/test-sirh/enums';
import type {
  AttributionMaterielInput,
  MaterielInput,
  RestitutionMaterielInput,
} from '@/lib/validation/test-sirh/materiel';

import { AttributionMaterielDialog } from './attribution-dialog';
import { ControleMateriel, StatutMaterielBadge } from './badges-materiel';
import { HistoriqueMaterielDialog } from './historique-materiel-dialog';
import { MaterielDialog } from './materiel-dialog';
import { RestitutionMaterielDialog } from './restitution-dialog';

export type ActionsMateriel = {
  enregistrer: (input: MaterielInput) => Promise<ActionResult<{ id: string }>>;
  supprimer: (id: string) => Promise<ActionResult>;
  attribuer: (input: AttributionMaterielInput) => Promise<ActionResult<{ id: string }>>;
  restituer: (input: RestitutionMaterielInput) => Promise<ActionResult>;
};

type Props = {
  materiels: MaterielLigne[];
  /** Date du jour (serveur) : alertes de contrôle et dates par défaut. */
  today: string;
  peutGerer: boolean;
  /** Collaborateurs actifs (attribution). */
  employes: readonly OptionListe[];
  actions: ActionsMateriel;
};

/**
 * Inventaire du matériel & des EPI : statut, détenteur, contrôle périodique,
 * valeur — et, pour la gestion RH, fiche, attribution, restitution, historique,
 * suppression (refusée par le serveur si l'objet a déjà été attribué).
 */
export function InventaireMateriel({ materiels, today, peutGerer, employes, actions }: Props) {
  const [ficheOuverte, setFicheOuverte] = useState(false);
  const [edite, setEdite] = useState<MaterielLigne | null>(null);
  const [aAttribuer, setAAttribuer] = useState<MaterielLigne | null>(null);
  const [aRestituer, setARestituer] = useState<MaterielLigne | null>(null);
  const [historique, setHistorique] = useState<MaterielLigne | null>(null);

  // Objet stable : la modale de restitution se réinitialise quand il change.
  const restitution = useMemo(
    () =>
      aRestituer?.detenteur
        ? {
            id: aRestituer.id,
            libelle: aRestituer.libelle,
            detenteurNom: aRestituer.detenteur.employeNom,
            dateRemise: aRestituer.detenteur.dateRemise,
          }
        : null,
    [aRestituer],
  );

  function ouvrirFiche(m: MaterielLigne | null) {
    setEdite(m);
    setFicheOuverte(true);
  }

  const colonnes: DataTableColumn<MaterielLigne>[] = [
    {
      id: 'libelle',
      header: 'Matériel',
      cell: (m) => (
        <div className="min-w-0">
          <span className="block font-medium">{m.libelle}</span>
          {(m.marque || m.modele) && (
            <span className="block text-xs text-muted-foreground">
              {[m.marque, m.modele].filter(Boolean).join(' ')}
            </span>
          )}
        </div>
      ),
      sortAccessor: (m) => m.libelle,
      searchAccessor: (m) =>
        `${m.libelle} ${m.marque ?? ''} ${m.modele ?? ''} ${m.numeroSerie ?? ''} ${m.detenteur?.employeNom ?? ''}`,
    },
    {
      id: 'categorie',
      header: 'Catégorie',
      cell: (m) => LIBELLES_CATEGORIE_MATERIEL[m.categorie],
      sortAccessor: (m) => LIBELLES_CATEGORIE_MATERIEL[m.categorie],
    },
    {
      id: 'serie',
      header: 'N° série / taille',
      cell: (m) =>
        m.numeroSerie || m.taille ? (
          <span className="text-xs">
            {m.numeroSerie && <span className="block font-mono">{m.numeroSerie}</span>}
            {m.taille && <span className="block text-muted-foreground">Taille {m.taille}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (m) => m.numeroSerie,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (m) => <StatutMaterielBadge statut={m.statut} />,
      sortAccessor: (m) => m.statut,
    },
    {
      id: 'detenteur',
      header: 'Détenteur',
      cell: (m) =>
        m.detenteur ? (
          <div>
            <span className="block">{m.detenteur.employeNom}</span>
            <span className="block text-xs text-muted-foreground">
              depuis le {formatDateFr(m.detenteur.dateRemise)}
              {!m.detenteur.dechargeSignee && (
                <Badge tone="amber" className="ml-1">
                  Décharge non signée
                </Badge>
              )}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (m) => m.detenteur?.employeNom ?? null,
    },
    {
      id: 'controle',
      header: 'Contrôle',
      cell: (m) => (
        <ControleMateriel dateControle={m.dateControle} today={today} statut={m.statut} />
      ),
      sortAccessor: (m) => m.dateControle,
    },
    {
      id: 'valeur',
      header: 'Valeur',
      align: 'right',
      cell: (m) => <span className="tabular-nums">{formatEuro(m.valeurAchat)}</span>,
      sortAccessor: (m) => m.valeurAchat,
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (m) => (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {peutGerer && peutAttribuer(m.statut) && (
            <Button variant="outline" size="sm" onClick={() => setAAttribuer(m)}>
              <UserPlusIcon className="size-3.5" /> Attribuer
            </Button>
          )}
          {peutGerer && m.detenteur && (
            <Button variant="outline" size="sm" onClick={() => setARestituer(m)}>
              <UndoIcon className="size-3.5" /> Restituer
            </Button>
          )}
          {m.historique.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setHistorique(m)}
              title="Historique des attributions"
              aria-label={`Historique de ${m.libelle}`}
            >
              <HistoryIcon className="size-3.5" />
            </Button>
          )}
          {peutGerer && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => ouvrirFiche(m)}
              title="Modifier"
              aria-label={`Modifier ${m.libelle}`}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          )}
          {peutGerer && m.historique.length === 0 && (
            <BoutonConfirmation
              libelle="Supprimer"
              question="Supprimer ce matériel ?"
              libelleConfirmer="Supprimer"
              messageSucces="Matériel supprimé"
              onConfirm={() => actions.supprimer(m.id)}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={materiels}
        rowKey={(m) => m.id}
        searchPlaceholder="Rechercher (libellé, n° de série, détenteur)…"
        emptyMessage="Aucun matériel pour ces critères."
        defaultSort={{ id: 'libelle', dir: 'asc' }}
        rowClassName={(m) => {
          if (m.statut === 'reforme' || m.statut === 'perdu') return 'opacity-60';
          return alerteControle(m.dateControle, today, m.statut) === 'depassee'
            ? 'bg-rose-50/40 dark:bg-rose-950/10'
            : undefined;
        }}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrirFiche(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouveau matériel
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <>
          <MaterielDialog
            open={ficheOuverte}
            onOpenChange={setFicheOuverte}
            materiel={edite}
            onSubmit={actions.enregistrer}
          />
          <AttributionMaterielDialog
            materiel={aAttribuer}
            employes={employes}
            today={today}
            onClose={() => setAAttribuer(null)}
            onSubmit={actions.attribuer}
          />
          <RestitutionMaterielDialog
            materiel={restitution}
            today={today}
            onClose={() => setARestituer(null)}
            onSubmit={actions.restituer}
          />
        </>
      )}
      <HistoriqueMaterielDialog materiel={historique} onClose={() => setHistorique(null)} />
    </>
  );
}
