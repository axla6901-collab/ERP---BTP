/**
 * Types sérialisables — Test SIRH › Onboarding / processus & tâches.
 *
 * Module neutre (ni `server-only` ni `'use server'`) : partagé entre les
 * lectures serveur (queries.ts) et les composants client. Dates en ISO.
 */

import type {
  ResponsableTache,
  StatutProcessus,
  StatutTache,
  TypeProcessus,
} from '@/lib/validation/test-sirh/enums';

export type { KpiOnboarding } from './planification';

/** Processus lancé + synthèse de ses tâches (liste, dossier collaborateur). */
export type ProcessusLigne = {
  id: string;
  libelle: string;
  typeProcessus: TypeProcessus;
  statut: StatutProcessus;
  /** Date pivot (arrivée, départ, mobilité). */
  dateReference: string;
  employeId: string;
  /** « Prénom Nom ». */
  employeNom: string;
  modeleId: string | null;
  modeleNom: string | null;
  /** Tâches faites / à réaliser (annulées exclues) et pourcentage. */
  faites: number;
  total: number;
  pourcent: number;
  /** Tâches ouvertes (à faire / en cours). */
  ouvertes: number;
  enRetard: number;
  prochaineEcheance: string | null;
  /** Toutes les tâches sont faites : la clôture est proposée. */
  terminable: boolean;
  createdAt: string;
};

/** Tâche RH (checklist d'un processus, « Mes tâches », dossier collaborateur). */
export type TacheLigne = {
  id: string;
  processusId: string | null;
  processusLibelle: string | null;
  typeProcessus: TypeProcessus | null;
  /** Collaborateur concerné (celui du processus, ou choisi pour une tâche autonome). */
  employeId: string | null;
  employeNom: string | null;
  libelle: string;
  description: string | null;
  responsable: ResponsableTache;
  /** Compte utilisateur assigné. */
  assigneA: string | null;
  /** Email du compte assigné. */
  assigneLabel: string | null;
  echeance: string | null;
  statut: StatutTache;
  dateRealisation: string | null;
  ordre: number;
  /** Ouverte et échéance dépassée (calculé à la lecture). */
  enRetard: boolean;
};

/** Fiche d'un processus : en-tête + checklist ordonnée. */
export type ProcessusFiche = ProcessusLigne & {
  /** Email de l'utilisateur ayant lancé le processus. */
  lancePar: string | null;
  taches: TacheLigne[];
};

export type ModeleTacheLigne = {
  id: string;
  modeleId: string;
  libelle: string;
  description: string | null;
  responsable: ResponsableTache;
  delaiJours: number;
  ordre: number;
};

/** Modèle de processus avec ses tâches ordonnées et son usage. */
export type ModeleProcessusLigne = {
  id: string;
  nom: string;
  typeProcessus: TypeProcessus;
  description: string | null;
  actif: boolean;
  /** Processus (non supprimés) lancés depuis ce modèle. */
  nbProcessus: number;
  taches: ModeleTacheLigne[];
};

/** Modèle actif proposé au lancement (avec ses tâches pour l'aperçu des échéances). */
export type ModeleLancement = {
  id: string;
  nom: string;
  typeProcessus: TypeProcessus;
  taches: Array<{
    libelle: string;
    description: string | null;
    responsable: ResponsableTache;
    delaiJours: number;
    ordre: number;
  }>;
};

/** Collaborateur proposé au lancement (aucune donnée sensible). */
export type EmployeLancement = {
  id: string;
  /** « Nom Prénom » (+ « (inactif) ») — libellé de sélecteur. */
  label: string;
  /** « Prénom Nom » — libellé du processus pré-rempli. */
  nomComplet: string;
  actif: boolean;
  /** Date d'embauche (à défaut, d'entrée). */
  dateArrivee: string | null;
  /** Date de sortie (à défaut, de fin de contrat). */
  dateDepart: string | null;
};
