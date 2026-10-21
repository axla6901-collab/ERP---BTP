'use client';

import { PencilIcon, PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BoutonConfirmation } from '@/components/test-sirh/bouton-confirmation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { LIBELLES_TYPE_SITE, type TypeSite } from '@/lib/validation/test-sirh/enums';
import type { SiteInput } from '@/lib/validation/test-sirh/organisation';

import { SiteDialog } from './site-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type SiteLigne = {
  id: string;
  code: string | null;
  nom: string;
  typeSite: TypeSite;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
  telephone: string | null;
  actif: boolean;
  notes: string | null;
  nbCollaborateurs: number;
};

type Props = {
  sites: SiteLigne[];
  peutGerer: boolean;
  actions: {
    enregistrer: (input: SiteInput) => Promise<ActionResult<{ id: string }>>;
    supprimer: (id: string) => Promise<ActionResult>;
  };
};

/** Liste des lieux de travail + création / édition en modale + suppression gardée. */
export function SitesSection({ sites, peutGerer, actions }: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);
  const [edite, setEdite] = useState<SiteLigne | null>(null);

  function ouvrir(site: SiteLigne | null) {
    setEdite(site);
    setDialogOuvert(true);
  }

  const colonnes: DataTableColumn<SiteLigne>[] = [
    {
      id: 'nom',
      header: 'Site',
      cell: (s) => (
        <div className="min-w-0">
          <span className="font-medium">{s.nom}</span>
          {s.code && <span className="ml-2 text-xs text-muted-foreground">{s.code}</span>}
        </div>
      ),
      sortAccessor: (s) => s.nom,
      searchAccessor: (s) => `${s.nom} ${s.code ?? ''} ${s.ville ?? ''}`,
    },
    {
      id: 'type',
      header: 'Type',
      cell: (s) => LIBELLES_TYPE_SITE[s.typeSite],
      sortAccessor: (s) => LIBELLES_TYPE_SITE[s.typeSite],
    },
    {
      id: 'ville',
      header: 'Localisation',
      cell: (s) =>
        s.ville ? (
          <span>
            {[s.codePostal, s.ville].filter(Boolean).join(' ')}
            {s.adresseLigne1 && (
              <span className="block text-xs text-muted-foreground">{s.adresseLigne1}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (s) => s.ville,
    },
    {
      id: 'effectif',
      header: 'Collaborateurs',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{s.nbCollaborateurs}</span>,
      sortAccessor: (s) => s.nbCollaborateurs,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (s) =>
        s.actif ? (
          <Badge tone="emerald" shape="pill">
            Actif
          </Badge>
        ) : (
          <Badge tone="neutral" shape="pill">
            Inactif
          </Badge>
        ),
      sortAccessor: (s) => (s.actif ? 0 : 1),
    },
  ];

  if (peutGerer) {
    colonnes.push({
      id: 'actions',
      header: '',
      align: 'right',
      cell: (s) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => ouvrir(s)}
            title="Modifier"
            aria-label={`Modifier ${s.nom}`}
          >
            <PencilIcon className="size-3.5" />
          </Button>
          <BoutonConfirmation
            libelle="Supprimer"
            question="Supprimer ce site ?"
            libelleConfirmer="Supprimer"
            messageSucces="Site supprimé"
            onConfirm={() => actions.supprimer(s.id)}
          />
        </div>
      ),
    });
  }

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={sites}
        rowKey={(s) => s.id}
        searchPlaceholder="Rechercher un site…"
        emptyMessage="Aucun site. Créez le siège, les agences et les dépôts de l'entreprise."
        defaultSort={{ id: 'nom', dir: 'asc' }}
        rowClassName={(s) => (s.actif ? undefined : 'opacity-60')}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => ouvrir(null)}>
              <PlusIcon className="mr-1 size-4" /> Nouveau site
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <SiteDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          site={edite}
          onSubmit={actions.enregistrer}
        />
      )}
    </>
  );
}
