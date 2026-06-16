import { z } from 'zod';

/**
 * Schemas Zod du module Flotte automobile.
 *
 * Couvre : activation (flag entreprise), parc véhicules, échéances réglementaires,
 * affectations, documents (GED), et les listes d'entretiens/sinistres/pleins (Phases 2-3).
 * Les valeurs d'enum sont maintenues en miroir de `db/schema/flotte.ts`.
 */

// ─────────────────────────────────────────────────────────────
// Activation du module (flag entreprise)
// ─────────────────────────────────────────────────────────────

export const flotteFlagSchema = z.object({ actif: z.boolean() });
export type FlotteFlagInput = z.infer<typeof flotteFlagSchema>;

// ─────────────────────────────────────────────────────────────
// Enums (listes partagées UI ↔ DB) + libellés FR
// ─────────────────────────────────────────────────────────────

export const TYPES_VEHICULE = ['vl', 'vu', 'pl', 'engin', 'remorque', 'deux_roues'] as const;
export type TypeVehicule = (typeof TYPES_VEHICULE)[number];
export const LIBELLES_TYPE_VEHICULE: Record<TypeVehicule, string> = {
  vl: 'Véhicule léger',
  vu: 'Utilitaire',
  pl: 'Poids lourd',
  engin: 'Engin de chantier',
  remorque: 'Remorque',
  deux_roues: 'Deux-roues',
};

export const CARBURANTS = [
  'essence',
  'diesel',
  'gnv',
  'electrique',
  'hybride',
  'hybride_rechargeable',
  'e85',
  'hydrogene',
] as const;
export type Carburant = (typeof CARBURANTS)[number];
export const LIBELLES_CARBURANT: Record<Carburant, string> = {
  essence: 'Essence',
  diesel: 'Diesel',
  gnv: 'GNV',
  electrique: 'Électrique',
  hybride: 'Hybride',
  hybride_rechargeable: 'Hybride rechargeable',
  e85: 'Superéthanol E85',
  hydrogene: 'Hydrogène',
};

export const STATUTS_VEHICULE = [
  'actif',
  'immobilise',
  'en_reparation',
  'vendu',
  'reforme',
  'vole_detruit',
] as const;
export type StatutVehicule = (typeof STATUTS_VEHICULE)[number];
export const LIBELLES_STATUT_VEHICULE: Record<StatutVehicule, string> = {
  actif: 'Actif',
  immobilise: 'Immobilisé',
  en_reparation: 'En réparation',
  vendu: 'Vendu',
  reforme: 'Réformé',
  vole_detruit: 'Volé / détruit',
};

/** Statuts marquant la sortie du parc (imposent une date de sortie). */
export const STATUTS_VEHICULE_SORTIE: readonly StatutVehicule[] = [
  'vendu',
  'reforme',
  'vole_detruit',
];

export const MODES_DETENTION = [
  'propriete',
  'lld',
  'loa',
  'credit_bail',
  'location_courte',
] as const;
export type ModeDetention = (typeof MODES_DETENTION)[number];
export const LIBELLES_MODE_DETENTION: Record<ModeDetention, string> = {
  propriete: 'Propriété',
  lld: 'Location longue durée (LLD)',
  loa: "Location avec option d'achat (LOA)",
  credit_bail: 'Crédit-bail',
  location_courte: 'Location courte durée',
};

export const TYPES_ECHEANCE = [
  'controle_technique',
  'controle_technique_pollution',
  'assurance',
  'carte_grise',
  'vignette_critair',
  'taxe_essieu',
  'extincteur',
  'chronotachygraphe',
  'revision_constructeur',
  'franchise_km',
] as const;
export type TypeEcheance = (typeof TYPES_ECHEANCE)[number];
export const LIBELLES_TYPE_ECHEANCE: Record<TypeEcheance, string> = {
  controle_technique: 'Contrôle technique',
  controle_technique_pollution: 'Contrôle technique pollution',
  assurance: 'Assurance',
  carte_grise: 'Carte grise',
  vignette_critair: "Vignette Crit'Air",
  taxe_essieu: 'Taxe à l’essieu',
  extincteur: 'Extincteur',
  chronotachygraphe: 'Chronotachygraphe',
  revision_constructeur: 'Révision constructeur',
  franchise_km: 'Franchise kilométrique',
};

export const STATUTS_AFFECTATION = ['prevue', 'en_cours', 'terminee', 'annulee'] as const;
export type StatutAffectation = (typeof STATUTS_AFFECTATION)[number];
export const LIBELLES_STATUT_AFFECTATION: Record<StatutAffectation, string> = {
  prevue: 'Prévue',
  en_cours: 'En cours',
  terminee: 'Terminée',
  annulee: 'Annulée',
};

export const TYPES_ENTRETIEN = [
  'revision',
  'vidange',
  'pneumatiques',
  'freinage',
  'reparation',
  'carrosserie',
  'controle_technique',
  'geometrie',
  'climatisation',
  'autre',
] as const;
export type TypeEntretien = (typeof TYPES_ENTRETIEN)[number];
export const LIBELLES_TYPE_ENTRETIEN: Record<TypeEntretien, string> = {
  revision: 'Révision',
  vidange: 'Vidange',
  pneumatiques: 'Pneumatiques',
  freinage: 'Freinage',
  reparation: 'Réparation',
  carrosserie: 'Carrosserie',
  controle_technique: 'Contrôle technique',
  geometrie: 'Géométrie / parallélisme',
  climatisation: 'Climatisation',
  autre: 'Autre',
};

export const RESPONSABILITES_SINISTRE = [
  'tort_total',
  'tort_partiel',
  'non_responsable',
  'indeterminee',
] as const;
export type ResponsabiliteSinistre = (typeof RESPONSABILITES_SINISTRE)[number];
export const LIBELLES_RESPONSABILITE_SINISTRE: Record<ResponsabiliteSinistre, string> = {
  tort_total: 'Tort total',
  tort_partiel: 'Tort partiel',
  non_responsable: 'Non responsable',
  indeterminee: 'Indéterminée',
};

export const TYPES_DOCUMENT_FLOTTE = [
  'carte_grise',
  'attestation_assurance',
  'pv_controle_technique',
  'facture_entretien',
  'constat_sinistre',
  'contrat_location',
  'certificat_cession',
  'photo',
  'autre',
] as const;
export type TypeDocumentFlotte = (typeof TYPES_DOCUMENT_FLOTTE)[number];
export const LIBELLES_TYPE_DOCUMENT_FLOTTE: Record<TypeDocumentFlotte, string> = {
  carte_grise: 'Carte grise',
  attestation_assurance: "Attestation d'assurance",
  pv_controle_technique: 'PV de contrôle technique',
  facture_entretien: "Facture d'entretien",
  constat_sinistre: 'Constat de sinistre',
  contrat_location: 'Contrat de location',
  certificat_cession: 'Certificat de cession',
  photo: 'Photo',
  autre: 'Autre',
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const texteOptionnel = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texte trop long (max ${max} caractères).`)
    .optional()
    .nullable()
    .transform((v) => (v && v.length > 0 ? v : null));

const dateOptionnelle = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

const dateRequise = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date invalide (YYYY-MM-DD).');

const uuidOptionnel = z
  .string()
  .trim()
  .uuid('Identifiant invalide.')
  .optional()
  .nullable()
  .transform((v) => (v && v.length > 0 ? v : null));

/** Montant € ≥ 0, normalisé en chaîne à 2 décimales (comme la facturation), ou null. */
const montantOptionnel = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} invalide.` });
        return null;
      }
      if (n < 0) {
        ctx.addIssue({ code: 'custom', message: `${label} ne peut être négatif.` });
        return null;
      }
      return n.toFixed(2);
    });

/** Entier optionnel ≥ min (et ≤ max), ou null si vide. */
const entierOptionnel = (label: string, opts: { min?: number; max?: number } = {}) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, ''));
      if (!Number.isInteger(n)) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être un entier.` });
        return null;
      }
      if (opts.min !== undefined && n < opts.min) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être ≥ ${opts.min}.` });
        return null;
      }
      if (opts.max !== undefined && n > opts.max) {
        ctx.addIssue({ code: 'custom', message: `${label} doit être ≤ ${opts.max}.` });
        return null;
      }
      return n;
    });

/** Kilométrage requis (défaut 0). */
const kilometrage = z
  .union([z.string(), z.number()])
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, ''));
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Kilométrage invalide (entier ≥ 0).' });
      return 0;
    }
    return n;
  });

const immatriculation = z
  .string()
  .trim()
  .min(2, 'Immatriculation trop courte.')
  .max(15, 'Immatriculation trop longue.')
  .transform((v) => v.toUpperCase());

/** Entier requis ≥ min (et ≤ max) — rejette une valeur vide (≠ `entierOptionnel`). */
const entierRequis = (label: string, opts: { min?: number; max?: number } = {}) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) {
      ctx.addIssue({ code: 'custom', message: `${label} requis.` });
      return 0;
    }
    const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, ''));
    if (!Number.isInteger(n)) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être un entier.` });
      return 0;
    }
    if (opts.min !== undefined && n < opts.min) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être ≥ ${opts.min}.` });
      return 0;
    }
    if (opts.max !== undefined && n > opts.max) {
      ctx.addIssue({ code: 'custom', message: `${label} doit être ≤ ${opts.max}.` });
      return 0;
    }
    return n;
  });

/** Quantité décimale strictement positive (volume en L, énergie en kWh…), normalisée à 2 décimales, ou null. */
const quantitePositiveOptionnelle = (label: string) =>
  z
    .union([z.string(), z.number()])
    .optional()
    .nullable()
    .transform((v, ctx) => {
      if (v === null || v === undefined || (typeof v === 'string' && v.trim() === '')) return null;
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, '').replace(',', '.'));
      if (Number.isNaN(n) || n <= 0) {
        ctx.addIssue({
          code: 'custom',
          message: `${label} doit être un nombre strictement positif.`,
        });
        return null;
      }
      return n.toFixed(2);
    });

// ─────────────────────────────────────────────────────────────
// Véhicule
// ─────────────────────────────────────────────────────────────

export const vehiculeSchema = z.object({
  id: z.string().uuid().optional(),
  immatriculation,
  codeInterne: texteOptionnel(32),
  typeVehicule: z.enum(TYPES_VEHICULE),
  marque: z.string().trim().min(1, 'Marque requise.').max(80, 'Marque trop longue.'),
  modele: z.string().trim().min(1, 'Modèle requis.').max(80, 'Modèle trop long.'),
  version: texteOptionnel(80),
  vin: texteOptionnel(17),
  carburant: z.enum(CARBURANTS),
  datePremiereImmat: dateOptionnelle,
  puissanceFiscale: entierOptionnel('Puissance fiscale', { min: 1, max: 99 }),
  critair: entierOptionnel("Crit'Air", { min: 0, max: 5 }),
  places: entierOptionnel('Nombre de places', { min: 1, max: 99 }),
  ptacKg: entierOptionnel('PTAC', { min: 0 }),
  couleur: texteOptionnel(40),
  modeDetention: z.enum(MODES_DETENTION),
  dateAcquisition: dateOptionnelle,
  prixAcquisitionHt: montantOptionnel("Prix d'acquisition"),
  valeurResiduelleHt: montantOptionnel('Valeur résiduelle'),
  loyerMensuelHt: montantOptionnel('Loyer mensuel'),
  organismeFinancement: texteOptionnel(120),
  kilometrageActuel: kilometrage,
  dateReleveKm: dateOptionnelle,
  conducteurPrincipalId: uuidOptionnel,
  statut: z.enum(STATUTS_VEHICULE).default('actif'),
  dateSortieParc: dateOptionnelle,
  prixReventeHt: montantOptionnel('Prix de revente'),
  notes: texteOptionnel(2000),
});
export type VehiculeInput = z.infer<typeof vehiculeSchema>;

// ─────────────────────────────────────────────────────────────
// Échéance
// ─────────────────────────────────────────────────────────────

export const echeanceSchema = z.object({
  id: z.string().uuid().optional(),
  vehiculeId: z.string().uuid('Véhicule invalide.'),
  typeEcheance: z.enum(TYPES_ECHEANCE),
  libelle: texteOptionnel(120),
  dateDebutValidite: dateOptionnelle,
  dateEcheance: dateRequise,
  seuilAlerteJours: z
    .union([z.string(), z.number()])
    .transform((v, ctx) => {
      const n = typeof v === 'number' ? v : Number(String(v).replace(/\s/g, ''));
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        ctx.addIssue({ code: 'custom', message: "Seuil d'alerte invalide (0–365)." });
        return 30;
      }
      return n;
    })
    .default(30),
  reference: texteOptionnel(120),
  prestataire: texteOptionnel(120),
  montantHt: montantOptionnel('Montant'),
  notes: texteOptionnel(1000),
});
export type EcheanceInput = z.infer<typeof echeanceSchema>;

// ─────────────────────────────────────────────────────────────
// Affectation
// ─────────────────────────────────────────────────────────────

export const affectationSchema = z
  .object({
    id: z.string().uuid().optional(),
    vehiculeId: z.string().uuid('Véhicule invalide.'),
    employeId: uuidOptionnel,
    chantierId: uuidOptionnel,
    statut: z.enum(STATUTS_AFFECTATION).default('en_cours'),
    dateDebut: dateRequise,
    dateFin: dateOptionnelle,
    kmDebut: entierOptionnel('Km début', { min: 0 }),
    kmFin: entierOptionnel('Km fin', { min: 0 }),
    motif: texteOptionnel(200),
    notes: texteOptionnel(1000),
  })
  .refine((v) => v.employeId !== null || v.chantierId !== null, {
    message: 'Renseignez au moins un conducteur ou un chantier.',
    path: ['employeId'],
  })
  .refine((v) => v.dateFin === null || v.dateFin >= v.dateDebut, {
    message: 'La date de fin doit être postérieure au début.',
    path: ['dateFin'],
  });
export type AffectationInput = z.infer<typeof affectationSchema>;

// ─────────────────────────────────────────────────────────────
// Document (métadonnées — le fichier vit en MinIO)
// ─────────────────────────────────────────────────────────────

export const documentVehiculeSchema = z.object({
  typeDocument: z.enum(TYPES_DOCUMENT_FLOTTE),
  libelle: z.string().trim().min(1, 'Libellé requis.').max(200, 'Libellé trop long.'),
  minioKey: z.string().trim().min(1).max(512),
  mimeType: z.string().trim().min(1).max(200),
  tailleBytes: z.number().int().positive().nullable().optional(),
  dateValidite: dateOptionnelle,
  notes: texteOptionnel(500),
  echeanceId: uuidOptionnel,
  entretienId: uuidOptionnel,
  sinistreId: uuidOptionnel,
});
export type DocumentVehiculeInput = z.infer<typeof documentVehiculeSchema>;

// ─────────────────────────────────────────────────────────────
// Entretien / maintenance (Phase 2)
// ─────────────────────────────────────────────────────────────

export const entretienSchema = z.object({
  id: z.string().uuid().optional(),
  vehiculeId: z.string().uuid('Véhicule invalide.'),
  typeEntretien: z.enum(TYPES_ENTRETIEN).default('revision'),
  dateEntretien: dateRequise,
  kilometrage: entierOptionnel('Kilométrage', { min: 0 }),
  description: z
    .string()
    .trim()
    .min(1, 'Description requise.')
    .max(500, 'Description trop longue.'),
  prestataire: texteOptionnel(120),
  fournisseurId: uuidOptionnel,
  coutHt: montantOptionnel('Coût HT'),
  coutTva: montantOptionnel('TVA'),
  coutTtc: montantOptionnel('Coût TTC'),
  prochaineEcheanceKm: entierOptionnel('Prochaine échéance (km)', { min: 0 }),
  prochaineEcheanceDate: dateOptionnelle,
  garantie: z.boolean().default(false),
  notes: texteOptionnel(1000),
});
export type EntretienInput = z.infer<typeof entretienSchema>;

// ─────────────────────────────────────────────────────────────
// Sinistre (Phase 3)
// ─────────────────────────────────────────────────────────────

export const sinistreSchema = z.object({
  id: z.string().uuid().optional(),
  vehiculeId: z.string().uuid('Véhicule invalide.'),
  employeId: uuidOptionnel,
  numeroSinistre: texteOptionnel(60),
  dateSinistre: dateRequise,
  lieu: texteOptionnel(200),
  description: texteOptionnel(1000),
  responsabilite: z.enum(RESPONSABILITES_SINISTRE).default('indeterminee'),
  tiersImplique: z.boolean().default(false),
  montantDommagesHt: montantOptionnel('Montant des dommages'),
  franchiseHt: montantOptionnel('Franchise'),
  indemnisationHt: montantOptionnel('Indemnisation'),
  clos: z.boolean().default(false),
  dateCloture: dateOptionnelle,
  notes: texteOptionnel(1000),
});
export type SinistreInput = z.infer<typeof sinistreSchema>;

// ─────────────────────────────────────────────────────────────
// Plein de carburant / recharge (Phase 3)
// ─────────────────────────────────────────────────────────────

export const pleinSchema = z
  .object({
    id: z.string().uuid().optional(),
    vehiculeId: z.string().uuid('Véhicule invalide.'),
    employeId: uuidOptionnel,
    datePlein: dateRequise,
    kilometrage: entierRequis('Kilométrage', { min: 0 }),
    volumeLitres: quantitePositiveOptionnelle('Volume'),
    energieKwh: quantitePositiveOptionnelle('Énergie'),
    prixHt: montantOptionnel('Prix HT'),
    prixTtc: montantOptionnel('Prix TTC'),
    pleinComplet: z.boolean().default(true),
    station: texteOptionnel(120),
    /** Stocké chiffré (bytea AES-256-GCM) côté DB. */
    numeroCarteCarburant: texteOptionnel(40),
    notes: texteOptionnel(500),
  })
  .refine((v) => v.volumeLitres !== null || v.energieKwh !== null, {
    message: 'Renseignez un volume (litres) ou une énergie (kWh).',
    path: ['volumeLitres'],
  });
export type PleinInput = z.infer<typeof pleinSchema>;
