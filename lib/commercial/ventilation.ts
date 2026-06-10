/**
 * Ventilation des postes internes sur les lignes visibles d'un devis.
 *
 * Calcul pur (sans DB) : étant donné les lignes du devis et la liste des
 * postes internes (avec leur portée + leurs poids éventuels), renvoie pour
 * chaque ligne le montant HT ventilé qui lui revient. Ce montant s'ajoute
 * au PU « nu » de la ligne pour obtenir le **PU effectif** affiché au client.
 *
 * Règles :
 *   - Si `portee = 'devis'` → la ventilation s'applique à toutes les lignes
 *     non-section qui ont une quantité > 0.
 *   - Si `portee = 'chapitre'` → la portée est limitée aux articles compris
 *     entre la ligne section indiquée par `chapitreIndex` et la section
 *     suivante (exclusive), ou la fin du devis.
 *   - Si la liste `repartitions` est vide → ventilation **uniforme**
 *     (poids implicite 1 sur toutes les lignes du scope).
 *   - Si la liste est non vide → seules les lignes listées participent,
 *     avec leur poids explicite (les autres lignes du scope reçoivent 0).
 *   - Un poids total <= 0 désactive le poste interne (sécurité).
 */

export type LigneVentilable = {
  /** Ordre dans le devis (même base que l'index de form). */
  ordre: number;
  type: 'section' | 'article_catalogue' | 'libre';
  quantite: string | null;
  prixUnitaireHt: string | null;
  remisePourcent: string | null;
};

export type PosteInterneVentilable = {
  montantHt: string;
  portee: 'devis' | 'chapitre';
  /** Index (`ordre`) de la ligne section qui délimite le chapitre.
   *  Ignoré si `portee = 'devis'`. */
  chapitreOrdre: number | null;
  /** Poids par ligne (`ordre` de la ligne → poids). Vide = uniforme. */
  repartitions: Array<{ ordreLigne: number; poids: string }>;
};

export type ApportVentilation = {
  /** Montant HT total ventilé sur cette ligne (somme sur tous les postes). */
  apportHt: number;
  /** PU effectif après ventilation (= PU nu + apport / qté). */
  prixUnitaireEffectifHt: number;
  /** Montant HT effectif = PU effectif × qté × (1 − remise %). */
  montantEffectifHt: number;
};

/**
 * Calcule la liste des articles d'un chapitre : tout ce qui suit la section
 * `chapitreOrdre` jusqu'à la prochaine section (exclusive).
 */
function articlesDuChapitre(
  lignes: LigneVentilable[],
  chapitreOrdre: number,
): LigneVentilable[] {
  const ordonne = [...lignes].sort((a, b) => a.ordre - b.ordre);
  const idx = ordonne.findIndex((l) => l.ordre === chapitreOrdre && l.type === 'section');
  if (idx === -1) return [];
  const res: LigneVentilable[] = [];
  for (let i = idx + 1; i < ordonne.length; i++) {
    const l = ordonne[i]!;
    if (l.type === 'section') break;
    if (estArticleVentilable(l)) res.push(l);
  }
  return res;
}

function estArticleVentilable(l: LigneVentilable): boolean {
  if (l.type === 'section') return false;
  const q = Number(l.quantite ?? 0);
  const pu = Number(l.prixUnitaireHt ?? 0);
  return Number.isFinite(q) && q > 0 && Number.isFinite(pu);
}

export function calculerVentilation(
  lignes: LigneVentilable[],
  postesInternes: PosteInterneVentilable[],
): Map<number, number> {
  const apports = new Map<number, number>();
  if (postesInternes.length === 0) return apports;

  for (const poste of postesInternes) {
    const scope =
      poste.portee === 'devis'
        ? lignes.filter(estArticleVentilable)
        : poste.chapitreOrdre !== null
          ? articlesDuChapitre(lignes, poste.chapitreOrdre)
          : [];
    if (scope.length === 0) continue;

    let poidsParLigne: Map<number, number>;
    if (poste.repartitions.length > 0) {
      poidsParLigne = new Map(
        poste.repartitions.map((r) => [r.ordreLigne, Number(r.poids)]),
      );
    } else {
      poidsParLigne = new Map(scope.map((l) => [l.ordre, 1]));
    }

    let totalPoids = 0;
    for (const l of scope) {
      const p = poidsParLigne.get(l.ordre) ?? 0;
      if (Number.isFinite(p) && p > 0) totalPoids += p;
    }
    if (totalPoids <= 0) continue;

    const montant = Number(poste.montantHt);
    if (!Number.isFinite(montant) || montant <= 0) continue;

    for (const l of scope) {
      const p = poidsParLigne.get(l.ordre) ?? 0;
      if (!Number.isFinite(p) || p <= 0) continue;
      const apport = (montant * p) / totalPoids;
      apports.set(l.ordre, (apports.get(l.ordre) ?? 0) + apport);
    }
  }
  return apports;
}

/**
 * Combine une ligne et son apport ventilé pour produire son PU et son
 * montant HT effectifs (= visibles au client après ventilation).
 */
export function calculerApportLigne(
  ligne: LigneVentilable,
  apportHt: number,
): ApportVentilation {
  const q = Number(ligne.quantite ?? 0);
  const pu = Number(ligne.prixUnitaireHt ?? 0);
  const remise = Number(ligne.remisePourcent ?? 0);
  if (
    ligne.type === 'section' ||
    !Number.isFinite(q) ||
    q <= 0 ||
    !Number.isFinite(pu)
  ) {
    return { apportHt: 0, prixUnitaireEffectifHt: 0, montantEffectifHt: 0 };
  }
  const apportParUnite = apportHt / q;
  const prixUnitaireEffectifHt = pu + apportParUnite;
  const montantBase = q * prixUnitaireEffectifHt;
  const montantEffectifHt = montantBase * (1 - remise / 100);
  return { apportHt, prixUnitaireEffectifHt, montantEffectifHt };
}

/**
 * Vrai si la portée pointe vers un index de section qui n'existe pas (ou
 * pointe vers une ligne non-section). Sert à valider les postes internes
 * avant insertion.
 */
export function chapitreInvalide(
  lignes: LigneVentilable[],
  chapitreOrdre: number,
): boolean {
  const cible = lignes.find((l) => l.ordre === chapitreOrdre);
  return !cible || cible.type !== 'section';
}
