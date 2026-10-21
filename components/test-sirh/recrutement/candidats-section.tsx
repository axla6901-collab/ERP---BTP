'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { formatDateFr, nomComplet } from '@/lib/test-sirh/format';
import type { CandidatLigne } from '@/lib/test-sirh/recrutement/queries';
import { LIBELLES_SOURCE_CANDIDAT } from '@/lib/validation/test-sirh/enums';

import { CandidatDialog, type ActionEnregistrerCandidat } from './candidat-dialog';

type Props = {
  candidats: CandidatLigne[];
  /** Préfixe du module : `/<slug>/test-sirh`. */
  base: string;
  today: string;
  peutGerer: boolean;
  actions: { enregistrer: ActionEnregistrerCandidat };
  messageVide?: string | undefined;
};

/** Vivier de candidats : recherche, activité, alerte RGPD, création en modale. */
export function CandidatsSection({
  candidats,
  base,
  today,
  peutGerer,
  actions,
  messageVide,
}: Props) {
  const [dialogOuvert, setDialogOuvert] = useState(false);

  const colonnes: DataTableColumn<CandidatLigne>[] = [
    {
      id: 'nom',
      header: 'Candidat',
      cell: (c) => (
        <div className="min-w-0">
          <span className="font-medium">{nomComplet(c.prenom, c.nom)}</span>
          {c.email && <span className="block text-xs text-muted-foreground">{c.email}</span>}
        </div>
      ),
      sortAccessor: (c) => `${c.nom} ${c.prenom}`,
      searchAccessor: (c) =>
        `${c.nom} ${c.prenom} ${c.email ?? ''} ${c.telephone ?? ''} ${c.ville ?? ''}`,
    },
    {
      id: 'contact',
      header: 'Contact',
      cell: (c) =>
        c.telephone || c.ville ? (
          <span>
            {c.telephone ?? '—'}
            {c.ville && <span className="block text-xs text-muted-foreground">{c.ville}</span>}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: 'source',
      header: 'Source',
      cell: (c) => LIBELLES_SOURCE_CANDIDAT[c.source],
      sortAccessor: (c) => LIBELLES_SOURCE_CANDIDAT[c.source],
    },
    {
      id: 'candidatures',
      header: 'Candidatures',
      align: 'right',
      cell: (c) => (
        <span className="tabular-nums">
          {c.nbActives}
          <span className="text-muted-foreground"> en cours / {c.nbCandidatures}</span>
        </span>
      ),
      sortAccessor: (c) => c.nbActives,
    },
    {
      id: 'activite',
      header: 'Dernière activité',
      cell: (c) => <span className="tabular-nums">{formatDateFr(c.derniereActivite)}</span>,
      sortAccessor: (c) => c.derniereActivite,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (c) =>
        c.employeId ? (
          <Badge tone="emerald" shape="pill">
            Embauché·e
          </Badge>
        ) : c.aPurger ? (
          <Badge tone="rose" shape="pill">
            À purger (RGPD)
          </Badge>
        ) : c.consentementRgpd ? (
          <Badge tone="neutral" shape="pill">
            Consentement RGPD
          </Badge>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (c) => (c.aPurger ? 0 : c.employeId ? 2 : 1),
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={candidats}
        rowKey={(c) => c.id}
        rowHref={(c) => `${base}/recrutement/candidats/${c.id}`}
        searchPlaceholder="Rechercher un candidat (nom, email, ville…)"
        emptyMessage={
          messageVide ?? 'Vivier vide. Ajoutez un candidat ou positionnez-en un sur une offre.'
        }
        defaultSort={{ id: 'nom', dir: 'asc' }}
        rowClassName={(c) => (c.aPurger ? 'bg-rose-50/50 dark:bg-rose-950/20' : undefined)}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setDialogOuvert(true)}>
              <PlusIcon className="mr-1 size-4" /> Nouveau candidat
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <CandidatDialog
          open={dialogOuvert}
          onOpenChange={setDialogOuvert}
          candidat={null}
          today={today}
          onSubmit={actions.enregistrer}
          lienApresCreation={(id) => `${base}/recrutement/candidats/${id}`}
        />
      )}
    </>
  );
}
