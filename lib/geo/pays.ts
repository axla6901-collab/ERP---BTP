/**
 * Désignations du pays « France » reconnues dans les champs `pays` saisis en
 * texte libre (défaut applicatif : 'France'). Miroir SQL : la liste
 * `('france', 'fr', 'fra')` des contraintes `chk_*_cp` (migration 0081).
 */
const DESIGNATIONS_FRANCE = new Set(['france', 'fr', 'fra']);

/**
 * Vrai si le pays désigne la France (casse, accents et espaces ignorés). Un
 * pays vide ou absent vaut France : c'est le défaut des adresses de l'ERP.
 * Sert à imposer le format de code postal français (5 chiffres) seulement
 * pour une adresse en France.
 */
export function estPaysFrance(pays: string | null | undefined): boolean {
  const normalise = (pays ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
  return normalise === '' || DESIGNATIONS_FRANCE.has(normalise);
}
