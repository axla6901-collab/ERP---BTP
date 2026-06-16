/**
 * Calcul de consommation de la flotte (méthode « plein-à-plein »), pur et
 * déterministe — aucune dépendance Next/DB, testable en isolation (cf.
 * `lib/flotte/echeances.ts`).
 *
 * Principe : entre deux pleins *complets* successifs, le carburant ajouté à tous
 * les passages (intermédiaires inclus, jusqu'au second plein complet compris) a
 * exactement remplacé ce qui a été consommé sur la distance parcourue. On obtient
 * ainsi une consommation fiable (L/100 km, kWh/100 km) et un coût au km, sans
 * jamais avoir besoin du niveau de réservoir.
 *
 * Les montants/quantités arrivent en `string` (numeric Postgres) ou `number` ;
 * ils sont normalisés ici. Un plein non complet n'est pas une borne de segment :
 * sa quantité est cumulée dans le segment qui se referme au plein complet suivant.
 */

export type PleinPourConso = {
  id: string;
  datePlein: string;
  kilometrage: number;
  volumeLitres: string | number | null;
  energieKwh: string | number | null;
  prixHt: string | number | null;
  pleinComplet: boolean;
};

export type SegmentConso = {
  /** Plein complet fermant le segment. */
  pleinId: string;
  date: string;
  distanceKm: number;
  /** Carburant/énergie consommé sur le segment (somme des passages après l'ancre). */
  litres: number | null;
  kwh: number | null;
  coutHt: number;
  /** Litres pour 100 km, ou null si pas de volume sur le segment. */
  consoLitres100: number | null;
  /** kWh pour 100 km, ou null si pas d'énergie sur le segment. */
  consoKwh100: number | null;
  /** Coût HT au kilomètre. */
  coutKm: number;
};

export type SyntheseConsommation = {
  nbPleins: number;
  /** Dépense carburant totale (HT) sur l'ensemble des pleins. */
  coutTotalHt: number;
  /** Distance couverte par les segments plein-à-plein exploitables. */
  distanceKm: number;
  litresTotal: number;
  kwhTotal: number;
  /** Moyennes pondérées par la distance des segments (null si non calculable). */
  consoMoyenneLitres100: number | null;
  consoMoyenneKwh100: number | null;
  coutMoyenKm: number | null;
};

function nombre(v: string | number | null): number {
  if (v === null) return 0;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function arrondi(n: number, decimales: number): number {
  const f = 10 ** decimales;
  return Math.round(n * f) / f;
}

/**
 * Découpe la liste de pleins en segments plein-à-plein. Les pleins sont triés par
 * kilométrage croissant (départage par date) ; les segments à distance ≤ 0 (saisie
 * incohérente) sont ignorés.
 */
export function calculerSegments(pleins: ReadonlyArray<PleinPourConso>): SegmentConso[] {
  const tries = [...pleins].sort(
    (a, b) => a.kilometrage - b.kilometrage || a.datePlein.localeCompare(b.datePlein),
  );

  const segments: SegmentConso[] = [];
  // Ancre = dernier plein complet rencontré (début du segment courant).
  let ancre: PleinPourConso | null = null;
  let cumulLitres = 0;
  let cumulKwh = 0;
  let cumulCout = 0;
  let aDuVolume = false;
  let aDeLEnergie = false;

  for (const p of tries) {
    if (ancre === null) {
      // On démarre le premier segment au premier plein complet (réservoir connu plein).
      if (p.pleinComplet) ancre = p;
      continue;
    }

    // Cumule le carburant ajouté depuis l'ancre (ce plein inclus).
    if (p.volumeLitres !== null) {
      cumulLitres += nombre(p.volumeLitres);
      aDuVolume = true;
    }
    if (p.energieKwh !== null) {
      cumulKwh += nombre(p.energieKwh);
      aDeLEnergie = true;
    }
    cumulCout += nombre(p.prixHt);

    if (p.pleinComplet) {
      const distanceKm = p.kilometrage - ancre.kilometrage;
      if (distanceKm > 0) {
        const litres = aDuVolume ? arrondi(cumulLitres, 2) : null;
        const kwh = aDeLEnergie ? arrondi(cumulKwh, 2) : null;
        segments.push({
          pleinId: p.id,
          date: p.datePlein,
          distanceKm,
          litres,
          kwh,
          coutHt: arrondi(cumulCout, 2),
          consoLitres100: litres !== null ? arrondi((litres / distanceKm) * 100, 2) : null,
          consoKwh100: kwh !== null ? arrondi((kwh / distanceKm) * 100, 2) : null,
          coutKm: arrondi(cumulCout / distanceKm, 3),
        });
      }
      // Le plein complet devient la nouvelle ancre.
      ancre = p;
      cumulLitres = 0;
      cumulKwh = 0;
      cumulCout = 0;
      aDuVolume = false;
      aDeLEnergie = false;
    }
  }

  return segments;
}

/** Synthèse agrégée : dépense totale + moyennes pondérées par la distance des segments. */
export function syntheseConsommation(pleins: ReadonlyArray<PleinPourConso>): SyntheseConsommation {
  const coutTotalHt = arrondi(
    pleins.reduce((acc, p) => acc + nombre(p.prixHt), 0),
    2,
  );
  const segments = calculerSegments(pleins);

  // Moyennes pondérées : on n'additionne distance & quantités que sur les segments
  // qui portent la grandeur considérée (volume OU énergie).
  let distLitres = 0;
  let litresTotal = 0;
  let distKwh = 0;
  let kwhTotal = 0;
  let distCout = 0;
  let coutSegments = 0;
  let distanceKm = 0;

  for (const s of segments) {
    distanceKm += s.distanceKm;
    distCout += s.distanceKm;
    coutSegments += s.coutHt;
    if (s.litres !== null) {
      distLitres += s.distanceKm;
      litresTotal += s.litres;
    }
    if (s.kwh !== null) {
      distKwh += s.distanceKm;
      kwhTotal += s.kwh;
    }
  }

  return {
    nbPleins: pleins.length,
    coutTotalHt,
    distanceKm,
    litresTotal: arrondi(litresTotal, 2),
    kwhTotal: arrondi(kwhTotal, 2),
    consoMoyenneLitres100: distLitres > 0 ? arrondi((litresTotal / distLitres) * 100, 2) : null,
    consoMoyenneKwh100: distKwh > 0 ? arrondi((kwhTotal / distKwh) * 100, 2) : null,
    coutMoyenKm: distCout > 0 ? arrondi(coutSegments / distCout, 3) : null,
  };
}
