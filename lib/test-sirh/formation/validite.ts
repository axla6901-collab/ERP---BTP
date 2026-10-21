/**
 * Formation : validité des qualifications, remplissage des sessions et
 * agrégats annuels — module PUR (aucune I/O), importable client comme serveur.
 *
 * Conventions de calcul :
 * - Une qualification obtenue (inscription « réussie ») est valable jusqu'à
 *   `date de fin de session + validité de la formation (mois)` ; une formation
 *   sans validité donne une qualification permanente (`dateValidite` = null).
 * - Statut : expirée (date dépassée) / à recycler (≤ 90 j) / valide.
 * - Une inscription annulée libère sa place ; les autres l'occupent.
 * - Coût d'une session : son coût HT s'il est saisi, sinon coût catalogue
 *   (par participant) × participants non annulés. Session annulée = 0.
 * - Heures : heures réalisées de chaque présent, à défaut la durée catalogue.
 */

import { ajouterMois, differenceJours, type IsoDate } from '../calendrier';
import { formatDateFr, versNombre } from '../format';
import type {
  ResultatFormation,
  StatutInscription,
  StatutSession,
} from '@/lib/validation/test-sirh/enums';

/** Une qualification qui expire dans N jours ou moins est « à recycler ». */
export const SEUIL_RECYCLAGE_JOURS = 90;

export type StatutQualification = 'valide' | 'a_recycler' | 'expiree';

export const LIBELLES_STATUT_QUALIFICATION: Record<StatutQualification, string> = {
  valide: 'Valide',
  a_recycler: 'À recycler',
  expiree: 'Expirée',
};

/** Statuts d'inscription qui occupent une place de la session. */
export const STATUTS_INSCRIPTION_OCCUPANT: readonly StatutInscription[] = [
  'inscrit',
  'present',
  'absent',
];

/** Statuts de session encore à venir (inscriptions possibles, recyclage « planifié »). */
export const STATUTS_SESSION_A_VENIR: readonly StatutSession[] = ['planifiee', 'confirmee'];

// ─────────────────────────────────────────────────────────────
// Validité des qualifications
// ─────────────────────────────────────────────────────────────

/** Échéance de la qualification ; `null` = sans échéance (formation sans validité). */
export function dateValiditeQualification(
  dateFinSession: IsoDate,
  validiteMois: number | null,
): IsoDate | null {
  if (validiteMois === null || !Number.isFinite(validiteMois) || validiteMois <= 0) return null;
  return ajouterMois(dateFinSession, validiteMois);
}

/** Date de validité à enregistrer sur une inscription selon son résultat. */
export function dateValiditeInscription(
  resultat: ResultatFormation,
  dateFinSession: IsoDate,
  validiteMois: number | null,
): IsoDate | null {
  return resultat === 'reussi' ? dateValiditeQualification(dateFinSession, validiteMois) : null;
}

export function statutQualification(
  dateValidite: IsoDate | null,
  today: IsoDate,
  seuilJours: number = SEUIL_RECYCLAGE_JOURS,
): StatutQualification {
  if (!dateValidite) return 'valide';
  if (dateValidite < today) return 'expiree';
  return differenceJours(today, dateValidite) <= seuilJours ? 'a_recycler' : 'valide';
}

/** Jours restants avant expiration (négatif si expirée), `null` sans échéance. */
export function joursAvantExpiration(dateValidite: IsoDate | null, today: IsoDate): number | null {
  return dateValidite ? differenceJours(today, dateValidite) : null;
}

/** Libellé lisible d'une durée de validité : `24` → `2 ans`, `18` → `18 mois`, null → `Sans échéance`. */
export function libelleValidite(validiteMois: number | null): string {
  if (validiteMois === null || validiteMois <= 0) return 'Sans échéance';
  if (validiteMois % 12 === 0) {
    const ans = validiteMois / 12;
    return `${ans} an${ans > 1 ? 's' : ''}`;
  }
  return `${validiteMois} mois`;
}

// ─────────────────────────────────────────────────────────────
// Remplissage des sessions
// ─────────────────────────────────────────────────────────────

/** Dates d'une session : `03/11/2026` (un jour) ou `03/11/2026 → 04/11/2026`. */
export function libelleDatesSession(dateDebut: IsoDate, dateFin: IsoDate): string {
  return dateDebut === dateFin
    ? formatDateFr(dateDebut)
    : `${formatDateFr(dateDebut)} → ${formatDateFr(dateFin)}`;
}

export function compterOccupants(statuts: readonly StatutInscription[]): number {
  return statuts.filter((s) => STATUTS_INSCRIPTION_OCCUPANT.includes(s)).length;
}

/** Places restantes (jamais négatif) ; `null` si la session n'a pas de jauge. */
export function placesRestantes(placesMax: number | null, occupants: number): number | null {
  if (placesMax === null) return null;
  return Math.max(0, placesMax - occupants);
}

/** Taux de remplissage en % arrondi (peut dépasser 100) ; `null` sans jauge. */
export function tauxRemplissage(placesMax: number | null, occupants: number): number | null {
  if (placesMax === null || placesMax <= 0) return null;
  return Math.round((occupants * 100) / placesMax);
}

/** Ajout de `aAjouter` participants : refusé au-delà de `placesMax`. */
export function verifierCapacite(
  placesMax: number | null,
  occupants: number,
  aAjouter: number,
): { ok: true } | { ok: false; restantes: number } {
  if (placesMax === null || occupants + aAjouter <= placesMax) return { ok: true };
  return { ok: false, restantes: Math.max(0, placesMax - occupants) };
}

// ─────────────────────────────────────────────────────────────
// Heures & coûts
// ─────────────────────────────────────────────────────────────

type Num = number | string | null;

/** Heures retenues pour un participant présent : heures réalisées, sinon durée catalogue. */
export function heuresParticipant(heuresRealisees: Num, dureeHeures: Num): number {
  return versNombre(heuresRealisees) ?? versNombre(dureeHeures) ?? 0;
}

export type SessionPourAgregat = {
  dateDebut: IsoDate;
  statut: StatutSession;
  coutHt: Num;
  formationCoutHt: Num;
  formationDureeHeures: Num;
  inscriptions: ReadonlyArray<{ statut: StatutInscription; heuresRealisees: Num }>;
};

/** Coût HT d'une session (cf. conventions en tête de module). */
export function coutSession(s: SessionPourAgregat): number {
  if (s.statut === 'annulee') return 0;
  const saisi = versNombre(s.coutHt);
  if (saisi !== null) return saisi;
  const unitaire = versNombre(s.formationCoutHt);
  if (unitaire === null) return 0;
  const participants = s.inscriptions.filter((i) => i.statut !== 'annule').length;
  return Math.round(unitaire * participants * 100) / 100;
}

export type AgregatFormation = {
  heures: number;
  cout: number;
  nbSessions: number;
  nbParticipants: number;
};

/** Heures (présents), coût et volumes des sessions non annulées débutant en `annee`. */
export function agregerFormationAnnee(
  sessions: readonly SessionPourAgregat[],
  annee: number,
): AgregatFormation {
  const prefixe = `${annee}-`;
  let heures = 0;
  let cout = 0;
  let nbSessions = 0;
  let nbParticipants = 0;
  for (const s of sessions) {
    if (s.statut === 'annulee' || !s.dateDebut.startsWith(prefixe)) continue;
    nbSessions += 1;
    cout += coutSession(s);
    for (const i of s.inscriptions) {
      if (i.statut !== 'present') continue;
      nbParticipants += 1;
      heures += heuresParticipant(i.heuresRealisees, s.formationDureeHeures);
    }
  }
  return {
    heures: Math.round(heures * 100) / 100,
    cout: Math.round(cout * 100) / 100,
    nbSessions,
    nbParticipants,
  };
}

// ─────────────────────────────────────────────────────────────
// Qualifications par salarié
// ─────────────────────────────────────────────────────────────

export type InscriptionReussie = {
  employeId: string;
  formationId: string;
  /** Date de fin de la session (date d'obtention). */
  dateFinSession: IsoDate;
  dateValidite: IsoDate | null;
};

/** `a` est-elle plus récente que `b` ? (date d'obtention, puis validité — sans échéance = la plus longue). */
function plusRecente(a: InscriptionReussie, b: InscriptionReussie): boolean {
  if (a.dateFinSession !== b.dateFinSession) return a.dateFinSession > b.dateFinSession;
  if (a.dateValidite === b.dateValidite) return false;
  if (a.dateValidite === null) return true;
  if (b.dateValidite === null) return false;
  return a.dateValidite > b.dateValidite;
}

/** Dernière inscription réussie par couple (salarié, formation). */
export function dernieresQualifications<T extends InscriptionReussie>(
  inscriptions: readonly T[],
): T[] {
  const parCle = new Map<string, T>();
  for (const i of inscriptions) {
    const cle = `${i.employeId}|${i.formationId}`;
    const courante = parCle.get(cle);
    if (!courante || plusRecente(i, courante)) parCle.set(cle, i);
  }
  return [...parCle.values()];
}

// ─────────────────────────────────────────────────────────────
// Clôture d'une session
// ─────────────────────────────────────────────────────────────

export type InscriptionACloturer = {
  id: string;
  statut: StatutInscription;
  resultat: ResultatFormation;
  heuresRealisees: string | null;
};

export type MiseAJourCloture = {
  id: string;
  statut: StatutInscription;
  resultat: ResultatFormation;
  heuresRealisees: string | null;
  dateValidite: IsoDate | null;
};

/**
 * Effets de « Clôturer la session » : les inscrits deviennent présents, les
 * présents non évalués deviennent « réussi » (avec date de validité), et les
 * heures réalisées manquantes reprennent la durée catalogue. Les absents,
 * annulés et résultats déjà saisis sont conservés. Ne renvoie que les lignes
 * modifiées.
 */
export function calculerCloture(
  inscriptions: readonly InscriptionACloturer[],
  session: { dateFin: IsoDate; validiteMois: number | null; dureeHeures: Num },
): MiseAJourCloture[] {
  const duree = versNombre(session.dureeHeures);
  const dureeTexte = duree !== null ? duree.toFixed(2) : null;
  const majs: MiseAJourCloture[] = [];
  for (const i of inscriptions) {
    if (i.statut !== 'inscrit' && i.statut !== 'present') continue;
    const resultat: ResultatFormation = i.resultat === 'non_evalue' ? 'reussi' : i.resultat;
    const heuresRealisees = i.heuresRealisees ?? dureeTexte;
    const change =
      i.statut !== 'present' || resultat !== i.resultat || heuresRealisees !== i.heuresRealisees;
    if (!change) continue;
    majs.push({
      id: i.id,
      statut: 'present',
      resultat,
      heuresRealisees,
      dateValidite: dateValiditeInscription(resultat, session.dateFin, session.validiteMois),
    });
  }
  return majs;
}
