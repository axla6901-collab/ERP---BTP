'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';

import { BarreProgression } from '@/components/test-sirh/entretiens/barre-progression';
import { Button } from '@/components/ui/button';
import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { ActionResult } from '@/lib/common/action-result';
import { libelleDatesSession, tauxRemplissage } from '@/lib/test-sirh/formation/validite';
import { formatEuro } from '@/lib/test-sirh/format';
import type { StatutSession } from '@/lib/validation/test-sirh/enums';
import type { SessionInput } from '@/lib/validation/test-sirh/formation';

import { StatutSessionBadge } from './badges';
import { SessionDialog, type FormationOptionUI } from './session-dialog';

/** Ligne affichée (sérialisable, préparée par la page serveur). */
export type SessionLigneUI = {
  id: string;
  formationId: string;
  formationIntitule: string;
  formationCode: string | null;
  dateDebut: string;
  dateFin: string;
  lieu: string | null;
  formateur: string | null;
  placesMax: number | null;
  statut: StatutSession;
  nbInscrits: number;
  nbPresents: number;
  coutEstime: number;
};

type Props = {
  sessions: SessionLigneUI[];
  /** Préfixe `/<slug>/test-sirh`. */
  base: string;
  peutGerer: boolean;
  formations: FormationOptionUI[];
  /** Date du jour (serveur) : signale les sessions terminées non clôturées. */
  today: string;
  enregistrer: (input: SessionInput) => Promise<ActionResult<{ id: string }>>;
};

/** Sessions de formation (ligne cliquable → participants) + création en modale. */
export function SessionsSection({
  sessions,
  base,
  peutGerer,
  formations,
  today,
  enregistrer,
}: Props) {
  const [ouvert, setOuvert] = useState(false);

  const colonnes: DataTableColumn<SessionLigneUI>[] = [
    {
      id: 'formation',
      header: 'Formation',
      cell: (s) => (
        <div className="min-w-0">
          <span className="font-medium">{s.formationIntitule}</span>
          {s.formationCode && (
            <span className="ml-2 text-xs text-muted-foreground">{s.formationCode}</span>
          )}
        </div>
      ),
      sortAccessor: (s) => s.formationIntitule,
      searchAccessor: (s) =>
        `${s.formationIntitule} ${s.formationCode ?? ''} ${s.lieu ?? ''} ${s.formateur ?? ''}`,
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: (s) => (
        <span className="whitespace-nowrap tabular-nums">
          {libelleDatesSession(s.dateDebut, s.dateFin)}
          {s.dateFin < today && (s.statut === 'planifiee' || s.statut === 'confirmee') && (
            <span className="block text-xs text-amber-700">À clôturer</span>
          )}
        </span>
      ),
      sortAccessor: (s) => s.dateDebut,
    },
    {
      id: 'lieu',
      header: 'Lieu / formateur',
      cell: (s) =>
        s.lieu || s.formateur ? (
          <span>
            {s.lieu ?? '—'}
            {s.formateur && (
              <span className="block text-xs text-muted-foreground">{s.formateur}</span>
            )}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (s) => s.lieu,
    },
    {
      id: 'participants',
      header: 'Participants',
      cell: (s) => {
        const taux = tauxRemplissage(s.placesMax, s.nbInscrits);
        return (
          <div className="w-32 space-y-1">
            <span className="text-xs tabular-nums">
              {s.nbInscrits}
              {s.placesMax !== null ? ` / ${s.placesMax}` : ''} inscrit{s.nbInscrits > 1 ? 's' : ''}
            </span>
            {taux !== null && (
              <BarreProgression
                valeur={taux}
                ton={taux >= 100 ? 'rose' : 'amber'}
                libelle={`Remplissage ${s.formationIntitule}`}
              />
            )}
          </div>
        );
      },
      sortAccessor: (s) => s.nbInscrits,
    },
    {
      id: 'cout',
      header: 'Coût HT',
      align: 'right',
      cell: (s) => <span className="tabular-nums">{formatEuro(s.coutEstime)}</span>,
      sortAccessor: (s) => s.coutEstime,
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (s) => <StatutSessionBadge statut={s.statut} />,
      sortAccessor: (s) => s.statut,
    },
  ];

  return (
    <>
      <DataTable
        columns={colonnes}
        rows={sessions}
        rowKey={(s) => s.id}
        rowHref={(s) => `${base}/formation/sessions/${s.id}`}
        searchPlaceholder="Rechercher une formation, un lieu, un formateur…"
        emptyMessage="Aucune session pour ce filtre."
        rowClassName={(s) => (s.statut === 'annulee' ? 'opacity-60' : undefined)}
        rightActions={
          peutGerer ? (
            <Button size="sm" onClick={() => setOuvert(true)}>
              <PlusIcon className="mr-1 size-4" /> Nouvelle session
            </Button>
          ) : null
        }
      />
      {peutGerer && (
        <SessionDialog
          open={ouvert}
          onOpenChange={setOuvert}
          session={null}
          formations={formations}
          onSubmit={enregistrer}
          lienFiche={(id) => `${base}/formation/sessions/${id}`}
        />
      )}
    </>
  );
}
