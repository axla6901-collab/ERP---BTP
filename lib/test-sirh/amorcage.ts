/**
 * Référentiels par défaut du module Test SIRH, insérés à la PREMIÈRE activation
 * (uniquement dans les tables encore vides du tenant — cf. activation.ts).
 *
 * Données pures (aucune I/O) : testées par tests/unit/lib/test-sirh/amorcage.test.ts.
 * Contenu orienté BTP (intempéries, carte BTP, EPI, CACES…). Les durées de
 * validité des formations sont indicatives et restent modifiables.
 */

import { joursFeriesFrance, type IsoDate } from './calendrier';
import type {
  CategorieAbsence,
  CategorieFormation,
  ResponsableTache,
  TypeProcessus,
  UniteDecompte,
} from '@/lib/validation/test-sirh/enums';

export type TypeAbsenceAmorce = {
  code: string;
  libelle: string;
  categorie: CategorieAbsence;
  uniteDecompte: UniteDecompte;
  avecSolde: boolean;
  necessiteValidation: boolean;
  justificatifRequis: boolean;
  remuneree: boolean;
  couleur: string;
  ordre: number;
};

export const TYPES_ABSENCE_DEFAUT: readonly TypeAbsenceAmorce[] = [
  {
    code: 'CP',
    libelle: 'Congés payés',
    categorie: 'conges',
    uniteDecompte: 'jours_ouvrables',
    avecSolde: true,
    necessiteValidation: true,
    justificatifRequis: false,
    remuneree: true,
    couleur: '#f59e0b',
    ordre: 10,
  },
  {
    code: 'RTT',
    libelle: 'RTT',
    categorie: 'conges',
    uniteDecompte: 'jours_ouvres',
    avecSolde: true,
    necessiteValidation: true,
    justificatifRequis: false,
    remuneree: true,
    couleur: '#0ea5e9',
    ordre: 20,
  },
  {
    code: 'RC',
    libelle: 'Repos compensateur',
    categorie: 'conges',
    uniteDecompte: 'heures',
    avecSolde: true,
    necessiteValidation: true,
    justificatifRequis: false,
    remuneree: true,
    couleur: '#14b8a6',
    ordre: 30,
  },
  {
    code: 'MAL',
    libelle: 'Arrêt maladie',
    categorie: 'maladie',
    uniteDecompte: 'jours_calendaires',
    avecSolde: false,
    necessiteValidation: false,
    justificatifRequis: true,
    remuneree: true,
    couleur: '#ef4444',
    ordre: 40,
  },
  {
    code: 'AT',
    libelle: 'Accident du travail / de trajet',
    categorie: 'maladie',
    uniteDecompte: 'jours_calendaires',
    avecSolde: false,
    necessiteValidation: false,
    justificatifRequis: true,
    remuneree: true,
    couleur: '#b91c1c',
    ordre: 50,
  },
  {
    code: 'MAT',
    libelle: 'Congé maternité',
    categorie: 'familial',
    uniteDecompte: 'jours_calendaires',
    avecSolde: false,
    necessiteValidation: false,
    justificatifRequis: true,
    remuneree: true,
    couleur: '#ec4899',
    ordre: 60,
  },
  {
    code: 'PAT',
    libelle: "Congé de paternité et d'accueil de l'enfant",
    categorie: 'familial',
    uniteDecompte: 'jours_calendaires',
    avecSolde: false,
    necessiteValidation: true,
    justificatifRequis: true,
    remuneree: true,
    couleur: '#8b5cf6',
    ordre: 70,
  },
  {
    code: 'EVF',
    libelle: 'Événement familial (mariage, naissance, décès…)',
    categorie: 'familial',
    uniteDecompte: 'jours_ouvrables',
    avecSolde: false,
    necessiteValidation: true,
    justificatifRequis: true,
    remuneree: true,
    couleur: '#a855f7',
    ordre: 80,
  },
  {
    code: 'FOR',
    libelle: 'Formation',
    categorie: 'formation',
    uniteDecompte: 'jours_ouvres',
    avecSolde: false,
    necessiteValidation: true,
    justificatifRequis: false,
    remuneree: true,
    couleur: '#10b981',
    ordre: 90,
  },
  {
    code: 'INT',
    libelle: 'Intempéries (arrêt de chantier)',
    categorie: 'intemperies',
    uniteDecompte: 'heures',
    avecSolde: false,
    necessiteValidation: false,
    justificatifRequis: false,
    remuneree: true,
    couleur: '#64748b',
    ordre: 100,
  },
  {
    code: 'CSS',
    libelle: 'Congé sans solde',
    categorie: 'sans_solde',
    uniteDecompte: 'jours_ouvres',
    avecSolde: false,
    necessiteValidation: true,
    justificatifRequis: false,
    remuneree: false,
    couleur: '#78716c',
    ordre: 110,
  },
  {
    code: 'ABS',
    libelle: 'Absence injustifiée',
    categorie: 'autre',
    uniteDecompte: 'jours_ouvres',
    avecSolde: false,
    necessiteValidation: false,
    justificatifRequis: false,
    remuneree: false,
    couleur: '#1f2937',
    ordre: 120,
  },
];

export type HoraireAmorce = {
  nom: string;
  description: string;
  heures: {
    lundi: string;
    mardi: string;
    mercredi: string;
    jeudi: string;
    vendredi: string;
    samedi: string;
    dimanche: string;
  };
  parDefaut: boolean;
};

export const HORAIRES_DEFAUT: readonly HoraireAmorce[] = [
  {
    nom: '35 h — lundi au vendredi',
    description: 'Durée légale : 7 h par jour du lundi au vendredi.',
    heures: {
      lundi: '7',
      mardi: '7',
      mercredi: '7',
      jeudi: '7',
      vendredi: '7',
      samedi: '0',
      dimanche: '0',
    },
    parDefaut: true,
  },
  {
    nom: '39 h — BTP (4 × 8 h + 7 h)',
    description:
      'Horaire chantier courant : 8 h du lundi au jeudi, 7 h le vendredi (4 h sup. structurelles).',
    heures: {
      lundi: '8',
      mardi: '8',
      mercredi: '8',
      jeudi: '8',
      vendredi: '7',
      samedi: '0',
      dimanche: '0',
    },
    parDefaut: false,
  },
];

export type DossierAmorce = {
  nom: string;
  description: string;
  visibleSalarie: boolean;
  ordre: number;
};

export const DOSSIERS_DEFAUT: readonly DossierAmorce[] = [
  {
    nom: 'Contrats & avenants',
    description: 'Contrats de travail, avenants, promesses d’embauche.',
    visibleSalarie: true,
    ordre: 10,
  },
  {
    nom: 'Bulletins de paie',
    description: 'Bulletins mensuels déposés après la paie.',
    visibleSalarie: true,
    ordre: 20,
  },
  {
    nom: 'Attestations & certificats',
    description: 'Attestations employeur, certificats de travail.',
    visibleSalarie: true,
    ordre: 30,
  },
  {
    nom: 'Formations & habilitations',
    description: 'Attestations de formation, CACES, AIPR, habilitations.',
    visibleSalarie: true,
    ordre: 40,
  },
  {
    nom: 'Règlement & accords',
    description: 'Règlement intérieur, accords d’entreprise, notes de service.',
    visibleSalarie: true,
    ordre: 50,
  },
  {
    nom: 'Médecine du travail',
    description: 'Fiches d’aptitude et de suivi (aucune donnée médicale).',
    visibleSalarie: false,
    ordre: 60,
  },
  {
    nom: 'Justificatifs',
    description: 'Justificatifs d’absence et de notes de frais.',
    visibleSalarie: false,
    ordre: 70,
  },
  {
    nom: 'Divers',
    description: 'Autres pièces du dossier salarié.',
    visibleSalarie: false,
    ordre: 80,
  },
];

export type ModeleProcessusAmorce = {
  nom: string;
  typeProcessus: TypeProcessus;
  description: string;
  taches: ReadonlyArray<{
    libelle: string;
    responsable: ResponsableTache;
    delaiJours: number;
    description?: string;
  }>;
};

export const MODELES_PROCESSUS_DEFAUT: readonly ModeleProcessusAmorce[] = [
  {
    nom: 'Intégration compagnon BTP',
    typeProcessus: 'onboarding',
    description: 'Parcours d’arrivée d’un ouvrier ou compagnon sur chantier.',
    taches: [
      {
        libelle: 'Préparer et faire signer le contrat de travail',
        responsable: 'rh',
        delaiJours: -5,
      },
      {
        libelle: 'Effectuer la DPAE auprès de l’URSSAF',
        responsable: 'rh',
        delaiJours: -3,
        description: 'Déclaration préalable à l’embauche, au plus tôt 8 jours avant l’arrivée.',
      },
      { libelle: 'Créer les accès (compte, badge, téléphone)', responsable: 'it', delaiJours: -1 },
      {
        libelle: 'Commander la carte d’identification professionnelle BTP',
        responsable: 'rh',
        delaiJours: 0,
      },
      { libelle: 'Affilier à la mutuelle et à la prévoyance', responsable: 'rh', delaiJours: 0 },
      {
        libelle: 'Remettre les EPI (casque, chaussures, gants, gilet)',
        responsable: 'manager',
        delaiJours: 0,
      },
      {
        libelle: 'Accueil sécurité et remise du livret d’accueil',
        responsable: 'manager',
        delaiJours: 0,
      },
      { libelle: 'Présenter l’équipe et le chantier', responsable: 'manager', delaiJours: 0 },
      {
        libelle: 'Organiser la visite d’information et de prévention',
        responsable: 'rh',
        delaiJours: 15,
      },
      { libelle: 'Point d’étape à un mois', responsable: 'manager', delaiJours: 30 },
    ],
  },
  {
    nom: 'Départ d’un collaborateur',
    typeProcessus: 'offboarding',
    description: 'Formalités de sortie et restitution du matériel.',
    taches: [
      { libelle: 'Mener l’entretien de départ', responsable: 'manager', delaiJours: -5 },
      {
        libelle: 'Récupérer le matériel, l’outillage et les EPI',
        responsable: 'manager',
        delaiJours: 0,
      },
      { libelle: 'Désactiver les accès (compte, badge)', responsable: 'it', delaiJours: 0 },
      { libelle: 'Déclarer la fin de contrat (carte BTP)', responsable: 'rh', delaiJours: 0 },
      { libelle: 'Établir le solde de tout compte', responsable: 'rh', delaiJours: 0 },
      {
        libelle: 'Remettre le certificat de travail et l’attestation France Travail',
        responsable: 'rh',
        delaiJours: 0,
      },
    ],
  },
];

export type FormationAmorce = {
  code: string;
  intitule: string;
  categorie: CategorieFormation;
  dureeHeures: string | null;
  validiteMois: number | null;
  obligatoire: boolean;
  description: string;
};

export const FORMATIONS_DEFAUT: readonly FormationAmorce[] = [
  {
    code: 'SST',
    intitule: 'Sauveteur secouriste du travail (SST)',
    categorie: 'securite',
    dureeHeures: '14',
    validiteMois: 24,
    obligatoire: false,
    description:
      'Formation initiale de 14 h ; maintien et actualisation des compétences tous les 24 mois.',
  },
  {
    code: 'CACES-R482',
    intitule: 'CACES R482 — Engins de chantier',
    categorie: 'reglementaire',
    dureeHeures: null,
    validiteMois: 120,
    obligatoire: false,
    description:
      'Conduite d’engins de chantier (pelles, chargeuses, compacteurs…). Validité indicative 10 ans.',
  },
  {
    code: 'CACES-R486',
    intitule: 'CACES R486 — Plates-formes élévatrices (PEMP)',
    categorie: 'reglementaire',
    dureeHeures: null,
    validiteMois: 60,
    obligatoire: false,
    description: 'Conduite de nacelles / PEMP. Validité indicative 5 ans.',
  },
  {
    code: 'CACES-R489',
    intitule: 'CACES R489 — Chariots de manutention',
    categorie: 'reglementaire',
    dureeHeures: null,
    validiteMois: 60,
    obligatoire: false,
    description: 'Chariots élévateurs à conducteur porté. Validité indicative 5 ans.',
  },
  {
    code: 'AIPR-OP',
    intitule: 'AIPR — Opérateur',
    categorie: 'reglementaire',
    dureeHeures: null,
    validiteMois: 60,
    obligatoire: true,
    description: 'Autorisation d’intervention à proximité des réseaux. Validité 5 ans.',
  },
  {
    code: 'HAB-B0',
    intitule: 'Habilitation électrique B0/H0 (non-électricien)',
    categorie: 'reglementaire',
    dureeHeures: '7',
    validiteMois: 36,
    obligatoire: false,
    description:
      'Travaux non électriques au voisinage d’installations. Recyclage recommandé tous les 3 ans.',
  },
  {
    code: 'HAUTEUR',
    intitule: 'Travail en hauteur et port du harnais',
    categorie: 'securite',
    dureeHeures: '7',
    validiteMois: null,
    obligatoire: false,
    description: 'Prévention des chutes de hauteur, utilisation des EPI antichute.',
  },
];

/** Jours fériés à amorcer : année de `aujourdhui` et année suivante. */
export function joursFeriesAAmorcer(
  aujourdhui: IsoDate,
): Array<{ date: IsoDate; libelle: string }> {
  const annee = Number(aujourdhui.slice(0, 4));
  return [...joursFeriesFrance(annee), ...joursFeriesFrance(annee + 1)];
}
