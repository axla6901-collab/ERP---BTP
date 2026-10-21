/**
 * Ligne hiérarchique (manager) — fonctions PURES.
 *
 * `sirh_collaborateurs.manager_id` interdit seulement l'auto-référence (CHECK) :
 * les boucles plus longues (A → B → A) sont refusées en applicatif.
 */

/**
 * Désigner `managerId` comme manager de `employeId` crée-t-il une boucle ?
 * `managers` associe chaque employé à son manager actuel. On remonte la chaîne
 * depuis le futur manager : retomber sur `employeId` = boucle. Une boucle
 * préexistante qui ne passe pas par `employeId` n'est pas imputée à ce choix.
 */
export function creeUnCycleHierarchique(
  employeId: string,
  managerId: string | null,
  managers: ReadonlyMap<string, string | null>,
): boolean {
  if (!managerId) return false;
  const vus = new Set<string>();
  let courant: string | null = managerId;
  while (courant) {
    if (courant === employeId) return true;
    if (vus.has(courant)) return false;
    vus.add(courant);
    courant = managers.get(courant) ?? null;
  }
  return false;
}
