/**
 * Caviardage des champs sensibles dans `audit_log.before/after`.
 *
 * Les colonnes chiffrées en base (cf. lib/crypto/encrypted-column.ts) sont
 * relues EN CLAIR par l'application (déchiffrement transparent). Sans ce filtre,
 * un snapshot `before`/`after` recopierait ce clair dans le JSONB de l'audit —
 * faisant de la table d'audit un vecteur d'exfiltration (audit sécurité B1).
 *
 * Les clés sont en camelCase : `before` provient d'un `$inferSelect` Drizzle et
 * `after` d'un `parsed.data` Zod, tous deux en camelCase.
 */

/** Champs à masquer dans l'audit, par table. Aligné sur les colonnes chiffrées. */
export const CHAMPS_SENSIBLES_PAR_TABLE: Record<string, readonly string[]> = {
  employes: ['numeroSecu', 'iban', 'bic', 'salaireMensuelBrut', 'tauxHoraireBrut'],
  entreprises: ['iban', 'bic'],
};

/** Valeur de remplacement stockée à la place du clair dans l'audit. */
export const MARQUEUR_CAVIARDAGE = '[chiffré]';

/**
 * Renvoie une copie de `payload` dont les champs sensibles de `tableName` sont
 * remplacés par {@link MARQUEUR_CAVIARDAGE}. Les valeurs null/undefined et les
 * champs absents sont laissés tels quels (pas de bruit dans le diff d'audit).
 * Si rien n'est à masquer, renvoie l'objet d'origine (pas de copie inutile).
 */
export function caviarderChampsSensibles(tableName: string, payload: unknown): unknown {
  const champs = CHAMPS_SENSIBLES_PAR_TABLE[tableName];
  if (!champs || payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const source = payload as Record<string, unknown>;
  let copie: Record<string, unknown> | null = null;
  for (const champ of champs) {
    if (champ in source && source[champ] !== null && source[champ] !== undefined) {
      copie ??= { ...source };
      copie[champ] = MARQUEUR_CAVIARDAGE;
    }
  }
  return copie ?? payload;
}
