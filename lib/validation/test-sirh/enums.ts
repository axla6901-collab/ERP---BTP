/**
 * Énumérations du module Test SIRH : listes partagées UI ↔ DB + libellés FR.
 *
 * Miroir EXACT des `pgEnum` de `db/schema/test-sirh.ts` (migration 0078) —
 * garanti par `tests/unit/lib/validation/test-sirh/enums.test.ts`.
 * Toute valeur ajoutée ici doit l'être aussi dans la migration et le schéma.
 */

// ── Organisation ────────────────────────────────────────────────────────────

export const TYPES_SITE = [
  'siege',
  'agence',
  'depot',
  'atelier',
  'bureau_chantier',
  'autre',
] as const;
export type TypeSite = (typeof TYPES_SITE)[number];
export const LIBELLES_TYPE_SITE: Record<TypeSite, string> = {
  siege: 'Siège',
  agence: 'Agence',
  depot: 'Dépôt',
  atelier: 'Atelier',
  bureau_chantier: 'Bureau de chantier',
  autre: 'Autre',
};

/** Miroir de l'enum existant `classification_employe` (module RH). */
export const CATEGORIES_PROFESSIONNELLES = ['ouvrier', 'etam', 'cadre', 'apprenti'] as const;
export type CategorieProfessionnelle = (typeof CATEGORIES_PROFESSIONNELLES)[number];
export const LIBELLES_CATEGORIE_PROFESSIONNELLE: Record<CategorieProfessionnelle, string> = {
  ouvrier: 'Ouvrier',
  etam: 'ETAM',
  cadre: 'Cadre',
  apprenti: 'Apprenti',
};

// ── Contrats ────────────────────────────────────────────────────────────────

export const TYPES_CONTRAT = [
  'cdi',
  'cdd',
  'cdi_chantier',
  'interim',
  'apprentissage',
  'professionnalisation',
  'stage',
  'saisonnier',
  'autre',
] as const;
export type TypeContratSirh = (typeof TYPES_CONTRAT)[number];
export const LIBELLES_TYPE_CONTRAT: Record<TypeContratSirh, string> = {
  cdi: 'CDI',
  cdd: 'CDD',
  cdi_chantier: 'CDI de chantier / d’opération',
  interim: 'Intérim',
  apprentissage: 'Contrat d’apprentissage',
  professionnalisation: 'Contrat de professionnalisation',
  stage: 'Stage',
  saisonnier: 'Saisonnier',
  autre: 'Autre',
};
/** Types à durée déterminée : date de fin attendue. */
export const TYPES_CONTRAT_A_TERME: readonly TypeContratSirh[] = [
  'cdd',
  'interim',
  'apprentissage',
  'professionnalisation',
  'stage',
  'saisonnier',
];

export const TEMPS_TRAVAIL = ['temps_plein', 'temps_partiel', 'forfait_jours'] as const;
export type TempsTravail = (typeof TEMPS_TRAVAIL)[number];
export const LIBELLES_TEMPS_TRAVAIL: Record<TempsTravail, string> = {
  temps_plein: 'Temps plein',
  temps_partiel: 'Temps partiel',
  forfait_jours: 'Forfait jours',
};

export const MOTIFS_FIN_CONTRAT = [
  'fin_cdd',
  'fin_chantier',
  'demission',
  'licenciement',
  'rupture_conventionnelle',
  'fin_periode_essai',
  'retraite',
  'deces',
  'mutation',
  'autre',
] as const;
export type MotifFinContrat = (typeof MOTIFS_FIN_CONTRAT)[number];
export const LIBELLES_MOTIF_FIN_CONTRAT: Record<MotifFinContrat, string> = {
  fin_cdd: 'Fin de CDD',
  fin_chantier: 'Fin de chantier / d’opération',
  demission: 'Démission',
  licenciement: 'Licenciement',
  rupture_conventionnelle: 'Rupture conventionnelle',
  fin_periode_essai: 'Rupture de période d’essai',
  retraite: 'Départ à la retraite',
  deces: 'Décès',
  mutation: 'Mutation (autre société du groupe)',
  autre: 'Autre',
};

// ── Paie ────────────────────────────────────────────────────────────────────

export const STATUTS_PERIODE_PAIE = ['ouverte', 'en_controle', 'cloturee'] as const;
export type StatutPeriodePaie = (typeof STATUTS_PERIODE_PAIE)[number];
export const LIBELLES_STATUT_PERIODE_PAIE: Record<StatutPeriodePaie, string> = {
  ouverte: 'Ouverte',
  en_controle: 'En contrôle',
  cloturee: 'Clôturée',
};

export const TYPES_VARIABLE_PAIE = [
  'prime',
  'heures_supplementaires',
  'indemnite',
  'avance',
  'acompte',
  'retenue',
  'avantage_nature',
  'remboursement_frais',
  'absence',
  'autre',
] as const;
export type TypeVariablePaie = (typeof TYPES_VARIABLE_PAIE)[number];
export const LIBELLES_TYPE_VARIABLE_PAIE: Record<TypeVariablePaie, string> = {
  prime: 'Prime',
  heures_supplementaires: 'Heures supplémentaires',
  indemnite: 'Indemnité',
  avance: 'Avance',
  acompte: 'Acompte',
  retenue: 'Retenue',
  avantage_nature: 'Avantage en nature',
  remboursement_frais: 'Remboursement de frais',
  absence: 'Absence',
  autre: 'Autre',
};

export const SOURCES_VARIABLE = ['manuelle', 'absence', 'heures_sup', 'note_frais'] as const;
export type SourceVariable = (typeof SOURCES_VARIABLE)[number];
export const LIBELLES_SOURCE_VARIABLE: Record<SourceVariable, string> = {
  manuelle: 'Saisie manuelle',
  absence: 'Absence validée',
  heures_sup: 'Heures sup. validées',
  note_frais: 'Note de frais validée',
};

// ── Absences ────────────────────────────────────────────────────────────────

export const CATEGORIES_ABSENCE = [
  'conges',
  'maladie',
  'familial',
  'formation',
  'sans_solde',
  'intemperies',
  'autre',
] as const;
export type CategorieAbsence = (typeof CATEGORIES_ABSENCE)[number];
export const LIBELLES_CATEGORIE_ABSENCE: Record<CategorieAbsence, string> = {
  conges: 'Congés',
  maladie: 'Maladie / accident',
  familial: 'Événement familial',
  formation: 'Formation',
  sans_solde: 'Sans solde',
  intemperies: 'Intempéries',
  autre: 'Autre',
};

export const UNITES_DECOMPTE = [
  'jours_ouvrables',
  'jours_ouvres',
  'jours_calendaires',
  'heures',
] as const;
export type UniteDecompte = (typeof UNITES_DECOMPTE)[number];
export const LIBELLES_UNITE_DECOMPTE: Record<UniteDecompte, string> = {
  jours_ouvrables: 'Jours ouvrables (lun.–sam.)',
  jours_ouvres: 'Jours ouvrés (lun.–ven.)',
  jours_calendaires: 'Jours calendaires',
  heures: 'Heures',
};

/** Statut commun aux demandes (absences, heures supplémentaires). */
export const STATUTS_DEMANDE = [
  'brouillon',
  'en_attente',
  'approuvee',
  'refusee',
  'annulee',
] as const;
export type StatutDemande = (typeof STATUTS_DEMANDE)[number];
export const LIBELLES_STATUT_DEMANDE: Record<StatutDemande, string> = {
  brouillon: 'Brouillon',
  en_attente: 'En attente',
  approuvee: 'Approuvée',
  refusee: 'Refusée',
  annulee: 'Annulée',
};
/** Statuts « actifs » : occupent le calendrier et bloquent un chevauchement. */
export const STATUTS_DEMANDE_ACTIFS: readonly StatutDemande[] = ['en_attente', 'approuvee'];

// ── Temps de travail ────────────────────────────────────────────────────────

export const LIEUX_TRAVAIL = [
  'chantier',
  'atelier',
  'bureau',
  'teletravail',
  'deplacement',
] as const;
export type LieuTravail = (typeof LIEUX_TRAVAIL)[number];
export const LIBELLES_LIEU_TRAVAIL: Record<LieuTravail, string> = {
  chantier: 'Chantier',
  atelier: 'Atelier / dépôt',
  bureau: 'Bureau',
  teletravail: 'Télétravail',
  deplacement: 'Déplacement',
};

export const SOURCES_BADGEAGE = ['manuel', 'mobile', 'badgeuse', 'import'] as const;
export type SourceBadgeage = (typeof SOURCES_BADGEAGE)[number];
export const LIBELLES_SOURCE_BADGEAGE: Record<SourceBadgeage, string> = {
  manuel: 'Saisie manuelle',
  mobile: 'Mobile',
  badgeuse: 'Badgeuse',
  import: 'Import',
};

export const COMPENSATIONS_HS = ['paiement', 'recuperation'] as const;
export type CompensationHs = (typeof COMPENSATIONS_HS)[number];
export const LIBELLES_COMPENSATION_HS: Record<CompensationHs, string> = {
  paiement: 'Payées (majorées)',
  recuperation: 'Récupérées (repos compensateur)',
};

/** Taux de majoration autorisés (CHECK `chk_sirh_heures_sup_majoration`). */
export const MAJORATIONS_HS = [0, 10, 25, 50, 100] as const;
export type MajorationHs = (typeof MAJORATIONS_HS)[number];

// ── Notes de frais ──────────────────────────────────────────────────────────

export const NATURES_FRAIS = ['depense', 'indemnite_km', 'forfait'] as const;
export type NatureFrais = (typeof NATURES_FRAIS)[number];
export const LIBELLES_NATURE_FRAIS: Record<NatureFrais, string> = {
  depense: 'Dépense sur justificatif',
  indemnite_km: 'Indemnités kilométriques',
  forfait: 'Forfait (panier, déplacement…)',
};

export const CATEGORIES_FRAIS = [
  'repas',
  'hebergement',
  'transport',
  'carburant',
  'peage_parking',
  'fournitures',
  'telephone',
  'panier',
  'grand_deplacement',
  'autre',
] as const;
export type CategorieFrais = (typeof CATEGORIES_FRAIS)[number];
export const LIBELLES_CATEGORIE_FRAIS: Record<CategorieFrais, string> = {
  repas: 'Repas',
  hebergement: 'Hébergement',
  transport: 'Transport (train, avion…)',
  carburant: 'Carburant',
  peage_parking: 'Péage / parking',
  fournitures: 'Fournitures',
  telephone: 'Téléphone / internet',
  panier: 'Indemnité de panier',
  grand_deplacement: 'Grand déplacement',
  autre: 'Autre',
};

export const STATUTS_FRAIS = [
  'brouillon',
  'soumise',
  'approuvee',
  'refusee',
  'remboursee',
] as const;
export type StatutFrais = (typeof STATUTS_FRAIS)[number];
export const LIBELLES_STATUT_FRAIS: Record<StatutFrais, string> = {
  brouillon: 'Brouillon',
  soumise: 'Soumise',
  approuvee: 'Approuvée',
  refusee: 'Refusée',
  remboursee: 'Remboursée',
};

// ── Recrutement ─────────────────────────────────────────────────────────────

export const STATUTS_OFFRE = ['brouillon', 'publiee', 'suspendue', 'pourvue', 'fermee'] as const;
export type StatutOffre = (typeof STATUTS_OFFRE)[number];
export const LIBELLES_STATUT_OFFRE: Record<StatutOffre, string> = {
  brouillon: 'Brouillon',
  publiee: 'Publiée',
  suspendue: 'Suspendue',
  pourvue: 'Pourvue',
  fermee: 'Fermée',
};

export const SOURCES_CANDIDAT = [
  'candidature_spontanee',
  'site_carriere',
  'france_travail',
  'job_board',
  'reseaux_sociaux',
  'cooptation',
  'ecole',
  'interim',
  'autre',
] as const;
export type SourceCandidat = (typeof SOURCES_CANDIDAT)[number];
export const LIBELLES_SOURCE_CANDIDAT: Record<SourceCandidat, string> = {
  candidature_spontanee: 'Candidature spontanée',
  site_carriere: 'Site carrière',
  france_travail: 'France Travail',
  job_board: 'Job board',
  reseaux_sociaux: 'Réseaux sociaux',
  cooptation: 'Cooptation',
  ecole: 'École / CFA',
  interim: 'Agence d’intérim',
  autre: 'Autre',
};

export const ETAPES_CANDIDATURE = [
  'nouvelle',
  'preselection',
  'entretien_rh',
  'entretien_technique',
  'proposition',
  'embauche',
  'refusee',
  'desistement',
] as const;
export type EtapeCandidature = (typeof ETAPES_CANDIDATURE)[number];
export const LIBELLES_ETAPE_CANDIDATURE: Record<EtapeCandidature, string> = {
  nouvelle: 'Nouvelle',
  preselection: 'Présélection',
  entretien_rh: 'Entretien RH',
  entretien_technique: 'Entretien technique',
  proposition: 'Proposition',
  embauche: 'Embauché·e',
  refusee: 'Refusée',
  desistement: 'Désistement',
};
/** Étapes du pipeline actif (colonnes du kanban), dans l'ordre. */
export const ETAPES_PIPELINE: readonly EtapeCandidature[] = [
  'nouvelle',
  'preselection',
  'entretien_rh',
  'entretien_technique',
  'proposition',
];
/** Étapes terminales (candidature close). */
export const ETAPES_CLOSES: readonly EtapeCandidature[] = ['embauche', 'refusee', 'desistement'];

export const MOTIFS_REFUS = [
  'profil_inadequat',
  'experience_insuffisante',
  'pretentions_salariales',
  'poste_pourvu',
  'desistement_candidat',
  'autre',
] as const;
export type MotifRefus = (typeof MOTIFS_REFUS)[number];
export const LIBELLES_MOTIF_REFUS: Record<MotifRefus, string> = {
  profil_inadequat: 'Profil inadéquat',
  experience_insuffisante: 'Expérience insuffisante',
  pretentions_salariales: 'Prétentions salariales',
  poste_pourvu: 'Poste pourvu',
  desistement_candidat: 'Désistement du candidat',
  autre: 'Autre',
};

export const AVIS_RECRUTEMENT = ['favorable', 'reserve', 'defavorable'] as const;
export type AvisRecrutement = (typeof AVIS_RECRUTEMENT)[number];
export const LIBELLES_AVIS_RECRUTEMENT: Record<AvisRecrutement, string> = {
  favorable: 'Favorable',
  reserve: 'Réservé',
  defavorable: 'Défavorable',
};

// ── Entretiens & performance ────────────────────────────────────────────────

export const TYPES_ENTRETIEN = [
  'annuel',
  'professionnel',
  'fin_periode_essai',
  'mi_annee',
  'bilan_6_ans',
  'autre',
] as const;
export type TypeEntretien = (typeof TYPES_ENTRETIEN)[number];
export const LIBELLES_TYPE_ENTRETIEN: Record<TypeEntretien, string> = {
  annuel: 'Entretien annuel d’évaluation',
  professionnel: 'Entretien professionnel (tous les 2 ans)',
  fin_periode_essai: 'Bilan de fin de période d’essai',
  mi_annee: 'Point de mi-année',
  bilan_6_ans: 'État des lieux récapitulatif (6 ans)',
  autre: 'Autre',
};

export const STATUTS_CAMPAGNE = ['brouillon', 'en_cours', 'cloturee'] as const;
export type StatutCampagne = (typeof STATUTS_CAMPAGNE)[number];
export const LIBELLES_STATUT_CAMPAGNE: Record<StatutCampagne, string> = {
  brouillon: 'Brouillon',
  en_cours: 'En cours',
  cloturee: 'Clôturée',
};

export const STATUTS_ENTRETIEN = ['a_planifier', 'planifie', 'realise', 'signe', 'annule'] as const;
export type StatutEntretien = (typeof STATUTS_ENTRETIEN)[number];
export const LIBELLES_STATUT_ENTRETIEN: Record<StatutEntretien, string> = {
  a_planifier: 'À planifier',
  planifie: 'Planifié',
  realise: 'Réalisé',
  signe: 'Signé',
  annule: 'Annulé',
};

export const STATUTS_OBJECTIF = [
  'en_cours',
  'atteint',
  'partiellement_atteint',
  'non_atteint',
  'abandonne',
] as const;
export type StatutObjectif = (typeof STATUTS_OBJECTIF)[number];
export const LIBELLES_STATUT_OBJECTIF: Record<StatutObjectif, string> = {
  en_cours: 'En cours',
  atteint: 'Atteint',
  partiellement_atteint: 'Partiellement atteint',
  non_atteint: 'Non atteint',
  abandonne: 'Abandonné',
};

// ── Formation ───────────────────────────────────────────────────────────────

export const CATEGORIES_FORMATION = [
  'securite',
  'technique',
  'reglementaire',
  'management',
  'bureautique',
  'langues',
  'autre',
] as const;
export type CategorieFormation = (typeof CATEGORIES_FORMATION)[number];
export const LIBELLES_CATEGORIE_FORMATION: Record<CategorieFormation, string> = {
  securite: 'Sécurité',
  technique: 'Technique / métier',
  reglementaire: 'Réglementaire (CACES, habilitations…)',
  management: 'Management',
  bureautique: 'Bureautique / numérique',
  langues: 'Langues',
  autre: 'Autre',
};

export const MODALITES_FORMATION = ['presentiel', 'distanciel', 'mixte', 'interne'] as const;
export type ModaliteFormation = (typeof MODALITES_FORMATION)[number];
export const LIBELLES_MODALITE_FORMATION: Record<ModaliteFormation, string> = {
  presentiel: 'Présentiel',
  distanciel: 'Distanciel',
  mixte: 'Mixte',
  interne: 'Formation interne',
};

export const STATUTS_SESSION = ['planifiee', 'confirmee', 'realisee', 'annulee'] as const;
export type StatutSession = (typeof STATUTS_SESSION)[number];
export const LIBELLES_STATUT_SESSION: Record<StatutSession, string> = {
  planifiee: 'Planifiée',
  confirmee: 'Confirmée',
  realisee: 'Réalisée',
  annulee: 'Annulée',
};

export const STATUTS_INSCRIPTION = ['inscrit', 'present', 'absent', 'annule'] as const;
export type StatutInscription = (typeof STATUTS_INSCRIPTION)[number];
export const LIBELLES_STATUT_INSCRIPTION: Record<StatutInscription, string> = {
  inscrit: 'Inscrit·e',
  present: 'Présent·e',
  absent: 'Absent·e',
  annule: 'Annulé',
};

export const RESULTATS_FORMATION = ['non_evalue', 'reussi', 'echoue'] as const;
export type ResultatFormation = (typeof RESULTATS_FORMATION)[number];
export const LIBELLES_RESULTAT_FORMATION: Record<ResultatFormation, string> = {
  non_evalue: 'Non évalué',
  reussi: 'Réussi',
  echoue: 'Échoué',
};

// ── Onboarding / processus ──────────────────────────────────────────────────

export const TYPES_PROCESSUS = ['onboarding', 'offboarding', 'mobilite', 'autre'] as const;
export type TypeProcessus = (typeof TYPES_PROCESSUS)[number];
export const LIBELLES_TYPE_PROCESSUS: Record<TypeProcessus, string> = {
  onboarding: 'Intégration (onboarding)',
  offboarding: 'Départ (offboarding)',
  mobilite: 'Mobilité interne',
  autre: 'Autre',
};

export const RESPONSABLES_TACHE = ['rh', 'manager', 'salarie', 'it', 'autre'] as const;
export type ResponsableTache = (typeof RESPONSABLES_TACHE)[number];
export const LIBELLES_RESPONSABLE_TACHE: Record<ResponsableTache, string> = {
  rh: 'RH',
  manager: 'Manager',
  salarie: 'Salarié·e',
  it: 'Informatique',
  autre: 'Autre',
};

export const STATUTS_PROCESSUS = ['en_cours', 'termine', 'annule'] as const;
export type StatutProcessus = (typeof STATUTS_PROCESSUS)[number];
export const LIBELLES_STATUT_PROCESSUS: Record<StatutProcessus, string> = {
  en_cours: 'En cours',
  termine: 'Terminé',
  annule: 'Annulé',
};

export const STATUTS_TACHE = ['a_faire', 'en_cours', 'faite', 'annulee'] as const;
export type StatutTache = (typeof STATUTS_TACHE)[number];
export const LIBELLES_STATUT_TACHE: Record<StatutTache, string> = {
  a_faire: 'À faire',
  en_cours: 'En cours',
  faite: 'Faite',
  annulee: 'Annulée',
};

// ── Matériel ────────────────────────────────────────────────────────────────

export const CATEGORIES_MATERIEL = [
  'informatique',
  'telephonie',
  'epi',
  'outillage',
  'badge_cle',
  'vetement',
  'autre',
] as const;
export type CategorieMateriel = (typeof CATEGORIES_MATERIEL)[number];
export const LIBELLES_CATEGORIE_MATERIEL: Record<CategorieMateriel, string> = {
  informatique: 'Informatique',
  telephonie: 'Téléphonie',
  epi: 'EPI (protection individuelle)',
  outillage: 'Outillage',
  badge_cle: 'Badge / clé',
  vetement: 'Vêtement de travail',
  autre: 'Autre',
};

export const STATUTS_MATERIEL = [
  'en_stock',
  'attribue',
  'en_reparation',
  'perdu',
  'reforme',
] as const;
export type StatutMateriel = (typeof STATUTS_MATERIEL)[number];
export const LIBELLES_STATUT_MATERIEL: Record<StatutMateriel, string> = {
  en_stock: 'En stock',
  attribue: 'Attribué',
  en_reparation: 'En réparation',
  perdu: 'Perdu / volé',
  reforme: 'Réformé',
};

// ── Annonces ────────────────────────────────────────────────────────────────

export const CATEGORIES_ANNONCE = ['information', 'securite', 'evenement', 'rh', 'autre'] as const;
export type CategorieAnnonce = (typeof CATEGORIES_ANNONCE)[number];
export const LIBELLES_CATEGORIE_ANNONCE: Record<CategorieAnnonce, string> = {
  information: 'Information',
  securite: 'Sécurité',
  evenement: 'Événement',
  rh: 'RH',
  autre: 'Autre',
};
