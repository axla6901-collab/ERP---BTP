import { addDays } from './gantt-utils';

/**
 * Liste les tâches successeurs (transitives) d'une tâche qui vient de se
 * déplacer, et calcule leur nouveau couple (start, end) en propageant le même
 * delta. Fonction PURE, sans I/O — utilisée côté client (drag/drop visuel) et
 * envoyée au serveur sous forme de batch d'updates.
 *
 * Convention :
 *   - `taches` est l'état courant (au moins id + predecesseur_id + dates).
 *   - `tacheId` est la tâche qui vient de bouger : elle est EXCLUE du résultat.
 *   - `deltaJours` est positif vers le futur, négatif vers le passé.
 *   - Une tâche successeur sans dates planifiées est ignorée (rien à décaler).
 *
 * Protection cycle : un `Set` `vus` empêche une boucle infinie si la DB
 * contient un cycle (impossible en pratique grâce au check côté serveur
 * `enregistrerTachePlanning`, mais on reste prudent).
 */

export type CascadeTacheRef = {
  id: string;
  predecesseurId: string | null;
  dateDebutPrevue: string | null;
  dateFinPrevue: string | null;
};

export type CascadeChange = {
  id: string;
  dateDebutPrevue: string;
  dateFinPrevue: string;
};

export function cascadeDelta(
  taches: ReadonlyArray<CascadeTacheRef>,
  tacheId: string,
  deltaJours: number,
): CascadeChange[] {
  if (deltaJours === 0) return [];

  // Index inverse : pred → [succ] (évite N² au sur les chaînes profondes).
  const successeursPar = new Map<string, CascadeTacheRef[]>();
  for (const t of taches) {
    if (!t.predecesseurId) continue;
    const liste = successeursPar.get(t.predecesseurId) ?? [];
    liste.push(t);
    successeursPar.set(t.predecesseurId, liste);
  }

  const changes: CascadeChange[] = [];
  const vus = new Set<string>([tacheId]);
  const aTraiter: string[] = [tacheId];

  while (aTraiter.length > 0) {
    const courant = aTraiter.shift()!;
    const succs = successeursPar.get(courant) ?? [];
    for (const s of succs) {
      if (vus.has(s.id)) continue;
      vus.add(s.id);
      if (s.dateDebutPrevue && s.dateFinPrevue) {
        changes.push({
          id: s.id,
          dateDebutPrevue: addDays(s.dateDebutPrevue, deltaJours),
          dateFinPrevue: addDays(s.dateFinPrevue, deltaJours),
        });
      }
      aTraiter.push(s.id);
    }
  }
  return changes;
}

/**
 * Détecte si poser `predecesseurId` sur `tacheId` créerait un cycle.
 * Utile côté client AVANT d'envoyer la requête (UX rapide).
 * Le serveur revalide de toute façon (cf. `enregistrerTachePlanning`).
 */
export function detecterCycle(
  taches: ReadonlyArray<CascadeTacheRef>,
  tacheId: string,
  candidatPredId: string,
): boolean {
  if (candidatPredId === tacheId) return true;
  const parId = new Map(taches.map((t) => [t.id, t]));
  const vus = new Set<string>([tacheId]);
  let courant: string | null = candidatPredId;
  for (let i = 0; i < 1000 && courant; i++) {
    if (vus.has(courant)) return true;
    vus.add(courant);
    const ref = parId.get(courant);
    courant = ref?.predecesseurId ?? null;
  }
  return false;
}
