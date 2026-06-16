/**
 * Synthèse **dérivée** de la fiche sous-traitant (BTP, loi 75-1334) — calcul
 * **pur** (sans DB, sans `Date.now()`) alimentant le rail contextuel et les
 * pastilles du bandeau de la fiche (cf. maquette `gabarit-sous-traitant.html`).
 *
 *   - `calculerSyntheseConformite` : note les **4 piliers** de conformité
 *     (décennale, attestation URSSAF, agrément DC4, qualifications) et en déduit
 *     le niveau global — le **pire pilier** pilote le libellé (Conforme /
 *     Vigilance / Non conforme), comme la légende de la maquette. **Source unique** :
 *     décennale, URSSAF et DC4 sont dérivés des **pièces** de la zone Vigilance
 *     (cf. maquette : « la conformité n'est plus saisie », elle vit dans le tableau
 *     des pièces) ; seules les qualifications restent un champ propre de la fiche.
 *   - `calculerRangCascade` : rang d'un sous-traitant dans la cascade (loi
 *     75-1334, 3 niveaux max), en remontant la chaîne `parentStId`.
 *   - `decrireEvenementSousTraitant` : libellé lisible d'une entrée d'audit_log.
 *
 * La synthèse est *cohérente* avec le repli léger de
 * [[verifierConformiteSousTraitant]] (`lib/sous-traitance/conformite-st.ts`) :
 * décennale et URSSAF restent les piliers bloquants ; DC4 et qualifications
 * sont des piliers de vigilance (non bloquants pour le contrat).
 */

import {
  STATUT_SOUS_TRAITANT_LABELS,
  type StatutSousTraitant,
  type TypeDocumentTier,
} from '@/lib/validation/tiers';

// ─────────────────────────────────────────────────────────────
// Constantes métier
// ─────────────────────────────────────────────────────────────

/** Profondeur maximale de sous-traitance en chaîne (loi 75-1334). */
export const MAX_NIVEAUX_CASCADE = 3;
/** Fenêtre « expire bientôt » d'une pièce datée (décennale, URSSAF…). */
const JOURS_EXPIRE_BIENTOT = 30;

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

/** Vert / ambre / rouge : pièce à jour, en vigilance, ou manquante/expirée. */
export type StatutPilier = 'ok' | 'attention' | 'manquant';
export type NiveauConformite = 'conforme' | 'vigilance' | 'non_conforme';

export type PilierConformite = {
  cle: 'decennale' | 'urssaf' | 'dc4' | 'qualifications';
  libelle: string;
  statut: StatutPilier;
  detail: string;
};

export type SyntheseConformite = {
  niveau: NiveauConformite;
  /** « Conforme » / « Vigilance » / « Non conforme ». */
  label: string;
  /** Nombre de piliers à jour (statut `ok`). */
  piliersAJour: number;
  /** Toujours 4. */
  total: number;
  piliers: PilierConformite[];
  /** Messages d'alerte (échéances proches / dépassées) pour la carte du rail. */
  alertes: string[];
};

/**
 * Pièce administrative pertinente pour la conformité (sous-ensemble de
 * `DocumentTier`). `dateValidite` est l'échéance (YYYY-MM-DD) ou `null` si la
 * pièce n'en porte pas (ex. RIB, contrat).
 */
export type DocumentConformite = {
  type: TypeDocumentTier;
  dateValidite: string | null;
};

export type SyntheseConformiteInput = {
  /** Pièces administratives de la fiche (zone Vigilance) — source de la conformité. */
  documents: DocumentConformite[];
  /** Qualifications libres (Qualibat, RGE…), seul pilier resté un champ de la fiche. */
  qualifications: string[];
};

export type RangCascade = {
  /** Rang dans la chaîne (1 = donneur d'ordre direct, sans parent ST). */
  rang: number;
  /** Profondeur légale maximale (3). */
  max: number;
  /** true si la chaîne dépasse la limite légale. */
  depassement: boolean;
};

// ─────────────────────────────────────────────────────────────
// Utilitaires dates (purs)
// ─────────────────────────────────────────────────────────────

function ajouterJours(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Nombre de jours de `aIso` (inclus) à `bIso` ; négatif si `bIso` est passé. */
function joursEntre(aIso: string, bIso: string): number {
  const a = new Date(`${aIso}T00:00:00Z`).getTime();
  const b = new Date(`${bIso}T00:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Date ISO (YYYY-MM-DD) → JJ/MM/AAAA, ou la chaîne brute si non parsable. */
export function formaterDateFr(iso: string | null): string {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// ─────────────────────────────────────────────────────────────
// Piliers de conformité
// ─────────────────────────────────────────────────────────────

/**
 * Pilier dérivé d'une **attestation datée** (décennale, URSSAF) : la pièce porte
 * une échéance (`dateValidite`). Absente ou expirée ⇒ `manquant` (pilier
 * bloquant) ; échéance dans < 30 j ⇒ `attention` ; sinon `ok`. Une pièce fournie
 * sans échéance renseignée est considérée à jour.
 */
function pilierAttestation(
  cle: 'decennale' | 'urssaf',
  libelle: string,
  doc: DocumentConformite | undefined,
  today: string,
): PilierConformite {
  if (!doc) {
    return { cle, libelle, statut: 'manquant', detail: 'Pièce absente' };
  }
  const echeance = doc.dateValidite;
  if (!echeance) {
    return { cle, libelle, statut: 'ok', detail: 'Fournie' };
  }
  if (echeance < today) {
    return { cle, libelle, statut: 'manquant', detail: `Expirée le ${formaterDateFr(echeance)}` };
  }
  if (echeance <= ajouterJours(today, JOURS_EXPIRE_BIENTOT)) {
    return { cle, libelle, statut: 'attention', detail: `Expire le ${formaterDateFr(echeance)}` };
  }
  return { cle, libelle, statut: 'ok', detail: `Valide jusqu'au ${formaterDateFr(echeance)}` };
}

/**
 * Pilier DC4 (acte spécial) : dérivé de la présence d'un contrat de
 * sous-traitance signé (pièce `contrat_sous_traitance`). Non bloquant (vigilance).
 */
function pilierDc4(present: boolean): PilierConformite {
  return {
    cle: 'dc4',
    libelle: 'Agrément DC4',
    statut: present ? 'ok' : 'attention',
    detail: present ? 'Signé' : 'Acte spécial non fourni',
  };
}

function pilierQualifications(qualifications: string[]): PilierConformite {
  const n = qualifications.length;
  return {
    cle: 'qualifications',
    libelle: 'Qualifications',
    statut: n >= 1 ? 'ok' : 'attention',
    detail: n >= 1 ? `${n} renseignée${n > 1 ? 's' : ''}` : 'Aucune qualification',
  };
}

// ─────────────────────────────────────────────────────────────
// Synthèse globale
// ─────────────────────────────────────────────────────────────

const LABEL_NIVEAU: Record<NiveauConformite, string> = {
  conforme: 'Conforme',
  vigilance: 'Vigilance',
  non_conforme: 'Non conforme',
};

/**
 * Synthèse de conformité (4 piliers). Le pire pilier pilote le niveau global :
 * un pilier `manquant` ⇒ « Non conforme », sinon un `attention` ⇒ « Vigilance »,
 * sinon « Conforme ». `piliersAJour` compte les piliers `ok` (libellé « x/4 »).
 */
export function calculerSyntheseConformite(
  input: SyntheseConformiteInput,
  today: string,
): SyntheseConformite {
  const docDecennale = input.documents.find((d) => d.type === 'assurance_decennale');
  const docUrssaf = input.documents.find((d) => d.type === 'attestation_urssaf');
  const aContrat = input.documents.some((d) => d.type === 'contrat_sous_traitance');

  const piliers: PilierConformite[] = [
    pilierAttestation('decennale', 'Décennale', docDecennale, today),
    pilierAttestation('urssaf', 'Attestation URSSAF', docUrssaf, today),
    pilierDc4(aContrat),
    pilierQualifications(input.qualifications),
  ];

  const alertes: string[] = [];
  for (const [doc, libelle] of [
    [docDecennale, 'Décennale'],
    [docUrssaf, 'Attestation URSSAF'],
  ] as const) {
    const echeance = doc?.dateValidite;
    if (!echeance) continue;
    if (echeance < today) {
      alertes.push(`${libelle} expirée le ${formaterDateFr(echeance)} — à renouveler.`);
    } else if (echeance <= ajouterJours(today, JOURS_EXPIRE_BIENTOT)) {
      alertes.push(
        `${libelle} expire le ${formaterDateFr(echeance)} (dans ${joursEntre(today, echeance)} j) — à renouveler.`,
      );
    }
  }

  const niveau: NiveauConformite = piliers.some((p) => p.statut === 'manquant')
    ? 'non_conforme'
    : piliers.some((p) => p.statut === 'attention')
      ? 'vigilance'
      : 'conforme';

  return {
    niveau,
    label: LABEL_NIVEAU[niveau],
    piliersAJour: piliers.filter((p) => p.statut === 'ok').length,
    total: piliers.length,
    piliers,
    alertes,
  };
}

// ─────────────────────────────────────────────────────────────
// Rang de cascade
// ─────────────────────────────────────────────────────────────

/**
 * Rang d'un sous-traitant dans la cascade : 1 + nombre d'ancêtres atteints en
 * remontant `parentStId`. Robuste aux cycles (borne dure à `MAX_NIVEAUX_CASCADE
 * + 1` itérations ; le trigger SQL `trg_st_anti_cycle` reste le garde-fou réel).
 */
export function calculerRangCascade(
  id: string,
  parentParId: Map<string, string | null>,
): RangCascade {
  let rang = 1;
  let courant = parentParId.get(id) ?? null;
  const vus = new Set<string>([id]);
  while (courant && !vus.has(courant) && rang <= MAX_NIVEAUX_CASCADE + 1) {
    rang += 1;
    vus.add(courant);
    courant = parentParId.get(courant) ?? null;
  }
  return { rang, max: MAX_NIVEAUX_CASCADE, depassement: rang > MAX_NIVEAUX_CASCADE };
}

// ─────────────────────────────────────────────────────────────
// Libellé d'événement d'audit
// ─────────────────────────────────────────────────────────────

type LigneAuditPartielle = {
  action: 'insert' | 'update' | 'delete';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
};

/**
 * Libellé lisible d'une entrée `audit_log` de la table `sous_traitants` pour la
 * timeline du rail. Pour un `update`, on détecte le changement saillant
 * (activation, statut d'agrément, parent de cascade) sinon « Modification ».
 */
export function decrireEvenementSousTraitant(ligne: LigneAuditPartielle): string {
  if (ligne.action === 'insert') return 'Sous-traitant créé';
  if (ligne.action === 'delete') return 'Sous-traitant supprimé';

  const before = ligne.before ?? {};
  const after = ligne.after ?? {};

  if ('actif' in after && before.actif !== after.actif) {
    return after.actif ? 'Réactivation' : 'Désactivation';
  }
  if ('statut' in after && before.statut !== after.statut) {
    const statut = after.statut as StatutSousTraitant;
    return `Statut d'agrément → ${STATUT_SOUS_TRAITANT_LABELS[statut] ?? statut}`;
  }
  if ('parentStId' in after && before.parentStId !== after.parentStId) {
    return after.parentStId ? 'Parent de cascade modifié' : 'Sorti de la cascade';
  }
  return 'Modification';
}
