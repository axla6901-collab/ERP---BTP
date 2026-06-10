/**
 * Garde-fou métier : un tiers (client, fournisseur, sous-traitant) — ou toute
 * entité référençable — ne peut être supprimé que s'il n'apparaît nulle part
 * ailleurs (devis, factures, chantiers, grilles tarifaires, prix négociés…).
 *
 * Module **pur** : pas d'I/O, importable côté client comme serveur et testable
 * sans base. Les Server Actions comptent les références (une requête `COUNT`
 * par relation) puis délèguent ici la construction du message de blocage.
 */

export type CompteurReference = {
  /** Nombre d'enregistrements référençant l'entité (toutes lignes, archivées comprises). */
  nombre: number;
  /** Libellé au singulier, sans le nombre. Ex. `'devis'`, `'facture'`, `'chantier'`. */
  singulier: string;
  /** Libellé au pluriel. Ex. `'devis'`, `'factures'`, `'chantiers'`. */
  pluriel: string;
};

/** Joint une énumération à la française : `"a"`, `"a et b"`, `"a, b et c"`. */
export function joindreEnumerationFr(parties: readonly string[]): string {
  if (parties.length === 0) return '';
  if (parties.length === 1) return parties[0]!;
  return `${parties.slice(0, -1).join(', ')} et ${parties[parties.length - 1]!}`;
}

/**
 * Construit le message de blocage si l'entité est encore référencée, sinon
 * retourne `null` (suppression autorisée).
 *
 * @param sujet      Désignation au masculin singulier, accordée avec « référencé ».
 *                   Ex. `'ce client'`, `'ce fournisseur'`, `'ce sous-traitant'`.
 * @param compteurs  Nombre de références par relation. Les compteurs nuls sont ignorés.
 */
export function messageBlocageSuppression(
  sujet: string,
  compteurs: readonly CompteurReference[],
): string | null {
  const parties = compteurs
    .filter((c) => c.nombre > 0)
    .map((c) => `${c.nombre} ${c.nombre > 1 ? c.pluriel : c.singulier}`);

  if (parties.length === 0) return null;

  return (
    `Suppression impossible : ${sujet} est référencé par ${joindreEnumerationFr(parties)}. ` +
    `Désactivez-le plutôt si vous ne l'utilisez plus.`
  );
}
