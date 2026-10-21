'use client';

import { PencilIcon, PlusIcon, UsersIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import type { OptionListe } from '@/components/test-sirh/option-select';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import type { EquipeInput, MembreEquipeInput } from '@/lib/validation/test-sirh/organisation';

import { EquipeDialog, type OptionEmployeEquipe } from './equipe-dialog';
import { MembresEquipeDialog, type MembreLigne } from './membres-equipe-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type EquipeLigneUI = {
  id: string;
  nom: string;
  description: string | null;
  responsableId: string | null;
  responsableNom: string | null;
  siteId: string | null;
  siteNom: string | null;
  couleur: string;
  actif: boolean;
  /** Membres actifs à la date du jour. */
  effectif: number;
};

type Props = {
  equipes: EquipeLigneUI[];
  membres: MembreLigne[];
  employes: OptionEmployeEquipe[];
  sites: OptionListe[];
  peutGerer: boolean;
  today: string;
  actions: {
    enregistrer: (input: EquipeInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
    enregistrerMembre: (input: MembreEquipeInput) => Promise<ActionResult<{ id: string }>>;
    retirerMembre: (id: string) => Promise<ActionResult>;
  };
};

/** Liste des équipes + création / édition en modale + gestion des membres + suppression gardée. */
export function EquipesSection({
  equipes,
  membres,
  employes,
  sites,
  peutGerer,
  today,
  actions,
}: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [edite, setEdite] = useState<EquipeLigneUI | null>(null);
  const [membresDe, setMembresDe] = useState<EquipeLigneUI | null>(null);

  function ouvrir(equipe: EquipeLigneUI | null) {
    setEdite(equipe);
    setDialogOuvert(true);
  }

  const membresEquipe = useMemo(
    () => (membresDe ? membres.filter((m) => m.equipeId === membresDe.id) : []),
    [membres, membresDe],
  );

  const colonnes: DataTableColumn<EquipeLigneUI>[] = [
    {
      id: 'nom',
      header: 'Équipe',
      cell: (e) => (
        <div className="min-w-0">
          <span className="flex items-center gap-2">
            <PastilleCouleur couleur={e.couleur} />
            <span className="font-medium">{e.nom}</span>
          </span>
          {e.description && (
            <span className="block max-w-md truncate text-xs text-muted-foreground">
              {e.description}
            </span>
          )}
        </div>
      ),
      sortAccessor: (e) => e.nom,
      searchAccessor: (e) => `${e.nom} ${e.description ?? ''}`,
    },
    {
      id: 'responsable',
      header: 'Responsable',
      cell: (e) => e.responsableNom ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (e) => e.responsableNom,
      searchAccessor: (e) => e.responsableNom,
    },
    {
      id: 'site',
      header: 'Site',
      cell: (e) => e.siteNom ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (e) => e.siteNom,
      searchAccessor: (e) => e.siteNom,
    },
    {
      id: 'effectif',
      header: 'Effectif',
      align: 'right',
      cell: (e) => <span className="tabular-nums">{e.effectif}</span>,
      sortAccessor: (e) => e.effectif,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (e) =>
        e.actif ? (
          <Badge tone="emerald" shape="pill">
            Active
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Inactive
          </Badge>
        ),
      sortAccessor: (e) => (e.actif ? 0 : 1),
    },
    {
      id: 'actions',
      header: '',
      align: 'right',
      cell: (e) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setMembresDe(e)}
            aria-label={`Membres de ${e.nom}`}
          >
            <UsersIcon className="mr-1 size-3.5" /> Membres
          </Button>
          {peutGerer && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => ouvrir(e)}
                title="Modifier"
                aria-label={`Modifier ${e.nom}`}
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <BoutonConfirmation
                libelle="Supprimer"
                question="Supprimer cette équipe ?"
                libelleConfirmer="Supprimer"
                messageSucces="Équipe supprimée"
                onConfirm={() => actions.supprimer(e.id)}
              />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={equipes}
        rowKey={(e) => e.id}
        searchPlaceholder="Rechercher une équipe…"
        emptyMessage="Aucune équipe. Créez les équipes de chantier et les services de l'entreprise."
        defaultSort={{ id: 'nom', dir: 'asc' }}
        rowClassName={(e) => (e.actif ? undefined : 'opacity-60')}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle équipe
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <EquipeDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          equipe={edite}
          employes={employes}
          sites={sites}
          onSubmit={actions.enregistrer}
        />
      )}
      <MembresEquipeDialog
        open={membresDe !== null}
        onOpenChange={(o) => {
          if (!o) setMembresDe(null);
        }}
        equipe={membresDe}
        membres={membresEquipe}
        employes={employes}
        peutGerer={peutGerer}
        today={today}
        actions={{ enregistrer: actions.enregistrerMembre, retirer: actions.retirerMembre }}
      />
    </>
  );
}
