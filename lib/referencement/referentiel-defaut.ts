import type { NatureTiers } from '@/lib/validation/referencement-tiers';

/**
 * Données par défaut du référentiel documentaire (FEB_Contrôle Artisans §II,
 * Tables 4 et 5). Module **pur** (pas de `server-only`) afin d'être réutilisable
 * par le seed serveur (`seed-referentiel.ts`) ET par les scripts de démo.
 */

export type ModeControle =
  | 'duree_jours'
  | 'date_fin_assurance'
  | 'case_a_cocher'
  | 'date_obtention';

export const NATURES_DOCUMENT_DEFAUT: ReadonlyArray<{
  code: string;
  libelle: string;
  modeControle: ModeControle;
  delaiValiditeJours: number | null;
  delaiRelanceJours: number | null;
  ordre: number;
}> = [
  {
    code: 'KBIS',
    libelle: 'K-bis',
    modeControle: 'duree_jours',
    delaiValiditeJours: 180,
    delaiRelanceJours: 10,
    ordre: 10,
  },
  {
    code: 'URSSAF',
    libelle: 'Attestation de vigilance (URSSAF)',
    modeControle: 'duree_jours',
    delaiValiditeJours: 90,
    delaiRelanceJours: 10,
    ordre: 20,
  },
  {
    code: 'ASSURANCE_RC',
    libelle: 'Assurance responsabilité civile',
    modeControle: 'date_fin_assurance',
    delaiValiditeJours: 15,
    delaiRelanceJours: 10,
    ordre: 30,
  },
  {
    code: 'ASSURANCE_DEC',
    libelle: 'Assurance décennale',
    modeControle: 'date_fin_assurance',
    delaiValiditeJours: 15,
    delaiRelanceJours: 10,
    ordre: 40,
  },
  {
    code: 'REGULARITE_FISCALE',
    libelle: 'Attestation de régularité fiscale',
    modeControle: 'duree_jours',
    delaiValiditeJours: 180,
    delaiRelanceJours: 10,
    ordre: 50,
  },
  {
    code: 'CONGES_PAYES',
    libelle: 'Attestation de congés payés',
    modeControle: 'duree_jours',
    delaiValiditeJours: 180,
    delaiRelanceJours: 10,
    ordre: 60,
  },
  {
    code: 'ATTESTATION_HONNEUR',
    libelle: "Attestation sur l'honneur",
    modeControle: 'duree_jours',
    delaiValiditeJours: 180,
    delaiRelanceJours: null,
    ordre: 70,
  },
  {
    code: 'PIECE_IDENTITE',
    libelle: "Pièce d'identité",
    modeControle: 'duree_jours',
    delaiValiditeJours: 5475,
    delaiRelanceJours: 30,
    ordre: 80,
  },
  {
    code: 'PPSPS',
    libelle: 'PPSPS',
    modeControle: 'case_a_cocher',
    delaiValiditeJours: null,
    delaiRelanceJours: null,
    ordre: 90,
  },
  {
    code: 'ATT_PERMEABILITE',
    libelle: 'Attestation de perméabilité',
    modeControle: 'date_obtention',
    delaiValiditeJours: null,
    delaiRelanceJours: null,
    ordre: 100,
  },
  {
    code: 'CARTE_PRO_CIP',
    libelle: 'Carte professionnelle (CIP)',
    modeControle: 'case_a_cocher',
    delaiValiditeJours: null,
    delaiRelanceJours: null,
    ordre: 110,
  },
  {
    code: 'CGV',
    libelle: 'Conditions générales de vente',
    modeControle: 'case_a_cocher',
    delaiValiditeJours: null,
    delaiRelanceJours: null,
    ordre: 120,
  },
  {
    code: 'CONTRAT',
    libelle: 'Contrat',
    modeControle: 'case_a_cocher',
    delaiValiditeJours: null,
    delaiRelanceJours: null,
    ordre: 130,
  },
];

export const CORPS_ETAT_DEFAUT: ReadonlyArray<{ code: string; libelle: string; ordre: number }> = [
  { code: 'GROS_OEUVRE', libelle: 'Gros œuvre', ordre: 10 },
  { code: 'CHARPENTE', libelle: 'Charpente', ordre: 20 },
  { code: 'ELECTRICITE', libelle: 'Électricité', ordre: 30 },
  { code: 'NETTOYAGE', libelle: 'Nettoyage', ordre: 40 },
  { code: 'MATERIAUX', libelle: 'Matériaux', ordre: 50 },
];

const NATURES_ARTISAN: NatureTiers[] = ['artisan', 'artisan_ae', 'fournisseur_artisan'];

/** Matrice corps d'état × nature de tier → documents requis (docx Table 5). */
export const MATRICE_REQUIS_DEFAUT: ReadonlyArray<{
  corps: string;
  natures: NatureTiers[];
  docs: string[];
}> = [
  {
    corps: 'GROS_OEUVRE',
    natures: NATURES_ARTISAN,
    docs: [
      'KBIS',
      'URSSAF',
      'ASSURANCE_RC',
      'ASSURANCE_DEC',
      'ATTESTATION_HONNEUR',
      'REGULARITE_FISCALE',
      'CONGES_PAYES',
    ],
  },
  { corps: 'GROS_OEUVRE', natures: ['fournisseur'], docs: ['KBIS'] },
  {
    corps: 'CHARPENTE',
    natures: NATURES_ARTISAN,
    docs: [
      'KBIS',
      'URSSAF',
      'ASSURANCE_RC',
      'ASSURANCE_DEC',
      'ATTESTATION_HONNEUR',
      'REGULARITE_FISCALE',
      'CONGES_PAYES',
    ],
  },
  {
    corps: 'ELECTRICITE',
    natures: NATURES_ARTISAN,
    docs: ['KBIS', 'URSSAF', 'ASSURANCE_RC', 'ATTESTATION_HONNEUR', 'REGULARITE_FISCALE'],
  },
  {
    corps: 'NETTOYAGE',
    natures: NATURES_ARTISAN,
    docs: [
      'KBIS',
      'URSSAF',
      'ASSURANCE_RC',
      'ATTESTATION_HONNEUR',
      'REGULARITE_FISCALE',
      'CONGES_PAYES',
    ],
  },
  { corps: 'MATERIAUX', natures: ['fournisseur', 'fournisseur_artisan'], docs: ['KBIS'] },
];
