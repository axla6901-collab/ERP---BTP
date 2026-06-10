/**
 * Modèle d'entrée neutre pour la génération Factur-X (EN 16931).
 *
 * Volontairement découplé de node-zugferd : `mapping.ts` transforme ce modèle
 * en l'objet attendu par la librairie (XML), et `pdf-template.tsx` le rend
 * visuellement. Un seul modèle sert donc le PDF, le XML et les tests.
 *
 * Valeurs monétaires = nombres en euros ; quantités = nombres. Le mapping gère
 * le formatage exigé par le XML. Les lignes « section » (titres) sont incluses
 * pour l'affichage PDF mais EXCLUES du XML par le mapping.
 */

export type FacturXEmetteur = {
  raisonSociale: string;
  siret: string | null;
  tvaIntracom: string | null;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
  iban: string | null;
  bic: string | null;
  rcs: string | null;
  formeJuridique: string | null;
  capitalSocial: string | null;
  codeApe: string | null;
};

export type FacturXAcheteur = {
  type: 'particulier' | 'professionnel';
  /** Nom d'affichage déjà composé (raison sociale OU « Prénom Nom »). */
  nom: string;
  siret: string | null;
  tvaIntra: string | null;
  adresseLigne1: string | null;
  adresseLigne2: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string;
};

export type FacturXLigne = {
  /** true pour un titre de section (affiché au PDF, exclu du XML). */
  estSection: boolean;
  designation: string;
  /** Référence catalogue vendeur (BT-155), optionnelle. */
  articleCode: string | null;
  /** null pour une section. */
  quantite: number | null;
  /** Unité telle que saisie au catalogue (« m² », « U », « h »…). */
  unite: string | null;
  /** Prix unitaire HT net (BT-146) ; null pour une section. */
  prixUnitaireHt: number | null;
  /** Montant HT de la ligne, net de la remise de ligne (BT-131) ; null section. */
  montantHt: number | null;
  /** Taux de TVA en pourcentage (BT-152) ; null pour une section. */
  tauxTva: number | null;
};

/** Une tranche de TVA (BG-23), nette de la remise globale. */
export type FacturXTva = {
  taux: number;
  base: number;
  montant: number;
};

export type FacturXModel = {
  numero: string;
  /** Date d'émission au format YYYY-MM-DD. */
  dateFacture: string;
  /** Date d'échéance YYYY-MM-DD, ou null. */
  dateEcheance: string | null;
  devise: string;
  /** Auto-liquidation TVA BTP (art. 283-2 nonies CGI) → catégorie « AE ». */
  autoLiquidation: boolean;
  objet: string | null;
  conditionsPaiement: string | null;
  mentionsLegales: string | null;
  /** Total HT net de remise globale (= base d'imposition, BT-109). */
  totalHt: number;
  totalTva: number;
  totalTtc: number;
  /** Montant de la remise globale (≥ 0) ventilé en allègement document (BG-20). */
  remiseGlobaleMontant: number;
  /** Retenue de garantie (≥ 0) — non déductible de la base TVA, cf. mapping. */
  retenueGarantieMontant: number;
  lignes: FacturXLigne[];
  tva: FacturXTva[];
  emetteur: FacturXEmetteur;
  acheteur: FacturXAcheteur;
};
