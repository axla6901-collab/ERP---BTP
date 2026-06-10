import { z } from 'zod';

/**
 * Schemas Zod pour le module RH (M5.1 + M5.2) :
 * - Employés (table normalisée, multi type de contrat)
 * - Pointages (matrice mensuelle de saisie + entrées unitaires)
 */

const emptyToNull = (v: unknown): unknown => {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string' && v.trim().length === 0) return null;
  return v;
};

const trimmedOptionalString = (max: number) =>
  z.preprocess(
    emptyToNull,
    z.union([z.null(), z.string().trim().max(max)]),
  );

const optionalDate = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).'),
  ]),
);

const optionalEmail = z.preprocess(
  emptyToNull,
  z.union([z.null(), z.email('Email invalide.').max(200)]),
);

const optionalMontant = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || !Number.isFinite(n)) {
          ctx.addIssue({ code: 'custom', message: 'Montant invalide.' });
          return z.NEVER;
        }
        if (n < 0) {
          ctx.addIssue({ code: 'custom', message: 'Montant négatif interdit.' });
          return z.NEVER;
        }
        return n.toFixed(2);
      }),
  ]),
);

// ─────────────────────────────────────────────────────────────
// Employés
// ─────────────────────────────────────────────────────────────

export const TYPES_CONTRAT = ['CDI', 'CDD', 'INT', 'ALT', 'STAGE'] as const;
export type TypeContrat = (typeof TYPES_CONTRAT)[number];

export const LIBELLES_TYPE_CONTRAT: Record<TypeContrat, string> = {
  CDI: 'CDI',
  CDD: 'CDD',
  INT: 'Intérim',
  ALT: 'Alternance',
  STAGE: 'Stage',
};

export const ZONES_DEPLACEMENT = ['Z1', 'Z2', 'Z3', 'Z4', 'Z5', 'GD', 'GE'] as const;
export type ZoneDeplacement = (typeof ZONES_DEPLACEMENT)[number];

export const LIBELLES_ZONE: Record<ZoneDeplacement, string> = {
  Z1: 'Zone 1',
  Z2: 'Zone 2',
  Z3: 'Zone 3',
  Z4: 'Zone 4',
  Z5: 'Zone 5',
  GD: 'Grand déplacement',
  GE: 'GE',
};

// Énumérations M5.4
export const SEXES = ['M', 'F', 'NB'] as const;
export type Sexe = (typeof SEXES)[number];
export const LIBELLES_SEXE: Record<Sexe, string> = {
  M: 'Masculin',
  F: 'Féminin',
  NB: 'Non binaire',
};

export const SITUATIONS_FAMILIALES = [
  'celibataire',
  'marie',
  'pacse',
  'divorce',
  'veuf',
  'concubinage',
] as const;
export type SituationFamiliale = (typeof SITUATIONS_FAMILIALES)[number];
export const LIBELLES_SITUATION_FAMILIALE: Record<SituationFamiliale, string> = {
  celibataire: 'Célibataire',
  marie: 'Marié(e)',
  pacse: 'Pacsé(e)',
  divorce: 'Divorcé(e)',
  veuf: 'Veuf/veuve',
  concubinage: 'Concubinage',
};

export const CLASSIFICATIONS = ['ouvrier', 'etam', 'cadre', 'apprenti'] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
export const LIBELLES_CLASSIFICATION: Record<Classification, string> = {
  ouvrier: 'Ouvrier',
  etam: 'ETAM',
  cadre: 'Cadre',
  apprenti: 'Apprenti',
};

export const APTITUDES = [
  'apte',
  'apte_amenagement',
  'inapte_temporaire',
  'inapte',
] as const;
export type Aptitude = (typeof APTITUDES)[number];
export const LIBELLES_APTITUDE: Record<Aptitude, string> = {
  apte: 'Apte',
  apte_amenagement: 'Apte avec aménagement',
  inapte_temporaire: 'Inapte temporaire',
  inapte: 'Inapte',
};

const optionalCodePostalFR = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z.string().trim().regex(/^\d{5}$/, 'Code postal invalide (5 chiffres).'),
  ]),
);

const optionalSecu = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z.string().trim().regex(/^\d{13,15}$/, 'N° sécurité sociale invalide (13-15 chiffres).'),
  ]),
);

const optionalIban = z.preprocess(
  emptyToNull,
  z.union([
    z.null(),
    z
      .string()
      .trim()
      .transform((v) => v.replace(/\s+/g, '').toUpperCase())
      .pipe(
        z
          .string()
          .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]{1,30}$/, 'IBAN invalide.'),
      ),
  ]),
);

const optionalEntier = (min: number, max: number, label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return 0;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n < min || n > max || !Number.isInteger(n)) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} entre ${min} et ${max}.`,
        });
        return z.NEVER;
      }
      return n;
    });

export const employeSchema = z
  .object({
    // Identité métier
    nom: z.string().trim().min(2, 'Nom requis (2 caractères min).').max(100),
    prenom: z.string().trim().min(1, 'Prénom requis.').max(100),
    typeContrat: z.enum(TYPES_CONTRAT).default('CDI'),
    societeInterim: trimmedOptionalString(200),
    qualification: trimmedOptionalString(100),
    tauxHoraireBrut: optionalMontant,
    heuresHebdoContractuelles: z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
        if (Number.isNaN(n) || n < 0 || n > 60) {
          ctx.addIssue({
            code: 'custom',
            message: 'Heures hebdo entre 0 et 60.',
          });
          return z.NEVER;
        }
        return n.toFixed(2);
      })
      .default('39'),
    zoneDeplacementDefaut: z.preprocess(
      emptyToNull,
      z.union([z.null(), z.enum(ZONES_DEPLACEMENT)]),
    ),
    dateEntree: optionalDate,
    dateSortie: optionalDate,
    email: optionalEmail,
    telephoneMobile: trimmedOptionalString(30),
    telephoneFixe: trimmedOptionalString(30),
    actif: z.boolean().default(true),
    utilisateurId: z.preprocess(
      emptyToNull,
      z.union([z.null(), z.string().min(1)]),
    ),
    notes: trimmedOptionalString(2000),

    // Identité civile
    dateNaissance: optionalDate,
    lieuNaissance: trimmedOptionalString(100),
    nationalite: z.string().trim().min(2).max(50).default('Française'),
    numeroSecu: optionalSecu,
    sexe: z.preprocess(emptyToNull, z.union([z.null(), z.enum(SEXES)])),

    // Adresse perso
    adresseLigne1: trimmedOptionalString(200),
    adresseLigne2: trimmedOptionalString(200),
    codePostal: optionalCodePostalFR,
    ville: trimmedOptionalString(100),
    pays: z.string().trim().min(2).max(50).default('France'),

    // Contact urgence
    contactUrgenceNom: trimmedOptionalString(100),
    contactUrgenceTelephone: trimmedOptionalString(30),
    contactUrgenceRelation: trimmedOptionalString(50),

    // Famille
    situationFamiliale: z.preprocess(
      emptyToNull,
      z.union([z.null(), z.enum(SITUATIONS_FAMILIALES)]),
    ),
    nombreEnfants: optionalEntier(0, 20, 'Nombre d\'enfants').default(0),

    // Contrat avancé
    matricule: trimmedOptionalString(50),
    dateEmbauche: optionalDate,
    dateFinContrat: optionalDate,
    coefficientHierarchique: trimmedOptionalString(50),
    classification: z.preprocess(
      emptyToNull,
      z.union([z.null(), z.enum(CLASSIFICATIONS)]),
    ),
    salaireMensuelBrut: optionalMontant,
    conventionCollective: trimmedOptionalString(100),

    // Banque
    iban: optionalIban,
    bic: trimmedOptionalString(11),

    // Médical
    dateDerniereVisiteMedicale: optionalDate,
    dateProchaineVisiteMedicale: optionalDate,
    aptitude: z.preprocess(emptyToNull, z.union([z.null(), z.enum(APTITUDES)])),

    // Carte BTP
    numeroCarteBtp: trimmedOptionalString(30),
    dateValiditeCarteBtp: optionalDate,
  })
  .superRefine((val, ctx) => {
    if (val.typeContrat === 'INT' && !val.societeInterim) {
      ctx.addIssue({
        code: 'custom',
        path: ['societeInterim'],
        message: 'Société d\'intérim requise pour un contrat INT.',
      });
    }
    if (val.dateEntree && val.dateSortie && val.dateSortie < val.dateEntree) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateSortie'],
        message: 'Date de sortie antérieure à la date d\'entrée.',
      });
    }
    if (
      val.typeContrat === 'CDD' &&
      val.dateEmbauche &&
      val.dateFinContrat &&
      val.dateFinContrat < val.dateEmbauche
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateFinContrat'],
        message: 'Fin de contrat antérieure à l\'embauche.',
      });
    }
  });

export type EmployeInput = z.infer<typeof employeSchema>;

// ─────────────────────────────────────────────────────────────
// Habilitations
// ─────────────────────────────────────────────────────────────

export const TYPES_HABILITATION = [
  'caces_r482_a',
  'caces_r482_b',
  'caces_r482_c',
  'caces_r482_d',
  'caces_r482_e',
  'caces_r482_f',
  'caces_r482_g',
  'caces_r489_1a',
  'caces_r489_1b',
  'caces_r489_3',
  'caces_r489_5',
  'caces_r489_6',
  'aipr_concepteur',
  'aipr_encadrant',
  'aipr_operateur',
  'habilitation_b0',
  'habilitation_be_manoeuvre',
  'habilitation_b1v',
  'habilitation_b2v',
  'habilitation_br',
  'habilitation_bc',
  'habilitation_hf',
  'secouriste_sst',
  'autre',
] as const;
export type TypeHabilitation = (typeof TYPES_HABILITATION)[number];

export const LIBELLES_TYPE_HABILITATION: Record<TypeHabilitation, string> = {
  caces_r482_a: 'CACES R482 A (engins compacts)',
  caces_r482_b: 'CACES R482 B (engins de chantier)',
  caces_r482_c: 'CACES R482 C (chargeuses-pelleteuses)',
  caces_r482_d: 'CACES R482 D (compacteurs)',
  caces_r482_e: 'CACES R482 E (engins de transport)',
  caces_r482_f: 'CACES R482 F (chariots à conducteur porté)',
  caces_r482_g: 'CACES R482 G (déplacement / chargement)',
  caces_r489_1a: 'CACES R489 cat. 1A',
  caces_r489_1b: 'CACES R489 cat. 1B',
  caces_r489_3: 'CACES R489 cat. 3',
  caces_r489_5: 'CACES R489 cat. 5',
  caces_r489_6: 'CACES R489 cat. 6',
  aipr_concepteur: 'AIPR Concepteur',
  aipr_encadrant: 'AIPR Encadrant',
  aipr_operateur: 'AIPR Opérateur',
  habilitation_b0: 'Habilitation B0',
  habilitation_be_manoeuvre: 'Habilitation BE Manœuvre',
  habilitation_b1v: 'Habilitation B1V',
  habilitation_b2v: 'Habilitation B2V',
  habilitation_br: 'Habilitation BR',
  habilitation_bc: 'Habilitation BC',
  habilitation_hf: 'Habilitation H/F',
  secouriste_sst: 'Sauveteur Secouriste du Travail (SST)',
  autre: 'Autre',
};

export const habilitationSchema = z
  .object({
    type: z.enum(TYPES_HABILITATION),
    dateObtention: optionalDate,
    dateValidite: optionalDate,
    numero: trimmedOptionalString(50),
    organisme: trimmedOptionalString(100),
    notes: trimmedOptionalString(500),
  })
  .superRefine((val, ctx) => {
    if (
      val.dateObtention &&
      val.dateValidite &&
      val.dateValidite < val.dateObtention
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateValidite'],
        message: 'Date de validité antérieure à l\'obtention.',
      });
    }
  });
export type HabilitationInput = z.infer<typeof habilitationSchema>;

// ─────────────────────────────────────────────────────────────
// Permis
// ─────────────────────────────────────────────────────────────

export const CATEGORIES_PERMIS = [
  'B',
  'BE',
  'C',
  'C1',
  'C1E',
  'CE',
  'D',
  'D1',
  'D1E',
  'DE',
] as const;
export type CategoriePermis = (typeof CATEGORIES_PERMIS)[number];

export const LIBELLES_CATEGORIE_PERMIS: Record<CategoriePermis, string> = {
  B: 'B (voiture)',
  BE: 'BE (voiture + remorque)',
  C1: 'C1 (poids lourd léger ≤ 7,5t)',
  C1E: 'C1E (poids lourd léger + remorque)',
  C: 'C (poids lourd)',
  CE: 'CE (poids lourd + remorque / semi)',
  D1: 'D1 (transport personnes ≤ 16 places)',
  D1E: 'D1E (D1 + remorque)',
  D: 'D (autocar)',
  DE: 'DE (autocar + remorque)',
};

export const permisSchema = z
  .object({
    categorie: z.enum(CATEGORIES_PERMIS),
    dateObtention: optionalDate,
    dateValidite: optionalDate,
    numeroPermis: trimmedOptionalString(30),
    notes: trimmedOptionalString(500),
  })
  .superRefine((val, ctx) => {
    if (
      val.dateObtention &&
      val.dateValidite &&
      val.dateValidite < val.dateObtention
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['dateValidite'],
        message: 'Date de validité antérieure à l\'obtention.',
      });
    }
  });
export type PermisInput = z.infer<typeof permisSchema>;

// ─────────────────────────────────────────────────────────────
// Documents
// ─────────────────────────────────────────────────────────────

export const TYPES_DOCUMENT_EMPLOYE = [
  'cv',
  'photo',
  'contrat',
  'attestation_pole_emploi',
  'attestation_employeur',
  'carte_identite',
  'passeport',
  'titre_sejour',
  'justificatif_domicile',
  'rib',
  'carte_vitale',
  'carte_btp',
  'diplome',
  'certificat_medical',
  'autre',
] as const;
export type TypeDocumentEmploye = (typeof TYPES_DOCUMENT_EMPLOYE)[number];

export const LIBELLES_TYPE_DOCUMENT: Record<TypeDocumentEmploye, string> = {
  cv: 'CV',
  photo: 'Photo',
  contrat: 'Contrat de travail',
  attestation_pole_emploi: 'Attestation Pôle emploi',
  attestation_employeur: 'Attestation employeur précédent',
  carte_identite: "Carte d'identité",
  passeport: 'Passeport',
  titre_sejour: 'Titre de séjour',
  justificatif_domicile: 'Justificatif de domicile',
  rib: 'RIB',
  carte_vitale: 'Carte Vitale',
  carte_btp: 'Carte BTP',
  diplome: 'Diplôme / certificat',
  certificat_medical: 'Certificat médical',
  autre: 'Autre',
};

export const documentSchema = z.object({
  type: z.enum(TYPES_DOCUMENT_EMPLOYE),
  libelle: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1).max(200),
  tailleBytes: z
    .union([z.number(), z.string()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || v === '') return null;
      const n = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(n) || n <= 0) {
        ctx.addIssue({ code: 'custom', message: 'Taille invalide.' });
        return z.NEVER;
      }
      return n;
    }),
  minioKey: z.string().trim().min(1).max(500),
  dateValidite: optionalDate,
  notes: trimmedOptionalString(500),
});
export type DocumentInput = z.infer<typeof documentSchema>;

// ─────────────────────────────────────────────────────────────
// Pointages
// ─────────────────────────────────────────────────────────────

export const TYPES_POINTAGE = [
  'heures',
  'absence',
  'kg_acier_ha',
  'kg_acier_ts',
  'm3_beton_b16',
  'm3_beton_b25',
  'budget_heures',
  'budget_kg_acier_ha',
  'budget_kg_acier_ts',
  'budget_m3_beton_b16',
  'budget_m3_beton_b25',
  'pct_avancement_heures',
  'pct_avancement_acier_ha',
  'pct_avancement_acier_ts',
  'pct_avancement_beton_b16',
  'pct_avancement_beton_b25',
] as const;
export type TypePointage = (typeof TYPES_POINTAGE)[number];

export const LIBELLES_TYPE_POINTAGE: Record<TypePointage, string> = {
  heures: 'Heures',
  absence: 'Absence',
  kg_acier_ha: 'Acier HA (kg)',
  kg_acier_ts: 'Acier TS (kg)',
  m3_beton_b16: 'Béton B16 (m³)',
  m3_beton_b25: 'Béton B25 (m³)',
  budget_heures: 'Budget heures',
  budget_kg_acier_ha: 'Budget Acier HA (kg)',
  budget_kg_acier_ts: 'Budget Acier TS (kg)',
  budget_m3_beton_b16: 'Budget Béton B16 (m³)',
  budget_m3_beton_b25: 'Budget Béton B25 (m³)',
  pct_avancement_heures: '% av. heures',
  pct_avancement_acier_ha: '% av. Acier HA',
  pct_avancement_acier_ts: '% av. Acier TS',
  pct_avancement_beton_b16: '% av. Béton B16',
  pct_avancement_beton_b25: '% av. Béton B25',
};

export const MOTIFS_ABSENCE = [
  'conges_payes',
  'rtt',
  'maladie',
  'accident_travail',
  'formation',
  'jour_ferie',
  'autre',
  'vacances',
  'intemperie',
  'naissance',
  'mariage',
  'deces',
  'ecole',
  'spou',
  'jps',
  'entreprise',
] as const;
export type MotifAbsence = (typeof MOTIFS_ABSENCE)[number];

export const LIBELLES_MOTIF_ABSENCE: Record<MotifAbsence, string> = {
  conges_payes: 'Congés payés',
  rtt: 'RTT',
  maladie: 'Maladie',
  accident_travail: 'Accident travail',
  formation: 'Formation',
  jour_ferie: 'Jour férié',
  autre: 'Absence',
  vacances: 'Vacances',
  intemperie: 'Intempérie',
  naissance: 'Naissance',
  mariage: 'Mariage',
  deces: 'Décès',
  ecole: 'École',
  spou: 'SPOU',
  jps: 'JPS',
  entreprise: 'Entreprise',
};

/**
 * Motifs simplifiés proposés dans la matrice de saisie quotidienne.
 * (Les autres motifs restent dans l'enum complet pour les imports historiques.)
 */
export const MOTIFS_ABSENCE_MATRICE: readonly MotifAbsence[] = [
  'autre', // "Absence" générique
  'formation',
  'maladie',
  'entreprise',
  'ecole',
];

const quantitePositive = z.union([z.string(), z.number()]).transform((v, ctx) => {
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  if (Number.isNaN(n) || !Number.isFinite(n) || n <= 0) {
    ctx.addIssue({ code: 'custom', message: 'Quantité > 0 requise.' });
    return z.NEVER;
  }
  return n.toFixed(2);
});

/** Forme commune d'un pointage unitaire (réutilisée par le schéma de sync M5.5). */
const pointageObject = z.object({
  employeId: z.uuid('Employé invalide.'),
  chantierId: z.preprocess(emptyToNull, z.union([z.null(), z.uuid()])),
  chantierTacheId: z.preprocess(emptyToNull, z.union([z.null(), z.uuid()])),
  datePointage: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide.'),
  type: z.enum(TYPES_POINTAGE).default('heures'),
  quantite: quantitePositive,
  motifAbsence: z.preprocess(emptyToNull, z.union([z.null(), z.enum(MOTIFS_ABSENCE)])),
  zoneDeplacement: z.preprocess(emptyToNull, z.union([z.null(), z.enum(ZONES_DEPLACEMENT)])),
  panier: z.boolean().default(false),
  grandPanier: z.boolean().default(false),
  nuitPanierSoir: z.boolean().default(false),
  notes: trimmedOptionalString(500),
});

/** Cohérence absence ⟺ (pas de chantier + motif requis) — sinon l'inverse. */
const refinePointageCoherence = (
  val: { type: TypePointage; chantierId: string | null; motifAbsence: MotifAbsence | null },
  ctx: z.RefinementCtx,
) => {
  if (val.type === 'absence') {
    if (val.chantierId) {
      ctx.addIssue({ code: 'custom', path: ['chantierId'], message: 'Pas de chantier pour une absence.' });
    }
    if (!val.motifAbsence) {
      ctx.addIssue({ code: 'custom', path: ['motifAbsence'], message: 'Motif d\'absence requis.' });
    }
  } else {
    if (!val.chantierId) {
      ctx.addIssue({ code: 'custom', path: ['chantierId'], message: 'Chantier requis (sauf pour absence).' });
    }
    if (val.motifAbsence) {
      ctx.addIssue({ code: 'custom', path: ['motifAbsence'], message: 'Motif uniquement pour les absences.' });
    }
  }
};

export const pointageSchema = pointageObject.superRefine(refinePointageCoherence);

export type PointageInput = z.infer<typeof pointageSchema>;

/**
 * Schéma de **synchronisation offline** (M5.5). Identique au pointage unitaire,
 * plus `clientUuid` (UUID v7 généré côté terrain) qui sert d'idempotency key
 * serveur (`ON CONFLICT (client_uuid) DO NOTHING`). Cf. ADR-004.
 */
export const pointageSyncSchema = pointageObject
  .extend({
    clientUuid: z.uuid('client_uuid invalide.'),
  })
  .superRefine(refinePointageCoherence);

export type PointageSyncInput = z.infer<typeof pointageSyncSchema>;

// ─────────────────────────────────────────────────────────────
// Saisie matrice mensuelle
// ─────────────────────────────────────────────────────────────

/**
 * Une ligne de saisie : un couple (employé, chantier, type) avec ses heures
 * par jour du mois (clé = string '1'..'31', valeur = number ou null/undefined).
 *
 * Pour les absences, `chantierId` est null et `motifAbsence` requis.
 */
export const ligneMatriceSchema = z
  .object({
    employeId: z.uuid(),
    chantierId: z.preprocess(emptyToNull, z.union([z.null(), z.uuid()])),
    type: z.enum(TYPES_POINTAGE).default('heures'),
    motifAbsence: z.preprocess(
      emptyToNull,
      z.union([z.null(), z.enum(MOTIFS_ABSENCE)]),
    ),
    zoneDeplacement: z.preprocess(
      emptyToNull,
      z.union([z.null(), z.enum(ZONES_DEPLACEMENT)]),
    ),
    panier: z.boolean().default(false),
    grandPanier: z.boolean().default(false),
    nuitPanierSoir: z.boolean().default(false),
    // map du jour vers la quantité (ex: { '1': 8, '2': 8, '3': 4 })
    jours: z.record(
      z.string().regex(/^\d{1,2}$/),
      z.union([z.null(), z.number(), z.string()]),
    ),
  })
  .superRefine((val, ctx) => {
    if (val.type === 'absence') {
      if (val.chantierId) {
        ctx.addIssue({
          code: 'custom',
          path: ['chantierId'],
          message: 'Pas de chantier pour une absence.',
        });
      }
      if (!val.motifAbsence) {
        ctx.addIssue({
          code: 'custom',
          path: ['motifAbsence'],
          message: 'Motif requis.',
        });
      }
    } else if (!val.chantierId) {
      ctx.addIssue({
        code: 'custom',
        path: ['chantierId'],
        message: 'Chantier requis.',
      });
    }
  });
export type LigneMatriceInput = z.infer<typeof ligneMatriceSchema>;

export const matricePointageSchema = z.object({
  annee: z.number().int().min(2000).max(2100),
  mois: z.number().int().min(1).max(12),
  lignes: z.array(ligneMatriceSchema),
});
export type MatricePointageInput = z.infer<typeof matricePointageSchema>;
