/**
 * Génération des variables de paie depuis les éléments validés — logique PURE
 * (aucune I/O). Équivalent fonctionnel de Factorial `payroll/Supplement` alimenté
 * par `timeoff/Leave`, `attendance/OvertimeRequest` et `expenses/Expense`.
 *
 * - Absence approuvée chevauchant le mois → variable `absence` ; quantité = jours
 *   du type décomptés DANS le mois (`compterJoursAbsence` borné au mois, fériés
 *   exclus). Unité « heures » : durée saisie (au prorata des jours calendaires si
 *   l'absence déborde du mois). Libellé = libellé du type, rubrique =
 *   `code_rubrique_paie` du type.
 * - Heures sup. approuvées compensées en paiement, datées du mois → variable
 *   `heures_supplementaires` ; quantité = durée, libellé avec la majoration.
 * - Note de frais approuvée non remboursée, datée au plus tard du dernier jour du
 *   mois → variable `remboursement_frais` ; montant = TTC.
 * - Idempotence : un élément déjà importé dans la période (`source` + `sourceId`)
 *   n'est jamais régénéré (miroir de l'index unique `uq_sirh_variables_paie_source`).
 */

import { compterJoursAbsence, differenceJours, type IsoDate } from '../calendrier';
import { formatDateFr, versNombre } from '../format';
import { libelleVariableHeuresSup } from '../temps/heures-sup';
import {
  LIBELLES_CATEGORIE_FRAIS,
  type CategorieFrais,
  type CompensationHs,
  type SourceVariable,
  type TypeVariablePaie,
  type UniteDecompte,
} from '@/lib/validation/test-sirh/enums';

import { bornesMois, type MoisPaie } from './periodes';

// ─────────────────────────────────────────────────────────────
// Entrées
// ─────────────────────────────────────────────────────────────

export type AbsencePourPaie = {
  id: string;
  employeId: string;
  dateDebut: IsoDate;
  dateFin: IsoDate;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  /** Durée décomptée figée à l'enregistrement (jours ou heures selon l'unité). */
  duree: string | number;
  typeLibelle: string;
  typeCode: string;
  uniteDecompte: UniteDecompte;
  codeRubriquePaie: string | null;
};

export type HeuresSupPourPaie = {
  id: string;
  employeId: string;
  dateHeures: IsoDate;
  dureeHeures: string | number;
  majorationPct: number;
  compensation: CompensationHs;
  chantierLabel?: string | null;
  motif?: string | null;
};

export type NoteFraisPourPaie = {
  id: string;
  employeId: string;
  dateDepense: IsoDate;
  libelle: string;
  categorie: CategorieFrais;
  montantTtc: string | number;
};

export type SourceImport = Exclude<SourceVariable, 'manuelle'>;

export type CleSource = { source: SourceVariable; sourceId: string | null };

// ─────────────────────────────────────────────────────────────
// Sortie
// ─────────────────────────────────────────────────────────────

export type VariableGeneree = {
  employeId: string;
  typeVariable: TypeVariablePaie;
  libelle: string;
  codeRubrique: string | null;
  /** Décimal normalisé (`numeric`), ou null. */
  quantite: string | null;
  montant: string | null;
  source: SourceImport;
  sourceId: string;
  commentaire: string | null;
};

export type ResultatGeneration = {
  variables: VariableGeneree[];
  parSource: Record<SourceImport, number>;
  ignorees: {
    /** Déjà présentes dans la période (import précédent). */
    dejaImportees: number;
    /** Hors du mois / compensation non payée / statut inattendu. */
    horsPeriode: number;
    /** Quantité ou montant nul (ex. absence ne couvrant qu'un week-end du mois). */
    valeurNulle: number;
  };
};

// ─────────────────────────────────────────────────────────────
// Absences
// ─────────────────────────────────────────────────────────────

const arrondi2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Quantité d'une absence comptée DANS le mois (jours ou heures selon l'unité).
 * - Jours : décompte borné au mois. Les demi-journées ne s'appliquent qu'aux
 *   vraies bornes de l'absence ; le « samedi final » des jours ouvrables est
 *   rattaché au mois où l'absence se termine réellement.
 * - Heures : durée saisie, au prorata des jours calendaires si l'absence déborde.
 */
export function quantiteAbsenceDansMois(
  a: AbsencePourPaie,
  periode: MoisPaie,
  feries: Iterable<IsoDate> = [],
): number {
  const { debut, fin } = bornesMois(periode);
  const debutSegment = a.dateDebut > debut ? a.dateDebut : debut;
  const finSegment = a.dateFin < fin ? a.dateFin : fin;
  if (finSegment < debutSegment) return 0;

  if (a.uniteDecompte === 'heures') {
    const duree = versNombre(a.duree) ?? 0;
    const total = differenceJours(a.dateDebut, a.dateFin) + 1;
    const dansMois = differenceJours(debutSegment, finSegment) + 1;
    if (total <= 0) return 0;
    return arrondi2(dansMois >= total ? duree : (duree * dansMois) / total);
  }

  const vraieFinDansMois = a.dateFin <= fin;
  return compterJoursAbsence({
    dateDebut: debutSegment,
    dateFin: finSegment,
    demiJourneeDebut: a.dateDebut >= debut ? a.demiJourneeDebut : false,
    demiJourneeFin: vraieFinDansMois ? a.demiJourneeFin : false,
    unite: a.uniteDecompte,
    feries,
    samediFinal: vraieFinDansMois,
  });
}

/** Libellé d'une variable d'absence (unité précisée pour les types en heures). */
export function libelleVariableAbsence(
  a: Pick<AbsencePourPaie, 'typeLibelle' | 'uniteDecompte'>,
): string {
  return a.uniteDecompte === 'heures' ? `${a.typeLibelle} (en heures)` : a.typeLibelle;
}

function decimal(n: number): string {
  return n.toFixed(2);
}

/** Clé d'idempotence d'un élément importé : `absence:<uuid>`. */
export function cleSource(source: SourceVariable, sourceId: string): string {
  return `${source}:${sourceId}`;
}
const cle = cleSource;

/**
 * Variables importées dont l'élément d'origine n'est plus valide (absence ou
 * heures sup. annulées / refusées / supprimées, note de frais refusée…) :
 * l'import étant idempotent, elles ne sont jamais mises à jour automatiquement
 * et doivent être revues avant la clôture. `sourcesValides` contient les clés
 * `cleSource` des éléments encore valides.
 */
export function variablesASourceObsolete(
  variables: readonly { id: string; source: SourceVariable; sourceId: string | null }[],
  sourcesValides: ReadonlySet<string>,
): string[] {
  return variables
    .filter(
      (v) =>
        v.source !== 'manuelle' &&
        v.sourceId !== null &&
        !sourcesValides.has(cle(v.source, v.sourceId)),
    )
    .map((v) => v.id);
}

// ─────────────────────────────────────────────────────────────
// Génération
// ─────────────────────────────────────────────────────────────

/**
 * Construit les variables à insérer pour `periode` à partir des éléments validés.
 * Les fériés servent au décompte des absences : `feriesParEmploye` (fériés
 * globaux + ceux du site du collaborateur) l'emporte sur `feries` (globaux).
 */
export function genererVariablesPaie(p: {
  periode: MoisPaie;
  absences?: readonly AbsencePourPaie[];
  heuresSup?: readonly HeuresSupPourPaie[];
  notesFrais?: readonly NoteFraisPourPaie[];
  feries?: readonly IsoDate[];
  feriesParEmploye?: ReadonlyMap<string, readonly IsoDate[]>;
  existantes?: readonly CleSource[];
}): ResultatGeneration {
  const { debut, fin } = bornesMois(p.periode);
  const dejaVues = new Set(
    (p.existantes ?? [])
      .filter((e): e is CleSource & { sourceId: string } => e.sourceId !== null)
      .map((e) => cle(e.source, e.sourceId)),
  );
  const resultat: ResultatGeneration = {
    variables: [],
    parSource: { absence: 0, heures_sup: 0, note_frais: 0 },
    ignorees: { dejaImportees: 0, horsPeriode: 0, valeurNulle: 0 },
  };

  /** L'élément a-t-il déjà été importé (période ou lot courant) ? Compté si oui. */
  function dejaImporte(source: SourceImport, sourceId: string): boolean {
    if (!dejaVues.has(cle(source, sourceId))) return false;
    resultat.ignorees.dejaImportees += 1;
    return true;
  }

  function ajouter(v: VariableGeneree) {
    dejaVues.add(cle(v.source, v.sourceId));
    resultat.variables.push(v);
    resultat.parSource[v.source] += 1;
  }

  for (const a of p.absences ?? []) {
    if (a.dateFin < debut || a.dateDebut > fin) {
      resultat.ignorees.horsPeriode += 1;
      continue;
    }
    if (dejaImporte('absence', a.id)) continue;
    const feries = p.feriesParEmploye?.get(a.employeId) ?? p.feries ?? [];
    const quantite = quantiteAbsenceDansMois(a, p.periode, feries);
    if (quantite <= 0) {
      resultat.ignorees.valeurNulle += 1;
      continue;
    }
    ajouter({
      employeId: a.employeId,
      typeVariable: 'absence',
      libelle: libelleVariableAbsence(a),
      codeRubrique: a.codeRubriquePaie,
      quantite: decimal(quantite),
      montant: null,
      source: 'absence',
      sourceId: a.id,
      commentaire: `Du ${formatDateFr(a.dateDebut)} au ${formatDateFr(a.dateFin)} (${a.typeCode})`,
    });
  }

  for (const h of p.heuresSup ?? []) {
    if (h.dateHeures < debut || h.dateHeures > fin || h.compensation !== 'paiement') {
      resultat.ignorees.horsPeriode += 1;
      continue;
    }
    if (dejaImporte('heures_sup', h.id)) continue;
    const duree = versNombre(h.dureeHeures) ?? 0;
    if (duree <= 0) {
      resultat.ignorees.valeurNulle += 1;
      continue;
    }
    const details = [`Le ${formatDateFr(h.dateHeures)}`, h.chantierLabel, h.motif]
      .filter((s): s is string => Boolean(s && s.trim()))
      .join(' — ');
    ajouter({
      employeId: h.employeId,
      typeVariable: 'heures_supplementaires',
      libelle: libelleVariableHeuresSup(h.majorationPct),
      codeRubrique: null,
      quantite: decimal(duree),
      montant: null,
      source: 'heures_sup',
      sourceId: h.id,
      commentaire: details || null,
    });
  }

  for (const n of p.notesFrais ?? []) {
    // Les notes approuvées tardivement (mois antérieurs) sont rattrapées.
    if (n.dateDepense > fin) {
      resultat.ignorees.horsPeriode += 1;
      continue;
    }
    if (dejaImporte('note_frais', n.id)) continue;
    const montant = versNombre(n.montantTtc) ?? 0;
    if (montant <= 0) {
      resultat.ignorees.valeurNulle += 1;
      continue;
    }
    ajouter({
      employeId: n.employeId,
      typeVariable: 'remboursement_frais',
      libelle: `${LIBELLES_CATEGORIE_FRAIS[n.categorie]} : ${n.libelle}`.slice(0, 200),
      codeRubrique: null,
      quantite: null,
      montant: decimal(montant),
      source: 'note_frais',
      sourceId: n.id,
      commentaire: `Dépense du ${formatDateFr(n.dateDepense)}`,
    });
  }

  return resultat;
}

/** Résumé lisible d'un import : `3 absences, 2 heures sup., 1 note de frais`. */
export function resumeImport(parSource: Record<SourceImport, number>): string {
  const parties: string[] = [];
  const pluriel = (n: number, s: string, p: string) => `${n} ${n > 1 ? p : s}`;
  if (parSource.absence > 0) parties.push(pluriel(parSource.absence, 'absence', 'absences'));
  if (parSource.heures_sup > 0) {
    parties.push(pluriel(parSource.heures_sup, 'demande d’heures sup.', 'demandes d’heures sup.'));
  }
  if (parSource.note_frais > 0) {
    parties.push(pluriel(parSource.note_frais, 'note de frais', 'notes de frais'));
  }
  if (parties.length === 0) return 'aucun nouvel élément';
  if (parties.length === 1) return parties[0]!;
  return `${parties.slice(0, -1).join(', ')} et ${parties[parties.length - 1]!}`;
}
