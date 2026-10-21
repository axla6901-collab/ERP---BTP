/**
 * Logique contractuelle du module Test SIRH — fonctions PURES (aucune I/O),
 * importables côté client comme serveur, testées sans base.
 *
 * Modèle : `sirh_contrats` stocke des VERSIONS de contrat (Factorial
 * contracts/ContractVersion). Une nouvelle version (avenant, renouvellement,
 * changement de poste…) prend le relais de la précédente, qui est alors
 * « remplacée » : sa date de fin n'est pas une fin de contrat (pas d'alerte, pas
 * de motif de fin attendu). Toutes les dates sont des chaînes ISO `YYYY-MM-DD`.
 */

import { ajouterJours, chevauchement, differenceJours, type IsoDate } from '../calendrier';
import { formatDateFr, versNombre } from '../format';
import { DUREE_LEGALE_HEBDO } from '@/lib/validation/test-sirh/collaborateurs';
import {
  TYPES_CONTRAT_A_TERME,
  type CategorieProfessionnelle,
  type MotifFinContrat,
  type TempsTravail,
  type TypeContratSirh,
} from '@/lib/validation/test-sirh/enums';

// ─────────────────────────────────────────────────────────────
// Paramètres
// ─────────────────────────────────────────────────────────────

/** Alerte de fin de période d'essai à J-15. */
export const SEUIL_ALERTE_FIN_ESSAI_JOURS = 15;
/** Alerte de fin de contrat (CDD, intérim…) à J-30. */
export const SEUIL_ALERTE_FIN_CONTRAT_JOURS = 30;
/** En deçà (J-7), l'alerte devient critique. */
export const SEUIL_ALERTE_CRITIQUE_JOURS = 7;
/** Horizon du KPI « fins de contrat ». */
export const HORIZON_FINS_CONTRAT_JOURS = 60;
/** Fenêtre des KPI « arrivées / départs ». */
export const FENETRE_MOUVEMENTS_JOURS = 30;

/** Borne de fin d'une période ouverte (comparaisons ISO lexicographiques). */
const FIN_OUVERTE: IsoDate = '9999-12-31';

/** Libellés compacts (badges, messages) — les libellés longs sont dans enums.ts. */
export const LIBELLES_COURTS_TYPE_CONTRAT: Record<TypeContratSirh, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  cdi_chantier: 'CDI chantier',
  interim: 'Intérim',
  apprentissage: 'Apprentissage',
  professionnalisation: 'Professionnalisation',
  stage: 'Stage',
  saisonnier: 'Saisonnier',
  autre: 'Autre',
};

// ─────────────────────────────────────────────────────────────
// Versions de contrat
// ─────────────────────────────────────────────────────────────

/** Champs d'une version de contrat utiles aux calculs. */
export type ContratPeriode = {
  id: string;
  typeContrat: TypeContratSirh;
  dateDebut: IsoDate;
  dateFin: IsoDate | null;
  dateFinPeriodeEssai: IsoDate | null;
  motifFin: MotifFinContrat | null;
};

type Periode = Pick<ContratPeriode, 'dateDebut' | 'dateFin'>;
type PeriodeIdentifiee = Pick<ContratPeriode, 'id' | 'dateDebut' | 'dateFin'>;

/**
 * Version en vigueur à `today` (début ≤ today ≤ fin, fin NULL = ouverte). Si
 * plusieurs versions couvrent la date, la plus récemment commencée l'emporte.
 */
export function contratEnCours<C extends Periode>(
  contrats: readonly C[],
  today: IsoDate,
): C | null {
  let retenu: C | null = null;
  for (const c of contrats) {
    if (c.dateDebut > today) continue;
    if (c.dateFin && c.dateFin < today) continue;
    if (!retenu || c.dateDebut > retenu.dateDebut) retenu = c;
  }
  return retenu;
}

/** La version est-elle suivie d'une version plus récente (avenant, renouvellement) ? */
export function estRemplace(
  contrat: Pick<ContratPeriode, 'id' | 'dateDebut'>,
  contrats: ReadonlyArray<Pick<ContratPeriode, 'id' | 'dateDebut'>>,
): boolean {
  return contrats.some((c) => c.id !== contrat.id && c.dateDebut > contrat.dateDebut);
}

/**
 * Contrat « de référence » d'un collaborateur : la version en cours, sinon la
 * dernière commencée, sinon la prochaine à venir (null si aucun contrat).
 */
export function contratDeReference<C extends Periode>(
  contrats: readonly C[],
  today: IsoDate,
): C | null {
  const enCours = contratEnCours(contrats, today);
  if (enCours) return enCours;
  let dernier: C | null = null;
  let prochain: C | null = null;
  for (const c of contrats) {
    if (c.dateDebut <= today) {
      if (!dernier || c.dateDebut > dernier.dateDebut) dernier = c;
    } else if (!prochain || c.dateDebut < prochain.dateDebut) {
      prochain = c;
    }
  }
  return dernier ?? prochain;
}

/**
 * Date de fin prévue de la relation contractuelle : fin de la version en cours,
 * si elle en a une et qu'aucune version ne lui succède (sinon null).
 */
export function finDeContratPrevue<C extends PeriodeIdentifiee>(
  contrats: readonly C[],
  today: IsoDate,
): IsoDate | null {
  const enCours = contratEnCours(contrats, today);
  if (!enCours?.dateFin) return null;
  if (estRemplace(enCours, contrats)) return null;
  return enCours.dateFin;
}

export type EtatVersion = 'a_venir' | 'en_cours' | 'remplacee' | 'terminee';

export const LIBELLES_ETAT_VERSION: Record<EtatVersion, string> = {
  a_venir: 'À venir',
  en_cours: 'En cours',
  remplacee: 'Remplacée',
  terminee: 'Terminée',
};

/** État d'une version parmi l'historique du collaborateur. */
export function etatVersion<C extends PeriodeIdentifiee>(
  contrat: C,
  contrats: readonly C[],
  today: IsoDate,
): EtatVersion {
  if (contratEnCours(contrats, today)?.id === contrat.id) return 'en_cours';
  if (contrat.dateDebut > today) return 'a_venir';
  if (estRemplace(contrat, contrats)) return 'remplacee';
  return 'terminee';
}

/** Motif de fin proposé par défaut dans « Terminer le contrat ». */
export function motifFinSuggere(type: TypeContratSirh): MotifFinContrat {
  if (type === 'cdi_chantier') return 'fin_chantier';
  if (type === 'stage' || type === 'autre') return 'autre';
  if (TYPES_CONTRAT_A_TERME.includes(type)) return 'fin_cdd';
  return 'demission';
}

/** Ne garde que le champ pertinent du temps de travail (heures OU jours de forfait). */
export function normaliserTempsTravail<
  T extends { tempsTravail: TempsTravail; heuresHebdo: string | null; joursForfait: number | null },
>(contrat: T): T {
  if (contrat.tempsTravail === 'forfait_jours') return { ...contrat, heuresHebdo: null };
  return { ...contrat, joursForfait: null };
}

export type VersionExistante = {
  id: string;
  dateDebut: IsoDate;
  dateFin: IsoDate | null;
  motifFin: MotifFinContrat | null;
};

export type PlanVersion =
  | { ok: true; aClore: Array<{ id: string; dateFin: IsoDate }> }
  | { ok: false; message: string };

/**
 * Contrôle de chevauchement d'une version (nouvelle ou modifiée) avec les autres
 * versions du collaborateur.
 *
 * - Création : une version antérieure encore ouverte (non terminée par un motif)
 *   qui chevauche la nouvelle est close la veille de son début (avenant).
 * - Tout autre chevauchement est refusé (message lisible).
 */
export function planifierVersion(
  nouvelle: { dateDebut: IsoDate; dateFin: IsoDate | null },
  autres: readonly VersionExistante[],
  opts: { creation: boolean },
): PlanVersion {
  const aClore: Array<{ id: string; dateFin: IsoDate }> = [];
  const triees = [...autres].sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
  for (const v of triees) {
    const chevauche = chevauchement(
      v.dateDebut,
      v.dateFin ?? FIN_OUVERTE,
      nouvelle.dateDebut,
      nouvelle.dateFin ?? FIN_OUVERTE,
    );
    if (!chevauche) continue;
    if (opts.creation && v.dateDebut < nouvelle.dateDebut && !v.motifFin) {
      aClore.push({ id: v.id, dateFin: ajouterJours(nouvelle.dateDebut, -1) });
      continue;
    }
    const periode = v.dateFin
      ? `du ${formatDateFr(v.dateDebut)} au ${formatDateFr(v.dateFin)}`
      : `ouverte depuis le ${formatDateFr(v.dateDebut)}`;
    return {
      ok: false,
      message: `Ce contrat chevauche la version ${periode}. Ajustez les dates (une seule version en vigueur à la fois).`,
    };
  }
  return { ok: true, aClore };
}

// ─────────────────────────────────────────────────────────────
// Alertes
// ─────────────────────────────────────────────────────────────

export type TypeAlerteContrat = 'fin_periode_essai' | 'fin_contrat' | 'contrat_echu_sans_motif';
export type NiveauAlerteContrat = 'critique' | 'attention';

export type AlerteContrat = {
  type: TypeAlerteContrat;
  niveau: NiveauAlerteContrat;
  /** Date concernée (fin d'essai ou fin de contrat). */
  date: IsoDate;
  /** Jours de `today` à `date` (négatif si la date est dépassée). */
  jours: number;
  message: string;
};

/** `0` → « aujourd’hui », `1` → « demain », `12` → « dans 12 j », `-3` → « il y a 3 j ». */
export function libelleEcheance(jours: number): string {
  if (jours === 0) return 'aujourd’hui';
  if (jours === 1) return 'demain';
  if (jours === -1) return 'hier';
  return jours > 0 ? `dans ${jours} j` : `il y a ${-jours} j`;
}

function niveauSelonJours(jours: number): NiveauAlerteContrat {
  return jours <= SEUIL_ALERTE_CRITIQUE_JOURS ? 'critique' : 'attention';
}

/**
 * Alertes d'une version de contrat à `today` :
 * - fin de période d'essai dans ≤ 15 jours ;
 * - fin de contrat (CDD, intérim…) dans ≤ 30 jours, tant qu'aucun motif de fin
 *   n'est saisi (décision de renouvellement à prendre) ;
 * - contrat échu sans motif de fin (à clôturer).
 * Une version remplacée par une version plus récente (`opts.remplace`) n'en
 * produit aucune.
 */
export function alertesContrat(
  contrat: ContratPeriode,
  today: IsoDate,
  opts: { remplace?: boolean } = {},
): AlerteContrat[] {
  if (opts.remplace) return [];
  const alertes: AlerteContrat[] = [];
  const type = LIBELLES_COURTS_TYPE_CONTRAT[contrat.typeContrat];

  // Un essai qui finirait après le contrat est sans objet (le contrat s'arrête avant).
  const essai = contrat.dateFinPeriodeEssai;
  if (essai && !contrat.motifFin && (!contrat.dateFin || essai <= contrat.dateFin)) {
    const jours = differenceJours(today, essai);
    if (jours >= 0 && jours <= SEUIL_ALERTE_FIN_ESSAI_JOURS) {
      alertes.push({
        type: 'fin_periode_essai',
        niveau: niveauSelonJours(jours),
        date: essai,
        jours,
        message: `Fin de période d’essai le ${formatDateFr(essai)} (${libelleEcheance(jours)})`,
      });
    }
  }

  if (contrat.dateFin && !contrat.motifFin) {
    const jours = differenceJours(today, contrat.dateFin);
    if (jours < 0) {
      alertes.push({
        type: 'contrat_echu_sans_motif',
        niveau: 'critique',
        date: contrat.dateFin,
        jours,
        message: `Contrat (${type}) échu le ${formatDateFr(contrat.dateFin)} sans motif de fin`,
      });
    } else if (jours <= SEUIL_ALERTE_FIN_CONTRAT_JOURS) {
      alertes.push({
        type: 'fin_contrat',
        niveau: niveauSelonJours(jours),
        date: contrat.dateFin,
        jours,
        message: `Fin de contrat (${type}) le ${formatDateFr(contrat.dateFin)} (${libelleEcheance(jours)})`,
      });
    }
  }
  return alertes;
}

/** Tri des alertes : critiques d'abord, puis par date croissante. */
export function comparerAlertes(
  a: Pick<AlerteContrat, 'niveau' | 'date'>,
  b: Pick<AlerteContrat, 'niveau' | 'date'>,
): number {
  if (a.niveau !== b.niveau) return a.niveau === 'critique' ? -1 : 1;
  return a.date.localeCompare(b.date);
}

export type AlerteContratIdentifiee = AlerteContrat & {
  contratId: string;
  typeContrat: TypeContratSirh;
};

/** Alertes de toutes les versions d'UN collaborateur (versions remplacées ignorées), triées. */
export function alertesContrats(
  contrats: readonly ContratPeriode[],
  today: IsoDate,
): AlerteContratIdentifiee[] {
  return contrats
    .flatMap((c) =>
      alertesContrat(c, today, { remplace: estRemplace(c, contrats) }).map((a) => ({
        ...a,
        contratId: c.id,
        typeContrat: c.typeContrat,
      })),
    )
    .sort(comparerAlertes);
}

// ─────────────────────────────────────────────────────────────
// Statut du collaborateur
// ─────────────────────────────────────────────────────────────

export type StatutCollaborateur = 'a_venir' | 'actif' | 'depart_prevu' | 'sorti';

export const LIBELLES_STATUT_COLLABORATEUR: Record<StatutCollaborateur, string> = {
  a_venir: 'Arrivée à venir',
  actif: 'Actif',
  depart_prevu: 'Départ prévu',
  sorti: 'Sorti',
};

/**
 * Statut à `today`, d'après la fiche employé (source de vérité de la présence) :
 * inactif ou date de sortie dépassée → sorti ; entrée future → à venir ; date de
 * sortie à venir (ou aujourd'hui) → départ prévu ; sinon actif.
 */
export function statutCollaborateur(
  e: { actif: boolean; dateEntree: IsoDate | null; dateSortie: IsoDate | null },
  today: IsoDate,
): StatutCollaborateur {
  if (!e.actif) return 'sorti';
  if (e.dateSortie && e.dateSortie < today) return 'sorti';
  if (e.dateEntree && e.dateEntree > today) return 'a_venir';
  if (e.dateSortie) return 'depart_prevu';
  return 'actif';
}

/** Présent dans l'effectif à `today` (actif ou départ prévu). */
export function estPresent(statut: StatutCollaborateur): boolean {
  return statut === 'actif' || statut === 'depart_prevu';
}

export const FILTRES_COLLABORATEURS = ['actifs', 'sortis', 'tous'] as const;
export type FiltreCollaborateurs = (typeof FILTRES_COLLABORATEURS)[number];

export const LIBELLES_FILTRE_COLLABORATEURS: Record<FiltreCollaborateurs, string> = {
  actifs: 'Actifs',
  sortis: 'Sortis',
  tous: 'Tous',
};

/** Paramètre d'URL `?statut=` → filtre (défaut : actifs). */
export function lireFiltreCollaborateurs(valeur: unknown): FiltreCollaborateurs {
  return typeof valeur === 'string' &&
    (FILTRES_COLLABORATEURS as readonly string[]).includes(valeur)
    ? (valeur as FiltreCollaborateurs)
    : 'actifs';
}

/** « Actifs » = présents + arrivées à venir ; « Sortis » = sortis ; « Tous ». */
export function correspondAuFiltre(
  statut: StatutCollaborateur,
  filtre: FiltreCollaborateurs,
): boolean {
  if (filtre === 'tous') return true;
  if (filtre === 'sortis') return statut === 'sorti';
  return statut !== 'sorti';
}

// ─────────────────────────────────────────────────────────────
// Dates dérivées
// ─────────────────────────────────────────────────────────────

function premierDebut(contrats: ReadonlyArray<Pick<ContratPeriode, 'dateDebut'>>): IsoDate | null {
  let min: IsoDate | null = null;
  for (const c of contrats) if (!min || c.dateDebut < min) min = c.dateDebut;
  return min;
}

/** Date d'entrée : fiche RH (entrée, sinon embauche), sinon début du premier contrat. */
export function dateEntreeEffective(
  e: { dateEntree: IsoDate | null; dateEmbauche: IsoDate | null },
  contrats: ReadonlyArray<Pick<ContratPeriode, 'dateDebut'>>,
): IsoDate | null {
  return e.dateEntree ?? e.dateEmbauche ?? premierDebut(contrats);
}

/**
 * Date d'ancienneté : celle de l'affectation SIRH (reprise d'ancienneté), sinon
 * l'embauche, sinon l'entrée, sinon le début du premier contrat.
 */
export function dateAncienneteEffective(
  e: { dateAnciennete: IsoDate | null; dateEmbauche: IsoDate | null; dateEntree: IsoDate | null },
  contrats: ReadonlyArray<Pick<ContratPeriode, 'dateDebut'>>,
): IsoDate | null {
  return e.dateAnciennete ?? e.dateEmbauche ?? e.dateEntree ?? premierDebut(contrats);
}

// ─────────────────────────────────────────────────────────────
// Répartition & KPI
// ─────────────────────────────────────────────────────────────

export type FamilleContrat = 'cdi' | 'cdd_interim' | 'alternance' | 'autre';

export const FAMILLE_TYPE_CONTRAT: Record<TypeContratSirh, FamilleContrat> = {
  cdi: 'cdi',
  cdi_chantier: 'cdi',
  cdd: 'cdd_interim',
  interim: 'cdd_interim',
  saisonnier: 'cdd_interim',
  apprentissage: 'alternance',
  professionnalisation: 'alternance',
  stage: 'autre',
  autre: 'autre',
};

export type RepartitionContrats = {
  cdi: number;
  cddInterim: number;
  alternance: number;
  autre: number;
  /** Collaborateurs sans version de contrat en cours dans le SIRH. */
  sansContrat: number;
  total: number;
};

/** Répartition par famille de contrat (un type par collaborateur, `null` = sans contrat). */
export function repartitionParType(
  types: ReadonlyArray<TypeContratSirh | null | undefined>,
): RepartitionContrats {
  const r: RepartitionContrats = {
    cdi: 0,
    cddInterim: 0,
    alternance: 0,
    autre: 0,
    sansContrat: 0,
    total: 0,
  };
  for (const t of types) {
    r.total += 1;
    if (!t) {
      r.sansContrat += 1;
      continue;
    }
    const famille = FAMILLE_TYPE_CONTRAT[t];
    if (famille === 'cdi') r.cdi += 1;
    else if (famille === 'cdd_interim') r.cddInterim += 1;
    else if (famille === 'alternance') r.alternance += 1;
    else r.autre += 1;
  }
  return r;
}

/** Vue synthétique d'un collaborateur pour les indicateurs. */
export type SyntheseCollaborateur = {
  statut: StatutCollaborateur;
  dateEntree: IsoDate | null;
  dateSortie: IsoDate | null;
  typeContratEnCours: TypeContratSirh | null;
  finContratPrevue: IsoDate | null;
};

/** Construit la synthèse d'un collaborateur depuis sa fiche et ses versions de contrat. */
export function syntheseCollaborateur(
  e: {
    actif: boolean;
    dateEntree: IsoDate | null;
    dateEmbauche: IsoDate | null;
    dateSortie: IsoDate | null;
  },
  contrats: ReadonlyArray<Pick<ContratPeriode, 'id' | 'typeContrat' | 'dateDebut' | 'dateFin'>>,
  today: IsoDate,
): SyntheseCollaborateur {
  const dateEntree = dateEntreeEffective(e, contrats);
  return {
    statut: statutCollaborateur({ actif: e.actif, dateEntree, dateSortie: e.dateSortie }, today),
    dateEntree,
    dateSortie: e.dateSortie,
    typeContratEnCours: contratEnCours(contrats, today)?.typeContrat ?? null,
    finContratPrevue: finDeContratPrevue(contrats, today),
  };
}

export type KpiCollaborateurs = {
  /** Présents à date (actifs + départs prévus). */
  effectifActif: number;
  arriveesAVenir: number;
  /** Répartition des présents par famille de contrat en cours. */
  repartition: RepartitionContrats;
  /** Entrées sur les 30 derniers jours (aujourd'hui inclus). */
  arrivees30j: number;
  /** Sorties sur les 30 derniers jours (aujourd'hui inclus). */
  departs30j: number;
  /** Présents dont le contrat prend fin dans les 60 prochains jours. */
  finsContrat60j: number;
};

function dansIntervalle(d: IsoDate | null, debut: IsoDate, fin: IsoDate): boolean {
  return d !== null && d >= debut && d <= fin;
}

export function calculerKpiCollaborateurs(
  collaborateurs: readonly SyntheseCollaborateur[],
  today: IsoDate,
): KpiCollaborateurs {
  const debutFenetre = ajouterJours(today, -FENETRE_MOUVEMENTS_JOURS);
  const finHorizon = ajouterJours(today, HORIZON_FINS_CONTRAT_JOURS);
  const presents = collaborateurs.filter((c) => estPresent(c.statut));
  return {
    effectifActif: presents.length,
    arriveesAVenir: collaborateurs.filter((c) => c.statut === 'a_venir').length,
    repartition: repartitionParType(presents.map((c) => c.typeContratEnCours)),
    arrivees30j: collaborateurs.filter((c) => dansIntervalle(c.dateEntree, debutFenetre, today))
      .length,
    departs30j: collaborateurs.filter((c) => dansIntervalle(c.dateSortie, debutFenetre, today))
      .length,
    finsContrat60j: presents.filter((c) => dansIntervalle(c.finContratPrevue, today, finHorizon))
      .length,
  };
}

// ─────────────────────────────────────────────────────────────
// Registre unique du personnel (art. L1221-13 et D1221-23 C. trav.)
// ─────────────────────────────────────────────────────────────

/** Valeurs de l'enum `type_contrat` de la fiche RH (`employes.type_contrat`). */
export type TypeContratFicheRh = 'CDI' | 'CDD' | 'INT' | 'ALT' | 'STAGE';

export const TYPE_CONTRAT_DEPUIS_FICHE_RH: Record<TypeContratFicheRh, TypeContratSirh> = {
  CDI: 'cdi',
  CDD: 'cdd',
  INT: 'interim',
  ALT: 'apprentissage',
  STAGE: 'stage',
};

/** Type de contrat SIRH équivalent au type saisi sur la fiche RH. */
export function typeContratDepuisFicheRh(
  type: TypeContratFicheRh | null | undefined,
): TypeContratSirh | null {
  return type ? TYPE_CONTRAT_DEPUIS_FICHE_RH[type] : null;
}

export type SexeFicheRh = 'M' | 'F' | 'NB';

/** Colonnes de la fiche RH nécessaires au registre (aucune donnée chiffrée). */
export type EmployeRegistre = {
  id: string;
  nom: string;
  prenom: string;
  nationalite: string | null;
  dateNaissance: IsoDate | null;
  sexe: SexeFicheRh | null;
  qualification: string | null;
  classification: CategorieProfessionnelle | null;
  typeContrat: TypeContratFicheRh;
  societeInterim: string | null;
  heuresHebdoContractuelles: string | number | null;
  dateEntree: IsoDate | null;
  dateEmbauche: IsoDate | null;
  dateSortie: IsoDate | null;
};

/** Version de contrat enrichie pour le registre. */
export type ContratRegistre = ContratPeriode & {
  intitulePoste: string | null;
  /** Intitulé du poste au catalogue (repli si l'intitulé figé est vide). */
  posteIntitule: string | null;
  categorie: CategorieProfessionnelle | null;
  niveau: string | null;
  coefficient: string | null;
  tempsTravail: TempsTravail;
};

export type LigneRegistre = {
  employeId: string;
  nom: string;
  prenoms: string;
  nationalite: string | null;
  dateNaissance: IsoDate | null;
  sexe: SexeFicheRh | null;
  emploi: string | null;
  qualification: string | null;
  categorie: CategorieProfessionnelle | null;
  typeContrat: TypeContratSirh | null;
  tempsPartiel: boolean;
  /** Mentions légales : CDD, temps partiel, apprentissage, travail temporaire… */
  mentions: string[];
  /** Entreprise de travail temporaire (intérimaires). */
  agenceInterim: string | null;
  dateEntree: IsoDate | null;
  dateSortie: IsoDate | null;
};

/** Mentions spécifiques exigées par l'art. D1221-23 selon le type de contrat. */
export function mentionsRegistre(
  type: TypeContratSirh | null,
  tempsPartiel: boolean,
  agenceInterim: string | null,
): string[] {
  const mentions: string[] = [];
  switch (type) {
    case 'cdd':
      mentions.push('Contrat à durée déterminée');
      break;
    case 'saisonnier':
      mentions.push('Contrat à durée déterminée (saisonnier)');
      break;
    case 'interim':
      mentions.push(
        agenceInterim ? `Travailleur temporaire — ${agenceInterim}` : 'Travailleur temporaire',
      );
      break;
    case 'apprentissage':
      mentions.push('Contrat d’apprentissage');
      break;
    case 'professionnalisation':
      mentions.push('Contrat de professionnalisation');
      break;
    case 'stage':
      mentions.push('Stagiaire');
      break;
    default:
      break;
  }
  if (tempsPartiel) mentions.push('Temps partiel');
  return mentions;
}

function formatQualification(niveau: string | null, coefficient: string | null): string | null {
  const parts = [niveau, coefficient ? `coef. ${coefficient}` : null].filter((p): p is string =>
    Boolean(p && p.trim()),
  );
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * Ligne du registre d'un salarié : identité depuis la fiche RH, emploi /
 * qualification / type de contrat depuis le contrat de référence (en cours, ou
 * le dernier), avec repli sur la fiche RH s'il n'existe aucun contrat SIRH.
 */
export function construireLigneRegistre(
  employe: EmployeRegistre,
  contrats: readonly ContratRegistre[],
  today: IsoDate,
): LigneRegistre {
  const contrat = contratDeReference(contrats, today);

  const typeContrat = contrat?.typeContrat ?? typeContratDepuisFicheRh(employe.typeContrat);
  const heuresFiche = versNombre(employe.heuresHebdoContractuelles);
  const tempsPartiel = contrat
    ? contrat.tempsTravail === 'temps_partiel'
    : heuresFiche !== null && heuresFiche > 0 && heuresFiche < DUREE_LEGALE_HEBDO;
  const agenceInterim = typeContrat === 'interim' ? employe.societeInterim : null;

  const emploi = contrat?.intitulePoste ?? contrat?.posteIntitule ?? employe.qualification ?? null;
  const qualification =
    formatQualification(contrat?.niveau ?? null, contrat?.coefficient ?? null) ??
    (emploi !== employe.qualification ? employe.qualification : null);

  // Sortie : fiche RH, sinon fin de la dernière version terminée par un motif.
  let dateSortie = employe.dateSortie;
  if (!dateSortie && !contratEnCours(contrats, today)) {
    let dernier: ContratRegistre | null = null;
    for (const c of contrats) if (!dernier || c.dateDebut > dernier.dateDebut) dernier = c;
    if (dernier?.motifFin && dernier.dateFin && dernier.dateFin < today) {
      dateSortie = dernier.dateFin;
    }
  }

  return {
    employeId: employe.id,
    nom: employe.nom,
    prenoms: employe.prenom,
    nationalite: employe.nationalite,
    dateNaissance: employe.dateNaissance,
    sexe: employe.sexe,
    emploi,
    qualification,
    categorie: contrat?.categorie ?? employe.classification,
    typeContrat,
    tempsPartiel,
    mentions: mentionsRegistre(typeContrat, tempsPartiel, agenceInterim),
    agenceInterim,
    dateEntree: dateEntreeEffective(employe, contrats),
    dateSortie,
  };
}

/** Ordre chronologique des entrées (dates inconnues en fin), puis nom et prénoms. */
export function trierRegistre<L extends Pick<LigneRegistre, 'dateEntree' | 'nom' | 'prenoms'>>(
  lignes: readonly L[],
): L[] {
  return [...lignes].sort((a, b) => {
    if (a.dateEntree !== b.dateEntree) {
      if (!a.dateEntree) return 1;
      if (!b.dateEntree) return -1;
      return a.dateEntree.localeCompare(b.dateEntree);
    }
    return (
      a.nom.localeCompare(b.nom, 'fr', { sensitivity: 'base' }) ||
      a.prenoms.localeCompare(b.prenoms, 'fr', { sensitivity: 'base' })
    );
  });
}
