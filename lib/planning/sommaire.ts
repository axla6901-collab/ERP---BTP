/**
 * Agrégation pure des tâches d'un chantier pour la liste/vue d'ensemble du
 * planning : avancement global pondéré + plage de dates (min début / max fin).
 *
 * Aucune dépendance React/DOM/Drizzle — 100% testable côté unitaire.
 *
 * Convention dates : strings ISO `AAAA-MM-JJ`, donc la comparaison
 * lexicographique suffit pour min/max (pas besoin de `dnum`).
 */

/** Une tâche, réduite aux champs utiles à l'agrégation. */
export type TacheAgregable = {
  chantierId: string;
  avancementPourcent: number;
  heuresPlanifiees: number;
  dateDebutPrevue: string | null;
  dateFinPrevue: string | null;
};

export type SommaireChantierAgrege = {
  nbTaches: number;
  /**
   * Avancement global (0-100) arrondi à l'entier. Moyenne pondérée par
   * `heuresPlanifiees` ; si toutes les tâches ont 0 h planifiée, fallback sur
   * la moyenne arithmétique simple. Toujours défini ici (≥ 1 tâche par entrée).
   */
  avancementPourcent: number;
  /** Plus petite `dateDebutPrevue` non nulle, ou `null` si aucune tâche datée. */
  dateMinTaches: string | null;
  /** Plus grande `dateFinPrevue` non nulle, ou `null` si aucune tâche datée. */
  dateMaxTaches: string | null;
};

/**
 * Regroupe les tâches par chantier et calcule, pour chacun, son nombre de
 * tâches, son avancement pondéré et sa plage de dates planifiées.
 *
 * Seuls les chantiers présents dans `taches` apparaissent dans la Map ; un
 * chantier sans tâche est donc absent (l'appelant retombe sur `null`/0).
 */
export function agregerSommaireChantiers(
  taches: ReadonlyArray<TacheAgregable>,
): Map<string, SommaireChantierAgrege> {
  type Acc = {
    nb: number;
    sommeAv: number;
    sommeAvxH: number;
    sommeH: number;
    dateMin: string | null;
    dateMax: string | null;
  };
  const parChantier = new Map<string, Acc>();

  for (const t of taches) {
    const acc =
      parChantier.get(t.chantierId) ??
      { nb: 0, sommeAv: 0, sommeAvxH: 0, sommeH: 0, dateMin: null, dateMax: null };
    acc.nb += 1;
    acc.sommeAv += t.avancementPourcent;
    acc.sommeAvxH += t.avancementPourcent * t.heuresPlanifiees;
    acc.sommeH += t.heuresPlanifiees;
    if (t.dateDebutPrevue && (acc.dateMin === null || t.dateDebutPrevue < acc.dateMin)) {
      acc.dateMin = t.dateDebutPrevue;
    }
    if (t.dateFinPrevue && (acc.dateMax === null || t.dateFinPrevue > acc.dateMax)) {
      acc.dateMax = t.dateFinPrevue;
    }
    parChantier.set(t.chantierId, acc);
  }

  const resultat = new Map<string, SommaireChantierAgrege>();
  for (const [chantierId, acc] of parChantier) {
    // Pondéré par heures si possible, sinon moyenne arithmétique simple.
    const brut = acc.sommeH > 0 ? acc.sommeAvxH / acc.sommeH : acc.sommeAv / acc.nb;
    resultat.set(chantierId, {
      nbTaches: acc.nb,
      avancementPourcent: Math.round(brut),
      dateMinTaches: acc.dateMin,
      dateMaxTaches: acc.dateMax,
    });
  }
  return resultat;
}
