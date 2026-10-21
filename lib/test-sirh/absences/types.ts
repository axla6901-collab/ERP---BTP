/**
 * Types SÉRIALISABLES échangés entre les lectures serveur
 * (`lib/test-sirh/absences/queries.ts`), les server actions et les composants
 * client du domaine Absences. Aucune `Date` : dates ISO `YYYY-MM-DD`,
 * horodatages ISO complets, nombres décimaux convertis en `number`.
 */

import type {
  CategorieAbsence,
  StatutDemande,
  UniteDecompte,
} from '@/lib/validation/test-sirh/enums';

import type { IsoDate } from '../calendrier';

import type { FerieSite } from './regles';

/** Ligne de demande d'absence (listes, dossier collaborateur, Mon espace). */
export type AbsenceLigne = {
  id: string;
  employeId: string;
  /** « Prénom Nom ». */
  employe: string;
  matricule: string | null;
  typeAbsenceId: string;
  typeCode: string;
  typeLibelle: string;
  couleur: string;
  unite: UniteDecompte;
  categorie: CategorieAbsence;
  /** Le type est décompté d'un compteur de droits. */
  avecSolde: boolean;
  dateDebut: IsoDate;
  dateFin: IsoDate;
  demiJourneeDebut: boolean;
  demiJourneeFin: boolean;
  duree: number;
  motif: string | null;
  statut: StatutDemande;
  /** Utilisateur ayant saisi la demande (id + email). */
  demandeParId: string | null;
  demandePar: string | null;
  /** Utilisateur ayant décidé (email). */
  valideur: string | null;
  /** Horodatage ISO de la décision. */
  dateDecision: string | null;
  commentaireDecision: string | null;
  justificatifDocumentId: string | null;
  /** Horodatage ISO de création. */
  createdAt: string;
};

/** Demande en attente (écran Validations) : contexte de décision en plus. */
export type AbsenceEnAttente = AbsenceLigne & {
  /** La demande concerne la fiche de l'utilisateur courant. */
  estPropreDemande: boolean;
  /** Solde du compteur couvrant la date de début (types avec solde), sinon null. */
  soldeAvant: number | null;
  /** Solde après approbation (`soldeAvant − duree`), sinon null. */
  soldeApres: number | null;
};

/** Résultat de `demanderAbsence`. */
export type ResultatDemandeAbsence = {
  id: string;
  statut: StatutDemande;
  duree: number;
  /** Avertissement non bloquant (solde insuffisant, compteur absent). */
  avertissement: string | null;
};

/** Résultat de `deciderAbsence`. */
export type ResultatDecisionAbsence = {
  statut: StatutDemande;
  /** Avertissement non bloquant à l'approbation (solde insuffisant). */
  avertissement: string | null;
};

export type AjustementLigne = {
  id: string;
  dateAjustement: IsoDate;
  valeur: number;
  motif: string;
};

/** Compteur de droits avec sa synthèse de solde. */
export type CompteurLigne = {
  id: string;
  employeId: string;
  employe: string;
  matricule: string | null;
  typeAbsenceId: string;
  typeCode: string;
  typeLibelle: string;
  couleur: string;
  unite: UniteDecompte;
  periodeDebut: IsoDate;
  periodeFin: IsoDate;
  droitsAcquis: number;
  report: number;
  totalAjustements: number;
  pris: number;
  enAttente: number;
  solde: number;
  soldePrevisionnel: number;
  notes: string | null;
  ajustements: AjustementLigne[];
};

/** Type d'absence proposé dans le dialogue de demande. */
export type TypeAbsenceDemande = {
  id: string;
  code: string;
  label: string;
  couleur: string;
  uniteDecompte: UniteDecompte;
  avecSolde: boolean;
  justificatifRequis: boolean;
  necessiteValidation: boolean;
};

/** Employé proposé dans le dialogue de demande (site = fériés applicables). */
export type EmployeDemande = { id: string; label: string; siteId: string | null };

/** Solde indicatif affiché dans le dialogue de demande. */
export type SoldeDemande = {
  employeId: string;
  typeAbsenceId: string;
  periodeDebut: IsoDate;
  periodeFin: IsoDate;
  solde: number;
  soldePrevisionnel: number;
};

/** Tout ce dont le dialogue de demande a besoin (cf. `chargerContexteDemandeAbsence`). */
export type ContexteDemandeAbsence = {
  types: TypeAbsenceDemande[];
  employes: EmployeDemande[];
  /** Fériés chômés de l'année précédente à N+2 (globaux et par site). */
  feries: FerieSite[];
  soldes: SoldeDemande[];
  /** Dossier GED « Justificatifs » (classement des pièces jointes), si présent. */
  dossierJustificatifsId: string | null;
};

/** Type d'absence (écran Paramètres). */
export type TypeAbsenceLigne = {
  id: string;
  code: string;
  libelle: string;
  categorie: CategorieAbsence;
  uniteDecompte: UniteDecompte;
  avecSolde: boolean;
  necessiteValidation: boolean;
  justificatifRequis: boolean;
  remuneree: boolean;
  couleur: string;
  codeRubriquePaie: string | null;
  actif: boolean;
  ordre: number;
  nbAbsences: number;
  nbCompteurs: number;
};

/** Type d'absence avec solde (compteurs). */
export type TypeAbsenceSolde = {
  id: string;
  label: string;
  code: string;
  uniteDecompte: UniteDecompte;
};

export type JourFerieLigne = {
  id: string;
  dateFerie: IsoDate;
  libelle: string;
  siteId: string | null;
  site: string | null;
  chome: boolean;
};

export type PeriodeBloqueeLigne = {
  id: string;
  libelle: string;
  dateDebut: IsoDate;
  dateFin: IsoDate;
  typeAbsenceId: string | null;
  typeLibelle: string | null;
  typeCouleur: string | null;
  equipeId: string | null;
  equipe: string | null;
  motif: string | null;
};

/** Absent du jour (tableau de bord). */
export type AbsentDuJour = {
  absenceId: string;
  employeId: string;
  employe: string;
  typeCode: string;
  typeLibelle: string;
  couleur: string;
  dateDebut: IsoDate;
  dateFin: IsoDate;
  /** Absent seulement le matin / l'après-midi aujourd'hui, sinon `null` (journée entière). */
  demiJournee: 'matin' | 'apres_midi' | null;
};
