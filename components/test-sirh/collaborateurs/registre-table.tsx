'use client';

import { DataTable, type DataTableColumn } from '@/components/ui/data-table';
import type { LigneRegistreNumerotee } from '@/lib/test-sirh/collaborateurs/registre';
import { formatDateFr } from '@/lib/test-sirh/format';
import { LIBELLES_SEXE } from '@/lib/validation/rh';
import {
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
  LIBELLES_TYPE_CONTRAT,
} from '@/lib/validation/test-sirh/enums';

type Props = {
  lignes: LigneRegistreNumerotee[];
  today: string;
  /** Préfixe des dossiers : `/<slug>/test-sirh/collaborateurs`. */
  baseHref: string;
};

const muet = <span className="text-muted-foreground">—</span>;

/**
 * Registre unique du personnel (art. L1221-13 / D1221-23 C. trav.) : une ligne par
 * salarié, dans l'ordre chronologique des entrées (numéro d'ordre).
 */
export function RegistreTable({ lignes, today, baseHref }: Props) {
  const colonnes: DataTableColumn<LigneRegistreNumerotee>[] = [
    {
      id: 'numero',
      header: 'N°',
      align: 'right',
      cell: (l) => <span className="tabular-nums">{l.numero}</span>,
      sortAccessor: (l) => l.numero,
    },
    {
      id: 'nom',
      header: 'Nom, prénoms',
      cell: (l) => (
        <span>
          <span className="font-medium uppercase">{l.nom}</span> {l.prenoms}
        </span>
      ),
      sortAccessor: (l) => `${l.nom} ${l.prenoms}`,
      searchAccessor: (l) => `${l.nom} ${l.prenoms}`,
    },
    {
      id: 'nationalite',
      header: 'Nationalité',
      cell: (l) => l.nationalite ?? muet,
      sortAccessor: (l) => l.nationalite,
      searchAccessor: (l) => l.nationalite,
    },
    {
      id: 'naissance',
      header: 'Naissance',
      cell: (l) => <span className="tabular-nums">{formatDateFr(l.dateNaissance)}</span>,
      sortAccessor: (l) => l.dateNaissance,
    },
    {
      id: 'sexe',
      header: 'Sexe',
      cell: (l) => (l.sexe ? LIBELLES_SEXE[l.sexe] : muet),
    },
    {
      id: 'emploi',
      header: 'Emploi · qualification',
      cell: (l) => (
        <span>
          {l.emploi ?? '—'}
          {(l.qualification || l.categorie) && (
            <span className="block text-xs text-muted-foreground">
              {[
                l.categorie ? LIBELLES_CATEGORIE_PROFESSIONNELLE[l.categorie] : null,
                l.qualification,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </span>
      ),
      sortAccessor: (l) => l.emploi,
      searchAccessor: (l) => `${l.emploi ?? ''} ${l.qualification ?? ''}`,
    },
    {
      id: 'contrat',
      header: 'Contrat',
      cell: (l) => (
        <span>
          {l.typeContrat ? LIBELLES_TYPE_CONTRAT[l.typeContrat] : '—'}
          {l.mentions.length > 0 && (
            <span className="block text-xs text-muted-foreground">{l.mentions.join(' · ')}</span>
          )}
        </span>
      ),
      sortAccessor: (l) => (l.typeContrat ? LIBELLES_TYPE_CONTRAT[l.typeContrat] : null),
      searchAccessor: (l) =>
        `${l.typeContrat ? LIBELLES_TYPE_CONTRAT[l.typeContrat] : ''} ${l.mentions.join(' ')}`,
    },
    {
      id: 'entree',
      header: 'Entrée',
      cell: (l) => <span className="tabular-nums">{formatDateFr(l.dateEntree)}</span>,
      sortAccessor: (l) => l.dateEntree,
    },
    {
      id: 'sortie',
      header: 'Sortie',
      cell: (l) => <span className="tabular-nums">{formatDateFr(l.dateSortie)}</span>,
      sortAccessor: (l) => l.dateSortie,
    },
  ];

  return (
    <DataTable
      columns={colonnes}
      rows={lignes}
      rowKey={(l) => l.employeId}
      rowHref={(l) => `${baseHref}/${l.employeId}`}
      rowClassName={(l) => (l.dateSortie && l.dateSortie < today ? 'opacity-60' : undefined)}
      defaultSort={{ id: 'numero', dir: 'asc' }}
      searchPlaceholder="Rechercher (nom, emploi, contrat…)"
      emptyMessage="Registre vide : aucun employé n'est enregistré dans la fiche RH."
    />
  );
}
