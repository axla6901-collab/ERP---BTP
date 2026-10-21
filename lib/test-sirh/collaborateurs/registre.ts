/**
 * Registre unique du personnel — mise en forme PURE (numérotation, colonnes
 * CSV). Les lignes sont construites par `construireLigneRegistre` (contrats.ts).
 *
 * Mentions obligatoires (art. D1221-23 C. trav.) : nom, prénoms, nationalité,
 * date de naissance, sexe, emploi, qualification, dates d'entrée et de sortie,
 * type de contrat (CDD, temps partiel, apprentissage / professionnalisation,
 * travail temporaire + entreprise de travail temporaire, stagiaires).
 */

import type { ColonneCsv } from '../csv';
import { formatDateFr } from '../format';
import { LIBELLES_SEXE } from '@/lib/validation/rh';
import {
  LIBELLES_CATEGORIE_PROFESSIONNELLE,
  LIBELLES_TYPE_CONTRAT,
} from '@/lib/validation/test-sirh/enums';

import { trierRegistre, type LigneRegistre } from './contrats';

export type LigneRegistreNumerotee = LigneRegistre & {
  /** Numéro d'ordre (ordre chronologique des entrées). */
  numero: number;
};

/** Trie chronologiquement puis numérote à partir de 1. */
export function numeroterRegistre(lignes: readonly LigneRegistre[]): LigneRegistreNumerotee[] {
  return trierRegistre(lignes).map((l, i) => ({ ...l, numero: i + 1 }));
}

/** Date ISO → `JJ/MM/AAAA` pour Excel, cellule vide si absente. */
function dateCsv(iso: string | null): string | null {
  return iso ? formatDateFr(iso) : null;
}

export const COLONNES_CSV_REGISTRE: readonly ColonneCsv<LigneRegistreNumerotee>[] = [
  { entete: 'N° d’ordre', valeur: (l) => l.numero },
  { entete: 'Nom', valeur: (l) => l.nom },
  { entete: 'Prénoms', valeur: (l) => l.prenoms },
  { entete: 'Nationalité', valeur: (l) => l.nationalite },
  { entete: 'Date de naissance', valeur: (l) => dateCsv(l.dateNaissance) },
  { entete: 'Sexe', valeur: (l) => (l.sexe ? LIBELLES_SEXE[l.sexe] : null) },
  { entete: 'Emploi', valeur: (l) => l.emploi },
  { entete: 'Qualification', valeur: (l) => l.qualification },
  {
    entete: 'Catégorie',
    valeur: (l) => (l.categorie ? LIBELLES_CATEGORIE_PROFESSIONNELLE[l.categorie] : null),
  },
  {
    entete: 'Type de contrat',
    valeur: (l) => (l.typeContrat ? LIBELLES_TYPE_CONTRAT[l.typeContrat] : null),
  },
  { entete: 'Mentions', valeur: (l) => l.mentions.join(' / ') },
  { entete: 'Entreprise de travail temporaire', valeur: (l) => l.agenceInterim },
  { entete: 'Date d’entrée', valeur: (l) => dateCsv(l.dateEntree) },
  { entete: 'Date de sortie', valeur: (l) => dateCsv(l.dateSortie) },
];
