import {
  LIBELLES_CATEGORIE_FRAIS,
  LIBELLES_NATURE_FRAIS,
  LIBELLES_STATUT_FRAIS,
  type CategorieFrais,
  type NatureFrais,
  type StatutFrais,
} from '@/lib/validation/test-sirh/enums';

import { genererCsv, type ColonneCsv } from '../csv';
import { formatDateFr } from '../format';

/**
 * Export CSV PUR de la liste des notes de frais (comptabilité / paie) — mêmes
 * colonnes que l'écran, montants numériques (virgule décimale, compatible Excel FR).
 */

export type LigneExportNoteFrais = {
  employeNom: string;
  dateDepense: string;
  nature: NatureFrais;
  categorie: CategorieFrais;
  libelle: string;
  montantTtc: number;
  montantTva: number | null;
  distanceKm: number | null;
  tauxKm: number | null;
  nbForfaits: number | null;
  montantUnitaire: number | null;
  chantierLabel: string | null;
  statut: StatutFrais;
  dateRemboursement: string | null;
};

const COLONNES: readonly ColonneCsv<LigneExportNoteFrais>[] = [
  { entete: 'Collaborateur', valeur: (l) => l.employeNom },
  { entete: 'Date', valeur: (l) => formatDateFr(l.dateDepense) },
  { entete: 'Nature', valeur: (l) => LIBELLES_NATURE_FRAIS[l.nature] },
  { entete: 'Catégorie', valeur: (l) => LIBELLES_CATEGORIE_FRAIS[l.categorie] },
  { entete: 'Libellé', valeur: (l) => l.libelle },
  { entete: 'Montant TTC', valeur: (l) => l.montantTtc },
  { entete: 'TVA', valeur: (l) => l.montantTva },
  { entete: 'Distance (km)', valeur: (l) => l.distanceKm },
  { entete: 'Taux (€/km)', valeur: (l) => l.tauxKm },
  { entete: 'Nb forfaits', valeur: (l) => l.nbForfaits },
  { entete: 'Montant unitaire', valeur: (l) => l.montantUnitaire },
  { entete: 'Chantier', valeur: (l) => l.chantierLabel },
  { entete: 'Statut', valeur: (l) => LIBELLES_STATUT_FRAIS[l.statut] },
  {
    entete: 'Remboursée le',
    valeur: (l) => (l.dateRemboursement ? formatDateFr(l.dateRemboursement) : null),
  },
];

export function csvNotesFrais(lignes: readonly LigneExportNoteFrais[]): string {
  return genererCsv(COLONNES, lignes);
}
