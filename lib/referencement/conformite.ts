import type {
  ModeControleDocument,
  NatureTiers,
  StatutDocumentTier,
} from '@/lib/validation/referencement-tiers';

/**
 * Logique pure de conformité documentaire des tiers (cœur des deux chevrons
 * « à jour » / « à relancer »). Aucune dépendance Next/DB → testable en isolation.
 *
 * Règle métier (FEB_Contrôle Artisans §II/§III) : un tier est « à relancer »
 * dès qu'au moins un de ses documents requis est manquant, expiré, en fin de
 * validité, refusé ou en attente de validation.
 */

/** Statut effectif d'un document requis pour un tier, calculé en direct. */
export type StatutLigneDocument =
  | 'manquant'
  | 'a_jour'
  | 'a_renouveler'
  | 'expire'
  | 'en_attente'
  | 'refuse';

export type ClasseConformite = 'a_jour' | 'a_relancer';

/** Forme minimale d'une nature de document (référentiel). */
export type NatureDocLite = {
  id: string;
  code: string;
  libelle: string;
  modeControle: ModeControleDocument;
  delaiValiditeJours: number | null;
  delaiRelanceJours: number | null;
};

/** Forme minimale du document le plus récent d'un tier pour une nature donnée. */
export type DocumentLite = {
  natureDocumentId: string;
  statut: StatutDocumentTier;
  dateFinValidite: string | null;
};

/** Une ligne de la matrice corps d'état × nature × document requis. */
export type MatriceLigne = {
  corpsEtatId: string;
  natureDocumentId: string;
  natureTiers: NatureTiers;
  estBloquant: boolean;
};

export type LigneConformite = {
  natureDocumentId: string;
  code: string;
  libelle: string;
  estBloquant: boolean;
  statut: StatutLigneDocument;
  dateFinValidite: string | null;
};

export type ConformiteTier = {
  classe: ClasseConformite;
  lignes: LigneConformite[];
  /** Nombre de lignes en problème (tout sauf `a_jour`). */
  nbProblemes: number;
};

/** Les statuts qui placent un tier dans le chevron « à relancer ». */
const STATUTS_PROBLEME: ReadonlySet<StatutLigneDocument> = new Set([
  'manquant',
  'a_renouveler',
  'expire',
  'en_attente',
  'refuse',
]);

function jourEnNombre(iso: string): number {
  return Date.parse(`${iso}T00:00:00Z`);
}

/** Nombre de jours entre `cible` et `ref` (positif si `cible` est dans le futur). */
function diffJours(cible: string, ref: string): number {
  return Math.round((jourEnNombre(cible) - jourEnNombre(ref)) / 86_400_000);
}

/**
 * Statut effectif d'un document requis. `doc` est le document le plus récent
 * du tier pour cette nature (ou `null` s'il n'en a aucun).
 *
 * - Les états de workflow `refuse` / `en_attente_validation` priment.
 * - Modes sans expiration (`case_a_cocher`, `date_obtention`) : présent ⇒ à jour.
 * - Modes datés (`duree_jours`, `date_fin_assurance`) : calcul live à partir de
 *   `date_fin_validite` et du délai de relance de la nature.
 */
export function statutDocument(
  doc: DocumentLite | null | undefined,
  nature: Pick<NatureDocLite, 'modeControle' | 'delaiRelanceJours'>,
  aujourdhui: string,
): StatutLigneDocument {
  if (!doc) return 'manquant';
  if (doc.statut === 'refuse') return 'refuse';
  if (doc.statut === 'en_attente_validation') return 'en_attente';

  if (nature.modeControle === 'case_a_cocher' || nature.modeControle === 'date_obtention') {
    return 'a_jour';
  }
  if (!doc.dateFinValidite) return 'a_jour';

  const joursRestants = diffJours(doc.dateFinValidite, aujourdhui);
  const seuilRelance = nature.delaiRelanceJours ?? 0;
  if (joursRestants < 0) return 'expire';
  if (joursRestants <= seuilRelance) return 'a_renouveler';
  return 'a_jour';
}

/**
 * Documents requis pour un tier = lignes de la matrice qui correspondent à sa
 * nature ET à l'un de ses corps d'état. Dédupliqué par nature de document
 * (`estBloquant` = vrai si au moins une ligne l'exige).
 */
export function documentsRequisTier(
  natureTiers: NatureTiers,
  corpsEtatIds: readonly string[],
  matrice: readonly MatriceLigne[],
): Array<{ natureDocumentId: string; estBloquant: boolean }> {
  const corpsSet = new Set(corpsEtatIds);
  const parNature = new Map<string, boolean>();
  for (const ligne of matrice) {
    if (ligne.natureTiers !== natureTiers) continue;
    if (!corpsSet.has(ligne.corpsEtatId)) continue;
    const dejaBloquant = parNature.get(ligne.natureDocumentId) ?? false;
    parNature.set(ligne.natureDocumentId, dejaBloquant || ligne.estBloquant);
  }
  return [...parNature.entries()].map(([natureDocumentId, estBloquant]) => ({
    natureDocumentId,
    estBloquant,
  }));
}

/**
 * Évalue la conformité complète d'un tier : pour chaque document requis, son
 * statut effectif, puis la classe globale (`a_jour` / `a_relancer`).
 *
 * Un tier sans corps d'état (donc sans document requis) est considéré à jour.
 */
export function evaluerConformiteTier(
  tier: { natureTiers: NatureTiers; corpsEtatIds: readonly string[] },
  matrice: readonly MatriceLigne[],
  naturesById: ReadonlyMap<string, NatureDocLite>,
  documentsByNature: ReadonlyMap<string, DocumentLite>,
  aujourdhui: string,
): ConformiteTier {
  const requis = documentsRequisTier(tier.natureTiers, tier.corpsEtatIds, matrice);

  const lignes: LigneConformite[] = requis.flatMap((r) => {
    const nature = naturesById.get(r.natureDocumentId);
    if (!nature) return [];
    const doc = documentsByNature.get(r.natureDocumentId) ?? null;
    return [
      {
        natureDocumentId: r.natureDocumentId,
        code: nature.code,
        libelle: nature.libelle,
        estBloquant: r.estBloquant,
        statut: statutDocument(doc, nature, aujourdhui),
        dateFinValidite: doc?.dateFinValidite ?? null,
      },
    ];
  });

  // Tri d'affichage stable : problèmes d'abord, puis par libellé.
  lignes.sort((a, b) => {
    const pa = STATUTS_PROBLEME.has(a.statut) ? 0 : 1;
    const pb = STATUTS_PROBLEME.has(b.statut) ? 0 : 1;
    if (pa !== pb) return pa - pb;
    return a.libelle.localeCompare(b.libelle, 'fr');
  });

  const nbProblemes = lignes.filter((l) => STATUTS_PROBLEME.has(l.statut)).length;
  return {
    classe: nbProblemes > 0 ? 'a_relancer' : 'a_jour',
    lignes,
    nbProblemes,
  };
}

/** Libellés FR des statuts de ligne (UI). */
export const LIBELLES_STATUT_LIGNE: Record<StatutLigneDocument, string> = {
  manquant: 'Manquant',
  a_jour: 'À jour',
  a_renouveler: 'À renouveler',
  expire: 'Expiré',
  en_attente: 'En attente de validation',
  refuse: 'Refusé',
};
