/**
 * Synthèse de préparation de paie et export CSV — logique PURE (aucune I/O).
 * Équivalent fonctionnel de Factorial `payroll_integrations_base/Code` : chaque
 * variable porte un code rubrique ; l'export liste matricule, nom, prénom,
 * rubrique, libellé, quantité et montant pour le logiciel de paie.
 */

import { genererCsv, type ColonneCsv } from '../csv';
import { versNombre } from '../format';
import type { TypeVariablePaie } from '@/lib/validation/test-sirh/enums';

export type VariablePourSynthese = {
  employeId: string;
  typeVariable: TypeVariablePaie;
  libelle: string;
  codeRubrique: string | null;
  quantite: string | number | null;
  montant: string | number | null;
  /** Majoration des heures sup. importées (jointure sur la demande), sinon null. */
  majorationPct: number | null;
};

export type EmployeSynthese = {
  id: string;
  nom: string;
  prenom: string;
  matricule: string | null;
};

export type LigneSynthese = {
  employe: EmployeSynthese;
  /** Quantités d'absence cumulées par libellé (type d'absence). */
  absences: { libelle: string; quantite: number }[];
  heuresSup25: number;
  heuresSup50: number;
  /** Autres taux (0, 10, 100 %) et heures sup. saisies manuellement. */
  heuresSupAutres: number;
  /** Σ montants des primes et indemnités. */
  primes: number;
  /** Σ montants des remboursements de frais. */
  frais: number;
  /** Nombre d'autres variables (avances, acomptes, retenues, avantages, autres). */
  nbAutres: number;
  nbVariables: number;
};

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

const TYPES_PRIMES: readonly TypeVariablePaie[] = ['prime', 'indemnite'];

/** Synthèse par collaborateur, triée par nom puis prénom. */
export function syntheseParEmploye(
  variables: readonly VariablePourSynthese[],
  employes: readonly EmployeSynthese[],
): LigneSynthese[] {
  const indexEmployes = new Map(employes.map((e) => [e.id, e]));
  const lignes = new Map<string, LigneSynthese & { absencesMap: Map<string, number> }>();

  for (const v of variables) {
    const employe = indexEmployes.get(v.employeId) ?? {
      id: v.employeId,
      nom: '—',
      prenom: '',
      matricule: null,
    };
    const l = lignes.get(v.employeId) ?? {
      employe,
      absences: [],
      absencesMap: new Map<string, number>(),
      heuresSup25: 0,
      heuresSup50: 0,
      heuresSupAutres: 0,
      primes: 0,
      frais: 0,
      nbAutres: 0,
      nbVariables: 0,
    };
    const quantite = versNombre(v.quantite) ?? 0;
    const montant = versNombre(v.montant) ?? 0;
    l.nbVariables += 1;

    switch (v.typeVariable) {
      case 'absence':
        l.absencesMap.set(v.libelle, (l.absencesMap.get(v.libelle) ?? 0) + quantite);
        break;
      case 'heures_supplementaires':
        if (v.majorationPct === 25) l.heuresSup25 += quantite;
        else if (v.majorationPct === 50) l.heuresSup50 += quantite;
        else l.heuresSupAutres += quantite;
        break;
      case 'remboursement_frais':
        l.frais += montant;
        break;
      default:
        if (TYPES_PRIMES.includes(v.typeVariable)) l.primes += montant;
        else l.nbAutres += 1;
    }
    lignes.set(v.employeId, l);
  }

  return [...lignes.values()]
    .map(({ absencesMap, ...l }) => ({
      ...l,
      absences: [...absencesMap.entries()]
        .map(([libelle, quantite]) => ({ libelle, quantite: arrondi2(quantite) }))
        .sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr')),
      heuresSup25: arrondi2(l.heuresSup25),
      heuresSup50: arrondi2(l.heuresSup50),
      heuresSupAutres: arrondi2(l.heuresSupAutres),
      primes: arrondi2(l.primes),
      frais: arrondi2(l.frais),
    }))
    .sort(
      (a, b) =>
        a.employe.nom.localeCompare(b.employe.nom, 'fr') ||
        a.employe.prenom.localeCompare(b.employe.prenom, 'fr'),
    );
}

/** Totaux de la période (Σ montants, Σ quantités d'heures sup.). */
export function totauxVariables(variables: readonly VariablePourSynthese[]): {
  nbVariables: number;
  nbEmployes: number;
  montantTotal: number;
  heuresSup: number;
} {
  const employes = new Set<string>();
  let montantTotal = 0;
  let heuresSup = 0;
  for (const v of variables) {
    employes.add(v.employeId);
    montantTotal += versNombre(v.montant) ?? 0;
    if (v.typeVariable === 'heures_supplementaires') heuresSup += versNombre(v.quantite) ?? 0;
  }
  return {
    nbVariables: variables.length,
    nbEmployes: employes.size,
    montantTotal: arrondi2(montantTotal),
    heuresSup: arrondi2(heuresSup),
  };
}

// ─────────────────────────────────────────────────────────────
// Export CSV (logiciel de paie)
// ─────────────────────────────────────────────────────────────

export type LigneExportPaie = {
  matricule: string | null;
  nom: string;
  prenom: string;
  codeRubrique: string | null;
  libelle: string;
  quantite: string | number | null;
  montant: string | number | null;
};

/** Décimal à 2 chiffres et virgule (`7.5` → `7,50`) ; vide si absent. */
export function nombreCsv(v: string | number | null | undefined): string {
  const n = versNombre(v);
  return n === null ? '' : n.toFixed(2).replace('.', ',');
}

export const COLONNES_EXPORT_PAIE: readonly ColonneCsv<LigneExportPaie>[] = [
  { entete: 'Matricule', valeur: (l) => l.matricule ?? '' },
  { entete: 'Nom', valeur: (l) => l.nom },
  { entete: 'Prénom', valeur: (l) => l.prenom },
  { entete: 'Rubrique', valeur: (l) => l.codeRubrique ?? '' },
  { entete: 'Libellé', valeur: (l) => l.libelle },
  { entete: 'Quantité', valeur: (l) => nombreCsv(l.quantite) },
  { entete: 'Montant', valeur: (l) => nombreCsv(l.montant) },
];

/** CSV des variables (trié par nom, prénom, rubrique, libellé). */
export function genererCsvPaie(lignes: readonly LigneExportPaie[]): string {
  const triees = [...lignes].sort(
    (a, b) =>
      a.nom.localeCompare(b.nom, 'fr') ||
      a.prenom.localeCompare(b.prenom, 'fr') ||
      (a.codeRubrique ?? '').localeCompare(b.codeRubrique ?? '', 'fr') ||
      a.libelle.localeCompare(b.libelle, 'fr'),
  );
  return genererCsv(COLONNES_EXPORT_PAIE, triees);
}
