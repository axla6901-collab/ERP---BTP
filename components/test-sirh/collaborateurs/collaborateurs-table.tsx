'use client';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import { PastilleCouleur } from '@/components/test-sirh/statut-badges';
import { differenceJours } from '@/lib/test-sirh/calendrier';
import {
  LIBELLES_COURTS_TYPE_CONTRAT,
  SEUIL_ALERTE_FIN_CONTRAT_JOURS,
  type StatutCollaborateur,
} from '@/lib/test-sirh/collaborateurs/contrats';
import { formatAnciennete, formatDateFr, nomComplet } from '@/lib/test-sirh/format';
import type { TypeContratSirh } from '@/lib/validation/test-sirh/enums';

import { StatutCollaborateurBadge, TypeContratBadge } from './badges';

/** Ligne affichée (sérialisable, aucune donnée sensible — jamais de NIR / IBAN). */
export type CollaborateurLigneUI = {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  statut: StatutCollaborateur;
  posteIntitule: string | null;
  siteNom: string | null;
  managerNom: string | null;
  contrat: { typeContrat: TypeContratSirh; dateDebut: string; dateFin: string | null } | null;
  /** Fin prévue de la relation contractuelle (version en cours non renouvelée). */
  finContratPrevue: string | null;
  equipes: Array<{ id: string; nom: string; couleur: string }>;
  dateAnciennete: string | null;
};

type Props = {
  collaborateurs: CollaborateurLigneUI[];
  today: string;
  /** Préfixe des dossiers : `/<slug>/test-sirh/collaborateurs`. */
  baseHref: string;
  emptyMessage?: string;
};

const EQUIPES_VISIBLES = 2;

function finProche(c: CollaborateurLigneUI, today: string): boolean {
  if (!c.finContratPrevue) return false;
  const jours = differenceJours(today, c.finContratPrevue);
  return jours >= 0 && jours <= SEUIL_ALERTE_FIN_CONTRAT_JOURS;
}

/** Liste des collaborateurs : ligne cliquable vers le dossier. */
export function CollaborateursTable({ collaborateurs, today, baseHref, emptyMessage }: Props) {
  const colonnes: DataTableColumn<CollaborateurLigneUI>[] = [
    {
      id: 'nom',
      header: 'Collaborateur',
      cell: (c) => (
        <div className="min-w-0">
          <span className="font-medium">{nomComplet(c.prenom, c.nom)}</span>
          {c.matricule && (
            <span className="block text-xs text-muted-foreground">Matricule {c.matricule}</span>
          )}
        </div>
      ),
      sortAccessor: (c) => `${c.nom} ${c.prenom}`,
      searchAccessor: (c) => `${c.nom} ${c.prenom} ${c.matricule ?? ''}`,
    },
    {
      id: 'poste',
      header: 'Poste · site',
      cell: (c) =>
        c.posteIntitule || c.siteNom ? (
          <div className="min-w-0">
            <span>{c.posteIntitule ?? '—'}</span>
            {c.siteNom && <span className="block text-xs text-muted-foreground">{c.siteNom}</span>}
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
      sortAccessor: (c) => c.posteIntitule,
      searchAccessor: (c) => `${c.posteIntitule ?? ''} ${c.siteNom ?? ''}`,
    },
    {
      id: 'manager',
      header: 'Manager',
      cell: (c) => c.managerNom ?? <span className="text-muted-foreground">—</span>,
      sortAccessor: (c) => c.managerNom,
      searchAccessor: (c) => c.managerNom,
    },
    {
      id: 'contrat',
      header: 'Contrat',
      cell: (c) =>
        c.contrat ? (
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <TypeContratBadge type={c.contrat.typeContrat} />
            {c.contrat.dateFin && (
              <span
                className={
                  finProche(c, today)
                    ? 'text-xs font-medium text-amber-700 dark:text-amber-400'
                    : 'text-xs text-muted-foreground'
                }
              >
                → {formatDateFr(c.contrat.dateFin)}
              </span>
            )}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground">Aucun contrat en cours</span>
        ),
      sortAccessor: (c) => (c.contrat ? LIBELLES_COURTS_TYPE_CONTRAT[c.contrat.typeContrat] : null),
      searchAccessor: (c) =>
        c.contrat ? LIBELLES_COURTS_TYPE_CONTRAT[c.contrat.typeContrat] : null,
    },
    {
      id: 'equipes',
      header: 'Équipes',
      cell: (c) =>
        c.equipes.length === 0 ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            {c.equipes.slice(0, EQUIPES_VISIBLES).map((e) => (
              <span key={e.id} className="inline-flex items-center gap-1">
                <PastilleCouleur couleur={e.couleur} />
                {e.nom}
              </span>
            ))}
            {c.equipes.length > EQUIPES_VISIBLES && (
              <span className="text-muted-foreground">+{c.equipes.length - EQUIPES_VISIBLES}</span>
            )}
          </span>
        ),
      searchAccessor: (c) => c.equipes.map((e) => e.nom).join(' '),
    },
    {
      id: 'anciennete',
      header: 'Ancienneté',
      cell: (c) => (
        <span className="whitespace-nowrap tabular-nums">
          {formatAnciennete(c.dateAnciennete, today)}
        </span>
      ),
      sortAccessor: (c) => (c.dateAnciennete ? differenceJours(c.dateAnciennete, today) : null),
    },
    {
      id: 'statut',
      header: 'Statut',
      cell: (c) => <StatutCollaborateurBadge statut={c.statut} />,
      sortAccessor: (c) => c.statut,
    },
  ];

  return (
    <DataTable
      columns={colonnes}
      rows={collaborateurs}
      rowKey={(c) => c.id}
      rowHref={(c) => `${baseHref}/${c.id}`}
      rowClassName={(c) =>
        c.statut === 'sorti'
          ? 'opacity-60'
          : finProche(c, today)
            ? 'bg-amber-50/60 hover:bg-amber-50 dark:bg-amber-950/20'
            : undefined
      }
      defaultSort={{ id: 'nom', dir: 'asc' }}
      searchPlaceholder="Rechercher (nom, matricule, poste, site, équipe…)"
      emptyMessage={
        emptyMessage ?? 'Aucun collaborateur. Les collaborateurs sont les employés de la fiche RH.'
      }
    />
  );
}
