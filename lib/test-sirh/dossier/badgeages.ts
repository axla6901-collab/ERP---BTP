/**
 * Regroupement hebdomadaire des badgeages d'un collaborateur (dossier) —
 * module PUR, testé par tests/unit/lib/test-sirh/dossier/badgeages.test.ts.
 */

import { ajouterJours, lundiDeLaSemaine, type IsoDate } from '../calendrier';

/** Champs minimaux d'un badgeage (compatible avec `BadgeageVue` du domaine Temps). */
export type BadgeageResume = {
  id: string;
  dateBadgeage: IsoDate;
  heureDebut: string;
  heureFin: string | null;
  pauseMinutes: number;
  /** Minutes travaillées (pause déduite) ; null si le badgeage est en cours. */
  minutes: number | null;
  enCours: boolean;
  valide: boolean;
  chantierLabel: string | null;
};

export type SemaineBadgeages<B extends BadgeageResume = BadgeageResume> = {
  lundi: IsoDate;
  dimanche: IsoDate;
  badgeages: B[];
  /** Total des minutes des badgeages terminés. */
  minutes: number;
  nbNonValides: number;
  nbEnCours: number;
};

/**
 * Regroupe par semaine (lundi → dimanche), semaines les plus récentes d'abord,
 * badgeages triés par date et heure décroissantes dans chaque semaine.
 */
export function regrouperParSemaine<B extends BadgeageResume>(
  badgeages: readonly B[],
): SemaineBadgeages<B>[] {
  const parLundi = new Map<IsoDate, B[]>();
  for (const b of badgeages) {
    const lundi = lundiDeLaSemaine(b.dateBadgeage);
    const liste = parLundi.get(lundi) ?? [];
    liste.push(b);
    parLundi.set(lundi, liste);
  }
  return [...parLundi.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([lundi, liste]) => {
      const tries = [...liste].sort(
        (x, y) =>
          y.dateBadgeage.localeCompare(x.dateBadgeage) || y.heureDebut.localeCompare(x.heureDebut),
      );
      return {
        lundi,
        dimanche: ajouterJours(lundi, 6),
        badgeages: tries,
        minutes: tries.reduce((acc, b) => acc + (b.minutes ?? 0), 0),
        nbNonValides: tries.filter((b) => !b.valide).length,
        nbEnCours: tries.filter((b) => b.enCours).length,
      };
    });
}
