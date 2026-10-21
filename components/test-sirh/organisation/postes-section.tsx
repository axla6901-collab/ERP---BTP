'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useMemo, useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import {
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
  type CategorieProfessionnelle,
} from '@/lib/validation/test-sirh/enums';
import type { PosteInput } from '@/lib/validation/test-sirh/organisation';

import { PosteDialog } from './poste-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type PosteLigneUI = {
  id: string;
  code: string | null;
  intitule: string;
  famille: string | null;
  categorie: CategorieProfessionnelle | null;
  niveau: string | null;
  coefficient: string | null;
  description: string | null;
  actif: boolean;
  nbCollaborateurs: number;
  nbContrats: number;
};

type Props = {
  postes: PosteLigneUI[];
  peutGerer: boolean;
  actions: {
    enregistrer: (input: PosteInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Classification lisible : `N2 · coef. 185`. */
export function libelleClassification(p: { niveau: string | null; coefficient: string | null }) {
  const parts = [p.niveau, p.coefficient ? `coef. ${p.coefficient}` : null].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Catalogue des postes + création / édition en modale + suppression gardée. */
export function PostesSection({ postes, peutGerer, actions }: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [edite, setEdite] = useState<PosteLigneUI | null>(null);

  const familles = useMemo(
    () =>
      [...new Set(postes.map((p) => p.famille).filter((f): f is string => Boolean(f)))].sort(
        (a, b) => a.localeCompare(b, 'fr'),
      ),
    [postes],
  );

  function ouvrir(poste: PosteLigneUI | null) {
    setEdite(poste);
    setDialogOuvert(true);
  }

  const colonnes: DataTableColumn<PosteLigneUI>[] = [
    {
      id: 'intitule',
      header: 'Poste',
      cell: (p) => (
        <div className="min-w-0">
          <span className="font-medium">{p.intitule}</span>
          {p.code && <span className="ml-2 text-xs text-muted-foreground">{p.code}</span>}
          {p.description && (
            <span className="block max-w-md truncate text-xs text-muted-foreground">
              {p.description}
            </span>
          )}
        </div>
      ),
      sortAccessor: (p) => p.intitule,
      searchAccessor: (p) => `${p.intitule} ${p.code ?? ''} ${p.famille ?? ''}`,
    },
    {
      id: 'famille',
      header: 'Famille',
      cell: (p) => p.famille ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (p) => p.famille,
    },
    {
      id: 'categorie',
      header: 'Catégorie',
      cell: (p) =>
        p.categorie ? (
          LIBELLES_CATEGORIE_PROFESSIONNELLE[p.categorie]
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (p) => (p.categorie ? LIBELLES_CATEGORIE_PROFESSIONNELLE[p.categorie] : null),
    },
    {
      id: 'classification',
      header: 'Niveau / coef.',
      cell: (p) => libelleClassification(p) ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (p) => libelleClassification(p),
    },
    {
      id: 'collaborateurs',
      header: 'Collaborateurs',
      align: 'right',
      cell: (p) => <span className="tabular-nums">{p.nbCollaborateurs}</span>,
      sortAccessor: (p) => p.nbCollaborateurs,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (p) =>
        p.actif ? (
          <Badge tone="emerald" shape="pill">
            Actif
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Inactif
          </Badge>
        ),
      sortAccessor: (p) => (p.actif ? 0 : 1),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (p) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => ouvrir(p)}
            title="Modifier"
            aria-label={`Modifier ${p.intitule}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer ce poste ?"
            libelleConfirmer="Supprimer"
            messageSucces="Poste supprimé"
            onConfirm={() => actions.supprimer(p.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={postes}
        rowKey={(p) => p.id}
        searchPlaceholder="Rechercher un poste…"
        emptyMessage="Aucun poste. Construisez le catalogue des emplois (maçon, chef d'équipe, conducteur de travaux…)."
        defaultSort={{ id: 'intitule', dir: 'asc' }}
        rowClassName={(p) => (p.actif ? undefined : 'opacity-60')}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouveau poste
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <PosteDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          poste={edite}
          familles={familles}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
